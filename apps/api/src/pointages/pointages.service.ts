import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@elitetime/database';
import type { ActivityType } from '@elitetime/database';
import { decrypt } from '@elitetime/shared';
import {
  encryptPointage,
  decryptPointage,
  decryptUser,
} from '@elitetime/shared';
import { formatMinutesHuman } from '../lib/time-format';
import {
  dayEnd,
  dayKeyOf,
  dayStart,
  formatHM,
  isWorkingDay,
  lateMinutesFor,
  minuteOfDay,
  parseHM,
  startOfWeek,
  validateSessionTimes,
  zonedTimeToDate,
  isValidDayKey,
  aggregateDays,
} from '@elitetime/time';
import type { DayKey } from '@elitetime/time';
import { WorkTimeService } from '../work-time/work-time.service';

@Injectable()
export class PointagesService {
  private readonly logger = new Logger(PointagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workTime: WorkTimeService,
  ) {}

  private get tz() {
    return this.workTime.tz;
  }

  private getSettings() {
    return this.workTime.getSettings();
  }

  /** Jour calendaire (fuseau métier) et heure « HH:mm » d'un instant. */
  private zoned(at: Date): { day: DayKey; hm: string } {
    return {
      day: dayKeyOf(at, this.tz),
      hm: formatHM(minuteOfDay(at, this.tz)),
    };
  }

  private bounds(day: DayKey) {
    return { gte: dayStart(day, this.tz), lte: dayEnd(day, this.tz) };
  }

  private async logActivity(
    userId: string,
    action: string,
    details: string,
    type: string,
  ) {
    await this.prisma.activityLog.create({
      data: {
        userId,
        action,
        details,
        timestamp: new Date(),
        type: type as ActivityType,
      },
    });
  }

  // ── GET ───────────────────────────────────────────────────────────────────

  async getRecent(userId: string, from: Date, to: Date) {
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Période invalide');
    }
    const rows = await this.prisma.pointage.findMany({
      where: {
        userId,
        date: {
          gte: dayStart(dayKeyOf(from, this.tz), this.tz),
          lte: dayEnd(dayKeyOf(to, this.tz), this.tz),
        },
      },
      orderBy: { date: 'desc' },
    });
    return rows.map((p) => decryptPointage(p));
  }

  /**
   * Semaine CALENDAIRE en cours (lundi → aujourd'hui, fuseau métier), calculée par le moteur commun :
   * mêmes règles que les rapports. `hours`/`overtime` restent fournis (compatibilité des clients) ;
   * `minutes`/`overtimeMinutes` sont les valeurs exactes.
   */
  async getWeekStats(userId: string) {
    const today = this.zoned(new Date()).day;
    const days = await this.workTime.computeRange(
      userId,
      startOfWeek(today),
      today,
    );
    const t = aggregateDays(
      days.filter((d) => d.isWorkingDay || d.netMinutes > 0),
    );
    return {
      minutes: t.netMinutes,
      hours: Math.floor(t.netMinutes / 60),
      lates: t.lateDays,
      overtimeMinutes: t.overtimeMinutes,
      // Règle historique conservée : heures au-delà de 40 h/semaine (cf. docs/calculs-temporels.md, ambiguïté « heures sup. »)
      overtime: Math.max(0, Math.floor(t.netMinutes / 60) - 40),
    };
  }

  async getTodayPointage(userId: string) {
    const nowZ = this.zoned(new Date());
    // Active sessions must take priority over recently-created inactive ones
    // (e.g. an admin-created record with a midnight date could otherwise shadow
    // an employee's live session that was created later in the day).
    const p = await this.prisma.pointage.findFirst({
      where: { userId, date: this.bounds(nowZ.day) },
      orderBy: [{ isActive: 'desc' }, { date: 'desc' }],
    });
    if (!p) return null;

    if (p.isActive && p.entryTime) {
      const { maxSessionEndTime } = await this.getSettings();
      const maxMin = parseHM(maxSessionEndTime);
      const pDay = dayKeyOf(p.date, this.tz);
      const cutoff =
        maxMin === null ? null : zonedTimeToDate(pDay, maxMin, this.tz);
      if (cutoff && new Date() > cutoff) {
        // Fermeture automatique à l'heure maximale de session (admin_closed : les horaires sont présents).
        const entryMin = parseHM(decrypt(p.entryTime));
        const closable = entryMin !== null && entryMin < maxMin!;
        const enc = encryptPointage({
          exitTime: closable ? formatHM(maxMin!) : null,
        });
        await this.prisma.pointage.update({
          where: { id: p.id },
          data: {
            ...(closable ? enc : {}),
            isActive: false,
            status: 'admin_closed',
          },
        });
        // La durée nette (pauses comprises) vient toujours du moteur.
        await this.workTime.recomputeDay(userId, pDay);
        const updated = await this.prisma.pointage.findUniqueOrThrow({
          where: { id: p.id },
        });
        return decryptPointage(updated);
      }
    }
    return decryptPointage(p);
  }

  async getTodayAll(userId: string) {
    const rows = await this.prisma.pointage.findMany({
      where: { userId, date: this.bounds(this.zoned(new Date()).day) },
      orderBy: { sessionNumber: 'asc' },
    });
    return rows.map((p) => decryptPointage(p));
  }

  async getIncomplete(userId: string) {
    const todayStart = dayStart(this.zoned(new Date()).day, this.tz);
    const rows = await this.prisma.pointage.findMany({
      where: {
        userId,
        status: 'incomplete',
        isActive: false,
        date: { lt: todayStart },
      },
      orderBy: { date: 'desc' },
      take: 5,
    });
    return rows.map((p) => decryptPointage(p));
  }

  // ── START ─────────────────────────────────────────────────────────────────

  async start(userId: string, earlyExitReason?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (!user || user.status !== 'active') {
      throw new BadRequestException(
        'Votre compte est inactif. Le pointage est désactivé.',
      );
    }

    const now = new Date();
    const { day: today, hm: entryTime } = this.zoned(now);
    const bounds = this.bounds(today);

    const approvedLeave = await this.prisma.absence.findFirst({
      where: {
        userId,
        type: 'conge',
        status: 'approved',
        startDate: { lte: bounds.lte },
        endDate: { gte: bounds.gte },
      },
    });
    if (approvedLeave) {
      throw new BadRequestException(
        "Vous êtes en congé aujourd'hui. Le pointage est désactivé.",
      );
    }

    const settings = await this.getSettings();
    const startMin = parseHM(settings.workStartTime);
    const entryMin = parseHM(entryTime)!;

    // Verrou par employé : deux clics / deux onglets simultanés ne créent jamais deux sessions.
    const { pointage, isLate, nextSession, reused } =
      await this.workTime.withUserLock(userId, async (tx) => {
        const existingActive = await tx.pointage.findFirst({
          where: { userId, isActive: true },
          orderBy: { date: 'desc' },
        });
        if (existingActive) {
          if (dayKeyOf(existingActive.date, this.tz) === today) {
            return {
              pointage: existingActive,
              isLate: false,
              nextSession: existingActive.sessionNumber,
              reused: true,
            };
          }
          // Session ouverte d'un jour précédent : fermeture forcée (admin_closed : l'entrée est présente).
          await tx.pointage.update({
            where: { id: existingActive.id },
            data: { isActive: false, status: 'admin_closed' },
          });
        }

        const lastSession = await tx.pointage.findFirst({
          where: { userId, date: bounds },
          orderBy: { sessionNumber: 'desc' },
        });
        const nextSession = lastSession ? lastSession.sessionNumber + 1 : 1;
        // Seule la première session de la journée peut être en retard, uniquement un jour ouvré.
        const isLate =
          nextSession === 1 &&
          isWorkingDay(today, settings.holidays) &&
          startMin !== null &&
          entryMin > startMin;

        const enc = encryptPointage({
          entryTime,
          earlyExitReason: earlyExitReason || null,
        });
        const pointage = await tx.pointage.create({
          data: {
            userId,
            date: now,
            sessionNumber: nextSession,
            entryTime: enc.entryTime,
            duration: 0,
            status: isLate ? 'late' : 'normal',
            source: 'EMPLOYEE',
            isActive: true,
            earlyExitReason: enc.earlyExitReason,
          },
        });
        return { pointage, isLate, nextSession, reused: false };
      });

    if (reused) return decryptPointage(pointage);

    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (u) {
      const du = decryptUser(u);
      const name =
        `${du.firstname || ''} ${du.lastname || ''}`.trim() || du.username;
      const label = isLate ? 'en retard' : "à l'heure";
      const sess = nextSession > 1 ? ` (session ${nextSession})` : '';
      await this.logActivity(
        userId,
        "Pointage d'entrée",
        `${name} - ${entryTime} (${label})${sess}`,
        'pointage',
      );
    }

    return decryptPointage(pointage);
  }

  // ── END ───────────────────────────────────────────────────────────────────

  async end(userId: string, earlyExitReason?: string) {
    const nowZ = this.zoned(new Date());
    let active = await this.prisma.pointage.findFirst({
      where: { userId, isActive: true },
      orderBy: { date: 'desc' },
    });

    // Fallback: if no active flag (e.g. session was auto-closed but employee
    // never actually left), accept the most recent incomplete session of today.
    if (!active) {
      active = await this.prisma.pointage.findFirst({
        where: { userId, exitTime: null, date: this.bounds(nowZ.day) },
        orderBy: [{ isActive: 'desc' }, { date: 'desc' }],
      });
    }

    if (!active || !active.entryTime) return null;

    const sessionDay = dayKeyOf(active.date, this.tz);
    const entryMin = parseHM(decrypt(active.entryTime));
    if (entryMin === null) return null;

    const { maxSessionEndTime, workEndTime } = await this.getSettings();
    const maxMin = parseHM(maxSessionEndTime);
    const now = new Date();
    const cutoff =
      maxMin === null ? null : zonedTimeToDate(sessionDay, maxMin, this.tz);
    // La sortie est plafonnée à l'heure maximale de session, jamais antérieure à l'entrée.
    let endDate = cutoff && now > cutoff ? cutoff : now;
    const entryDate = zonedTimeToDate(sessionDay, entryMin, this.tz);
    if (endDate.getTime() < entryDate.getTime()) endDate = entryDate;

    const exitTime = formatHM(minuteOfDay(endDate, this.tz));
    const exitMin = parseHM(exitTime)!;

    let isEarlyExit = false;
    let earlyExitMinutes = 0;
    const scheduledEnd = parseHM(workEndTime);
    if (scheduledEnd !== null && exitMin < scheduledEnd) {
      isEarlyExit = true;
      earlyExitMinutes = scheduledEnd - exitMin;
    }

    const enc = encryptPointage({
      exitTime,
      earlyExitReason: earlyExitReason || null,
    });
    // Sortie + recalcul de la durée nette dans la même transaction (verrou employé).
    const durationMinutes = await this.workTime.withUserLock(
      userId,
      async (tx) => {
        await tx.pointage.update({
          where: { id: active.id },
          data: { ...enc, isActive: false },
        });
        await this.workTime.recomputeDay(userId, sessionDay, tx);
        const fresh = await tx.pointage.findUniqueOrThrow({
          where: { id: active.id },
        });
        return fresh.duration;
      },
    );
    const updated = await this.prisma.pointage.findUniqueOrThrow({
      where: { id: active.id },
    });

    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (u) {
      const du = decryptUser(u);
      const name =
        `${du.firstname || ''} ${du.lastname || ''}`.trim() || du.username;
      await this.logActivity(
        userId,
        'Pointage de sortie',
        `${name} - ${exitTime} (durée: ${formatMinutesHuman(durationMinutes)})`,
        'pointage',
      );
    }

    // Correction opportuniste : le pointage qui vient d'être clôturé était
    // peut-être marqué "incomplete" — on recalcule tous les faux incomplets.
    await this.resolveIncompleteStatuses();

    return {
      pointage: decryptPointage(updated),
      isEarlyExit,
      earlyExitMinutes: isEarlyExit ? earlyExitMinutes : undefined,
    };
  }

  // ── UPDATES ───────────────────────────────────────────────────────────────

  async updateLateReason(userId: string, reason: string, pointageId?: string) {
    const where = pointageId
      ? { id: pointageId, userId }
      : {
          userId,
          status: 'late' as const,
          date: this.bounds(this.zoned(new Date()).day),
        };

    const p = await this.prisma.pointage.findFirst({
      where,
      orderBy: [{ date: 'desc' }, { sessionNumber: 'desc' }],
    });
    if (!p) return null;

    const trimmed = reason.trim();
    const enc = encryptPointage({ lateReason: trimmed || null });
    const updated = await this.prisma.pointage.update({
      where: { id: p.id },
      data: enc,
    });
    return decryptPointage(updated);
  }

  async updateEarlyExitReason(
    userId: string,
    pointageId: string,
    reason: string,
  ) {
    const trimmed = reason.trim();
    const enc = encryptPointage({ earlyExitReason: trimmed || null });
    const updated = await this.prisma.pointage.update({
      where: { id: pointageId, userId },
      data: enc,
    });
    return decryptPointage(updated);
  }

  // ── MANAGER ───────────────────────────────────────────────────────────────

  private assertDay(dateStr: string): DayKey {
    if (!isValidDayKey(dateStr)) {
      throw new BadRequestException(
        'Date invalide (format AAAA-MM-JJ attendu)',
      );
    }
    return dateStr;
  }

  async getManagerByDate(dateStr: string, userIds: string[]) {
    const day = this.assertDay(dateStr);
    const rows = await this.prisma.pointage.findMany({
      where: { userId: { in: userIds }, date: this.bounds(day) },
      orderBy: { sessionNumber: 'asc' },
    });
    return rows.map((p) => decryptPointage(p));
  }

  async managerUpsert(
    managerId: string,
    userId: string,
    dateStr: string,
    entryTime: string | null,
    exitTime: string | null,
    lateReason: string | null,
    earlyExitReason: string | null,
    sessionNumber = 1,
  ) {
    const day = this.assertDay(dateStr);
    if (!Number.isInteger(sessionNumber) || sessionNumber < 1) {
      throw new BadRequestException('Numéro de session invalide');
    }
    entryTime = entryTime || null;
    exitTime = exitTime || null;
    // Une saisie incohérente est refusée avant d'entrer en base (jamais corrigée en silence).
    const invalid = validateSessionTimes(entryTime, exitTime);
    if (invalid) throw new BadRequestException(invalid);

    const settings = await this.getSettings();
    const bounds = this.bounds(day);

    const status = ((): 'incomplete' | 'late' | 'normal' => {
      if (!entryTime || !exitTime) return 'incomplete';
      const first = sessionNumber === 1;
      const late =
        first &&
        lateMinutesFor(
          day,
          entryTime,
          settings.workStartTime,
          settings.holidays,
        ) > 0;
      return late ? 'late' : 'normal';
    })();

    const enc = encryptPointage({
      entryTime,
      exitTime,
      lateReason,
      earlyExitReason,
    });

    // isActive = true uniquement si l'entrée est pointée, pas de sortie, et c'est aujourd'hui.
    // Pour un pointage rétroactif (jour passé), isActive reste false même sans sortie.
    const isToday = day === this.zoned(new Date()).day;
    const isNowActive = !!entryTime && !exitTime && isToday;

    const result = await this.workTime.withUserLock(userId, async (tx) => {
      const existing = await tx.pointage.findFirst({
        where: { userId, date: bounds, sessionNumber },
      });
      const data = {
        ...enc,
        status,
        isActive: isNowActive,
        pointedBy: 'manager' as const,
        source: 'MANAGER' as const,
      };
      const row = existing
        ? await tx.pointage.update({
            where: { id: existing.id },
            data: { ...data, duration: 0 },
          })
        : await tx.pointage.create({
            data: {
              user: { connect: { id: userId } },
              date: dayStart(day, this.tz),
              sessionNumber,
              ...data,
              duration: 0,
            },
          });
      // Durée nette = sessions valides − pauses, calculée par le moteur pour TOUTE la journée.
      await this.workTime.recomputeDay(userId, day, tx);
      return tx.pointage.findUniqueOrThrow({ where: { id: row.id } });
    });

    await this.logActivity(
      managerId,
      'Pointage manuel (manager)',
      `Pointage de ${userId} le ${dateStr} - entrée: ${entryTime ?? '—'}, sortie: ${exitTime ?? '—'}`,
      'pointage',
    );

    // Recalcule les faux "incomplete" après chaque modification manager.
    await this.resolveIncompleteStatuses();

    return decryptPointage(result);
  }

  // ── RÉSOLUTION AUTOMATIQUE DES FAUX "incomplete" ─────────────────────────
  //
  // Un pointage est "incomplet" uniquement si l'heure d'entrée OU de sortie
  // est absente. Si les deux sont présentes et le statut reste "incomplete",
  // c'est un artefact d'une ancienne logique — on recalcule le vrai statut.

  async resolveIncompleteStatuses(): Promise<number> {
    const settings = await this.getSettings();

    const faux = await this.prisma.pointage.findMany({
      where: {
        status: 'incomplete',
        isActive: false,
        entryTime: { not: null },
        exitTime: { not: null },
      },
      select: { id: true, entryTime: true, date: true, sessionNumber: true },
    });

    if (faux.length === 0) return 0;

    const toNormal: string[] = [];
    const toLate: string[] = [];

    for (const p of faux) {
      const late =
        p.sessionNumber === 1 &&
        lateMinutesFor(
          dayKeyOf(p.date, this.tz),
          decrypt(p.entryTime!),
          settings.workStartTime,
          settings.holidays,
        ) > 0;
      (late ? toLate : toNormal).push(p.id);
    }

    let count = 0;
    if (toNormal.length > 0) {
      const { count: n } = await this.prisma.pointage.updateMany({
        where: { id: { in: toNormal } },
        data: { status: 'normal' },
      });
      count += n;
    }
    if (toLate.length > 0) {
      const { count: n } = await this.prisma.pointage.updateMany({
        where: { id: { in: toLate } },
        data: { status: 'late' },
      });
      count += n;
    }

    if (count > 0) {
      this.logger.log(
        `[resolve-incomplete] ${count} pointage(s) corrigé(s) (${toNormal.length} normal, ${toLate.length} late)`,
      );
    }
    return count;
  }

  async deleteExtraSessions(userId: string, dateStr: string) {
    const day = this.assertDay(dateStr);
    await this.workTime.withUserLock(userId, async (tx) => {
      await tx.pointage.deleteMany({
        where: {
          userId,
          date: this.bounds(day),
          sessionNumber: { gt: 1 },
        },
      });
      await this.workTime.recomputeDay(userId, day, tx);
    });
  }
}
