import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { LdapSyncService } from '../ldap/ldap-sync.service';
import {
  ScheduledEmailService,
  getCalendarDateInTZ,
} from '../email/scheduled-email.service';
import { PointagesService } from '../pointages/pointages.service';

const REMINDER_START_HOUR = 17;
const REMINDER_START_MINUTE = 25;
const REMINDER_WINDOW_MINUTES = 10;

@Injectable()
export class SchedulerService implements OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private reminderInterval: NodeJS.Timeout | null = null;
  private lastEmailRunByJobId = new Map<string, string>();
  // Clé "YYYY-M-D" du dernier jour où l'auto-close a été exécuté. Permet de
  // déclencher dès que l'heure est atteinte ou dépassée, sans jamais rater la
  // minute cible à cause d'un drift du tick @Interval.
  private lastAutoCloseDate = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: WebsocketGateway,
    private readonly ldapSync: LdapSyncService,
    private readonly emailService: ScheduledEmailService,
    private readonly pointagesService: PointagesService,
  ) {}

  onModuleDestroy() {
    if (this.reminderInterval) {
      clearInterval(this.reminderInterval);
    }
  }

  // ── Reminder départ — fenêtre de 10 min à 17h25 ──────────────────────────

  @Cron(`${REMINDER_START_MINUTE} ${REMINDER_START_HOUR} * * *`)
  async startExitReminderWindow() {
    this.logger.log('[pointage-exit-reminder] fenêtre démarrée');
    await this.sendExitReminder();

    if (this.reminderInterval) return;
    const windowEnd = Date.now() + REMINDER_WINDOW_MINUTES * 60_000;

    this.reminderInterval = setInterval(() => {
      if (Date.now() >= windowEnd) {
        clearInterval(this.reminderInterval!);
        this.reminderInterval = null;
        this.logger.log('[pointage-exit-reminder] fenêtre terminée');
        return;
      }
      void this.sendExitReminder();
    }, 60_000);
  }

  private async sendExitReminder() {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const actives = await this.prisma.pointage.findMany({
      where: {
        isActive: true,
        entryTime: { not: null },
        date: { gte: startOfDay, lte: endOfDay },
      },
      select: { userId: true },
    });

    const userIds = [...new Set(actives.map((p) => p.userId))];
    if (userIds.length === 0) return;

    const timestamp = new Date().toISOString();
    for (const userId of userIds) {
      this.gateway.broadcastExitReminder({
        userId,
        message: "N'oubliez pas de pointer votre heure de départ.",
        timestamp,
      });
    }
    this.logger.log(
      `[pointage-exit-reminder] envoyé à ${userIds.length} employé(s)`,
    );
  }

  // ── Auto-clôture des pointages actifs ─────────────────────────────────────
  //
  // Ancienne logique : `now.getHours() === h && now.getMinutes() === m`
  // Problème : si le tick @Interval(60s) saute la minute exacte (drift normal),
  // l'auto-close ne s'exécutait jamais pour la journée.
  //
  // Nouvelle logique : on déclenche dès que l'heure est ATTEINTE OU DÉPASSÉE,
  // et au maximum UNE FOIS par jour (guard `lastAutoCloseDate`).

  @Interval(60_000)
  async checkAutoClose() {
    try {
      const settings = await this.prisma.systemSettings.findFirst({
        select: { maxSessionEndTime: true },
      });
      const [h, m] = (settings?.maxSessionEndTime ?? '20:00')
        .split(':')
        .map(Number);
      const now = new Date();
      const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const thresholdMinutes = h * 60 + m;

      if (
        nowMinutes >= thresholdMinutes &&
        this.lastAutoCloseDate !== todayKey
      ) {
        this.lastAutoCloseDate = todayKey;
        await this.autoCloseActivePointages();
      }
    } catch (err) {
      this.logger.error('[auto-close] échec vérification', err);
    }
  }

  private async autoCloseActivePointages() {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const actives = await this.prisma.pointage.findMany({
      where: { isActive: true, date: { gte: startOfDay, lte: endOfDay } },
      select: { id: true },
    });

    if (actives.length === 0) return;

    await this.prisma.pointage.updateMany({
      where: { id: { in: actives.map((a) => a.id) } },
      data: { isActive: false, status: 'admin_closed' },
    });
    this.logger.log(
      `[auto-close] ${actives.length} pointage(s) fermés automatiquement (admin_closed)`,
    );
  }

  // ── Email jobs planifiés — polling toutes les 30s ─────────────────────────

  @Interval(30_000)
  async pollScheduledEmails() {
    try {
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();
      const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()} ${hour}:${minute}`;

      const settings = await this.prisma.systemSettings.findFirst({
        select: { timezone: true },
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      const tz: string = (settings as any)?.timezone ?? 'Europe/Paris';

      const jobs = await this.prisma.scheduledEmailJob.findMany({
        where: { enabled: true, hour, minute },
        select: { id: true, type: true, weekday: true, monthlySendDay: true },
      });

      for (const job of jobs) {
        if (
          job.type === 'WEEKLY_REPORT' &&
          (job.weekday == null || job.weekday < 0 || job.weekday > 6)
        ) {
          continue;
        }

        if (job.type === 'WEEKLY_REPORT' && job.weekday != null) {
          const todayWeekday = getCalendarDateInTZ(new Date(), tz).dow;
          if (todayWeekday !== job.weekday) continue;
        }

        if (job.type === 'MONTHLY_REPORT') {
          const todayDay = getCalendarDateInTZ(new Date(), tz).day;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          const sendDay = (job as any).monthlySendDay ?? 1;
          if (todayDay !== sendDay) continue;
        }

        if (this.lastEmailRunByJobId.get(job.id) === minuteKey) continue;
        this.lastEmailRunByJobId.set(job.id, minuteKey);

        this.logger.log(
          `[email-polling] déclenchement ${job.type} (${job.id})`,
        );
        try {
          await this.emailService.runJob(job.id);
        } catch (err) {
          this.logger.error(
            `[email-polling] job ${job.type} ${job.id} échoué`,
            err,
          );
        }
      }
    } catch (err) {
      this.logger.error('[email-polling] tick échoué', err);
    }
  }

  // ── Résolution des faux "incomplete" — toutes les heures ─────────────────

  @Interval(60 * 60_000)
  async resolveIncompleteStatuses() {
    try {
      const count = await this.pointagesService.resolveIncompleteStatuses();
      if (count > 0) {
        this.logger.log(
          `[resolve-incomplete] tick horaire : ${count} pointage(s) corrigé(s)`,
        );
      }
    } catch (err) {
      this.logger.error('[resolve-incomplete] tick échoué', err);
    }
  }

  // ── Sync LDAP — toutes les X minutes selon les paramètres ─────────────────

  @Interval(60 * 60_000)
  async runLdapSync() {
    try {
      const settings = await this.prisma.systemSettings.findFirst({
        select: {
          id: true,
          ldapSyncEnabled: true,
          ldapSyncIntervalMinutes: true,
        },
      });
      if (!settings?.ldapSyncEnabled) return;

      const { syncedCount } = await this.ldapSync.syncEmployees();

      await this.prisma.systemSettings.update({
        where: { id: settings.id },
        data: { ldapLastSyncAt: new Date() },
      });

      this.logger.log(`[ldap-sync] ${syncedCount} employé(s) synchronisés`);
    } catch (err) {
      this.logger.error('[ldap-sync] échec', err);
    }
  }
}
