import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@elitetime/database';
import { LdapSyncService } from 'api/ldap/ldap-sync.service';
import {
  ScheduledEmailService,
  getCalendarDateInTZ,
} from 'api/email/scheduled-email.service';
import { PointagesService } from 'api/pointages/pointages.service';
import { LocksService } from './locks.service';
import { RealtimeService } from './realtime.service';

/**
 * Logique des tâches récurrentes, reprise À L'IDENTIQUE de l'ancien
 * apps/api/src/scheduler/scheduler.service.ts. Seule différence : les gardes
 * d'exécution (une fois par jour / par minute) sont portées par Redis
 * (LocksService) au lieu de variables en mémoire, pour rester correctes avec
 * plusieurs instances du worker et après un redémarrage.
 */
@Injectable()
export class ScheduledTasksService {
  private readonly logger = new Logger(ScheduledTasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ldapSync: LdapSyncService,
    private readonly emailService: ScheduledEmailService,
    private readonly pointagesService: PointagesService,
    private readonly realtime: RealtimeService,
    private readonly locks: LocksService,
  ) {}

  // ── Rappel de sortie (planifié 17:25–17:34, une exécution par minute) ─────
  async exitReminder() {
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
    if (userIds.length === 0) return { notified: 0 };

    const timestamp = new Date().toISOString();
    for (const userId of userIds) {
      this.realtime.broadcastExitReminder({
        userId,
        message: "N'oubliez pas de pointer votre heure de départ.",
        timestamp,
      });
    }
    this.logger.log(
      `[pointage-exit-reminder] envoyé à ${userIds.length} employé(s)`,
    );
    return { notified: userIds.length };
  }

  // ── Auto-clôture : dès que l'heure est atteinte ou dépassée, 1×/jour ──────
  async autoCloseCheck() {
    const settings = await this.prisma.systemSettings.findFirst({
      select: { maxSessionEndTime: true },
    });
    const [h, m] = (settings?.maxSessionEndTime ?? '20:00')
      .split(':')
      .map(Number);
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    if (nowMinutes < h * 60 + m) return { closed: 0, skipped: 'before-threshold' };

    // Marqué avant exécution (comme l'original) : une seule tentative par jour.
    if (!(await this.locks.once(`auto-close:${todayKey}`, 36 * 3600))) {
      return { closed: 0, skipped: 'already-done' };
    }

    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const actives = await this.prisma.pointage.findMany({
      where: { isActive: true, date: { gte: startOfDay, lte: endOfDay } },
      select: { id: true },
    });
    if (actives.length === 0) return { closed: 0 };

    await this.prisma.pointage.updateMany({
      where: { id: { in: actives.map((a) => a.id) } },
      data: { isActive: false, status: 'admin_closed' },
    });
    this.logger.log(
      `[auto-close] ${actives.length} pointage(s) fermés automatiquement (admin_closed)`,
    );
    return { closed: actives.length };
  }

  // ── E-mails planifiés (rapports) : sondage toutes les 30 s ────────────────
  async emailPoll() {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()} ${hour}:${minute}`;

    const settings = await this.prisma.systemSettings.findFirst({
      select: { timezone: true },
    });
    const tz: string =
      (settings as { timezone?: string } | null)?.timezone ?? 'Europe/Paris';

    const jobs = await this.prisma.scheduledEmailJob.findMany({
      where: { enabled: true, hour, minute },
      select: { id: true, type: true, weekday: true, monthlySendDay: true },
    });

    let ran = 0;
    for (const job of jobs) {
      if (
        job.type === 'WEEKLY_REPORT' &&
        (job.weekday == null || job.weekday < 0 || job.weekday > 6)
      ) {
        continue;
      }
      if (job.type === 'WEEKLY_REPORT' && job.weekday != null) {
        if (getCalendarDateInTZ(new Date(), tz).dow !== job.weekday) continue;
      }
      if (job.type === 'MONTHLY_REPORT') {
        const sendDay = job.monthlySendDay ?? 1;
        if (getCalendarDateInTZ(new Date(), tz).day !== sendDay) continue;
      }

      // Idempotence : un envoi par job et par minute, toutes instances confondues
      if (!(await this.locks.once(`email:${job.id}:${minuteKey}`, 300))) {
        continue;
      }

      this.logger.log(`[email-polling] déclenchement ${job.type} (${job.id})`);
      try {
        await this.emailService.runJob(job.id);
        ran++;
      } catch (err) {
        this.logger.error(`[email-polling] job ${job.type} ${job.id} échoué`, err);
      }
    }
    return { ran };
  }

  // ── Résolution des faux "incomplete" — toutes les heures ──────────────────
  async resolveIncomplete() {
    const count = await this.pointagesService.resolveIncompleteStatuses();
    if (count > 0) {
      this.logger.log(
        `[resolve-incomplete] tick horaire : ${count} pointage(s) corrigé(s)`,
      );
    }
    return { fixed: count };
  }

  // ── Synchronisation LDAP — toutes les heures si activée ───────────────────
  async ldapSyncTask() {
    const settings = await this.prisma.systemSettings.findFirst({
      select: {
        id: true,
        ldapSyncEnabled: true,
        ldapSyncIntervalMinutes: true,
      },
    });
    if (!settings?.ldapSyncEnabled) return { skipped: 'disabled' };

    const { syncedCount } = await this.ldapSync.syncEmployees();
    await this.prisma.systemSettings.update({
      where: { id: settings.id },
      data: { ldapLastSyncAt: new Date() },
    });
    this.logger.log(`[ldap-sync] ${syncedCount} employé(s) synchronisés`);
    return { syncedCount };
  }
}
