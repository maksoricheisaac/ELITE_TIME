import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ActivityType } from '../generated/prisma/client';
import { decrypt } from '../lib/crypto';
import {
  encryptPointage,
  decryptPointage,
  decryptUser,
} from '../lib/prisma-crypto.helper';
import { formatMinutesHuman } from '../lib/time-format';

const DEFAULT_WORK_START_TIME = '08:45';
const DEFAULT_MAX_SESSION_END_TIME = '20:00';
const DEFAULT_BREAK_DURATION_MINUTES = 60;

@Injectable()
export class PointagesService {
  private readonly logger = new Logger(PointagesService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async getSettings() {
    const s = await this.prisma.systemSettings.findFirst();
    return {
      workStartTime: s?.workStartTime ?? DEFAULT_WORK_START_TIME,
      workEndTime: s?.workEndTime ?? '17:30',
      maxSessionEndTime: s?.maxSessionEndTime ?? DEFAULT_MAX_SESSION_END_TIME,
      breakDuration: s?.breakDuration ?? DEFAULT_BREAK_DURATION_MINUTES,
    };
  }

  private parseHM(value: string): [number, number] {
    const [h, m] = value.split(':').map(Number);
    return [isNaN(h) ? 0 : h, isNaN(m) ? 0 : m];
  }

  private isWeekend(date: Date) {
    const d = date.getDay();
    return d === 0 || d === 6;
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
    const f = new Date(from);
    f.setHours(0, 0, 0, 0);
    const t = new Date(to);
    t.setHours(23, 59, 59, 999);
    const rows = await this.prisma.pointage.findMany({
      where: { userId, date: { gte: f, lte: t } },
      orderBy: { date: 'desc' },
    });
    return rows.map((p) => decryptPointage(p));
  }

  async getWeekStats(userId: string) {
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const rows = await this.prisma.pointage.findMany({
      where: { userId, date: { gte: since } },
    });
    const totalMinutes = rows.reduce((s, p) => s + p.duration, 0);
    const hours = Math.floor(totalMinutes / 60);
    return {
      hours,
      lates: rows.filter((p) => p.status === 'late').length,
      overtime: Math.max(0, hours - 40),
    };
  }

  async getTodayPointage(userId: string) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    // Active sessions must take priority over recently-created inactive ones
    // (e.g. an admin-created record with a midnight date could otherwise shadow
    // an employee's live session that was created later in the day).
    const p = await this.prisma.pointage.findFirst({
      where: { userId, date: { gte: start, lte: end } },
      orderBy: [{ isActive: 'desc' }, { date: 'desc' }],
    });
    if (!p) return null;

    if (p.isActive && p.entryTime) {
      const { maxSessionEndTime } = await this.getSettings();
      const [mH, mM] = this.parseHM(maxSessionEndTime);
      const cutoff = new Date(p.date);
      cutoff.setHours(mH, mM, 0, 0);
      if (new Date() > cutoff) {
        const updated = await this.prisma.pointage.update({
          where: { id: p.id },
          data: { isActive: false, status: 'incomplete' },
        });
        return decryptPointage(updated);
      }
    }
    return decryptPointage(p);
  }

  async getTodayAll(userId: string) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const rows = await this.prisma.pointage.findMany({
      where: { userId, date: { gte: start, lte: end } },
      orderBy: { sessionNumber: 'asc' },
    });
    return rows.map((p) => decryptPointage(p));
  }

  async getIncomplete(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rows = await this.prisma.pointage.findMany({
      where: {
        userId,
        status: 'incomplete',
        isActive: false,
        date: { lt: today },
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

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const approvedLeave = await this.prisma.absence.findFirst({
      where: {
        userId,
        type: 'conge',
        status: 'approved',
        startDate: { lte: todayEnd },
        endDate: { gte: todayStart },
      },
    });
    if (approvedLeave) {
      throw new BadRequestException(
        "Vous êtes en congé aujourd'hui. Le pointage est désactivé.",
      );
    }

    const existingActive = await this.prisma.pointage.findFirst({
      where: { userId, isActive: true },
      orderBy: { date: 'desc' },
    });

    if (existingActive) {
      const activeDate = new Date(existingActive.date);
      const sameDay = new Date().toDateString() === activeDate.toDateString();
      if (!sameDay) {
        await this.prisma.pointage.update({
          where: { id: existingActive.id },
          data: { isActive: false, status: 'incomplete' },
        });
      } else {
        return decryptPointage(existingActive);
      }
    }

    const lastSession = await this.prisma.pointage.findFirst({
      where: { userId, date: { gte: todayStart, lte: todayEnd } },
      orderBy: { sessionNumber: 'desc' },
    });
    const nextSession = lastSession ? lastSession.sessionNumber + 1 : 1;

    const now = new Date();
    const entryTime = now.toTimeString().slice(0, 5);
    const { workStartTime } = await this.getSettings();
    const [startH, startM] = this.parseHM(workStartTime);
    const isLate =
      !this.isWeekend(now) &&
      (now.getHours() > startH ||
        (now.getHours() === startH && now.getMinutes() > startM));

    const enc = encryptPointage({
      entryTime,
      earlyExitReason: earlyExitReason || null,
    });
    const pointage = await this.prisma.pointage.create({
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
    let active = await this.prisma.pointage.findFirst({
      where: { userId, isActive: true },
      orderBy: { date: 'desc' },
    });

    // Fallback: if no active flag (e.g. session was auto-closed but employee
    // never actually left), accept the most recent incomplete session of today.
    if (!active) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      active = await this.prisma.pointage.findFirst({
        where: {
          userId,
          exitTime: null,
          date: { gte: todayStart, lte: todayEnd },
        },
        orderBy: [{ isActive: 'desc' }, { date: 'desc' }],
      });
    }

    if (!active || !active.entryTime) return null;

    const decryptedEntry = decrypt(active.entryTime);
    const entryDate = new Date(active.date);
    const [h, m] = decryptedEntry.split(':').map(Number);
    entryDate.setHours(h, m, 0, 0);

    const { maxSessionEndTime, breakDuration, workEndTime } =
      await this.getSettings();
    const [maxH, maxM] = this.parseHM(maxSessionEndTime);
    const now = new Date();
    const cutoff = new Date(entryDate);
    cutoff.setHours(maxH, maxM, 0, 0);
    const endDate = now > cutoff ? cutoff : now;

    const exitTime = endDate.toTimeString().slice(0, 5);
    let durationMinutes = Math.max(
      0,
      Math.floor((endDate.getTime() - entryDate.getTime()) / 60000),
    );
    if (durationMinutes > breakDuration) durationMinutes -= breakDuration;

    let isEarlyExit = false;
    let earlyExitMinutes = 0;
    if (workEndTime) {
      const [endH, endM] = this.parseHM(workEndTime);
      const scheduledEnd = endH * 60 + endM;
      const [xH, xM] = exitTime.split(':').map(Number);
      const actualExit = xH * 60 + xM;
      if (actualExit < scheduledEnd) {
        isEarlyExit = true;
        earlyExitMinutes = scheduledEnd - actualExit;
      }
    }

    const enc = encryptPointage({
      exitTime,
      earlyExitReason: earlyExitReason || null,
    });
    const updated = await this.prisma.pointage.update({
      where: { id: active.id },
      data: { ...enc, duration: durationMinutes, isActive: false },
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

    return {
      pointage: decryptPointage(updated),
      isEarlyExit,
      earlyExitMinutes: isEarlyExit ? earlyExitMinutes : undefined,
    };
  }

  // ── UPDATES ───────────────────────────────────────────────────────────────

  async updateLateReason(userId: string, reason: string, pointageId?: string) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const where = pointageId
      ? { id: pointageId, userId }
      : { userId, status: 'late' as const, date: { gte: start, lte: end } };

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

  async getManagerByDate(dateStr: string, userIds: string[]) {
    // new Date("YYYY-MM-DD") crée minuit UTC (spec ISO 8601 date-only).
    // Appender 'T00:00:00' (sans 'Z') force le parsing en heure locale,
    // ce qui donne minuit local → les setHours suivants n'ont aucun effet
    // secondaire et les plages de filtrage sont correctes.
    const date = new Date(dateStr + 'T00:00:00');
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    const rows = await this.prisma.pointage.findMany({
      where: { userId: { in: userIds }, date: { gte: start, lte: end } },
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
    // new Date("YYYY-MM-DD") → minuit UTC (ISO date-only spec) → 02h locale CEST.
    // Appender 'T00:00:00' force le parsing en heure locale (pas de 'Z').
    const date = new Date(dateStr + 'T00:00:00');
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    // On lit la config une seule fois et on la réutilise pour le calcul de
    // durée ET pour la détermination du statut (late/normal). Avant ce fix,
    // un objet littéral { workStartTime: '08:45' } était redéfini localement
    // dans l'IIFE status, ignorant la configuration réelle de l'administration.
    const settings = await this.getSettings();

    let duration = 0;
    if (entryTime && exitTime) {
      const [eh, em] = entryTime.split(':').map(Number);
      const [xh, xm] = exitTime.split(':').map(Number);
      duration = Math.max(
        0,
        xh * 60 + xm - (eh * 60 + em) - settings.breakDuration,
      );
    }

    const isWeekendDay = this.isWeekend(date);
    const status = (() => {
      if (!entryTime) return 'incomplete';
      if (!exitTime) return 'incomplete';
      const [eh, em] = entryTime.split(':').map(Number);
      const [sh, sm] = this.parseHM(settings.workStartTime);
      if (!isWeekendDay && (eh > sh || (eh === sh && em > sm))) return 'late';
      return 'normal';
    })();

    const enc = encryptPointage({
      entryTime,
      exitTime,
      lateReason,
      earlyExitReason,
    });

    const existing = await this.prisma.pointage.findFirst({
      where: { userId, date: { gte: start, lte: end }, sessionNumber },
    });

    // isActive = true uniquement si l'entrée est pointée, pas de sortie, et c'est aujourd'hui.
    // Pour un pointage rétroactif (jour passé), isActive reste false même sans sortie.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isToday = date.toDateString() === today.toDateString();
    const isNowActive = !!entryTime && !exitTime && isToday;

    let result;
    if (existing) {
      result = await this.prisma.pointage.update({
        where: { id: existing.id },
        data: {
          ...enc,
          duration,
          status: exitTime ? status : 'incomplete',
          isActive: isNowActive,
          pointedBy: 'manager',
          source: 'MANAGER',
        },
      });
    } else {
      result = await this.prisma.pointage.create({
        data: {
          user: { connect: { id: userId } },
          date: new Date(dateStr + 'T00:00:00'),
          sessionNumber,
          ...enc,
          duration,
          status: exitTime ? status : 'incomplete',
          isActive: isNowActive,
          pointedBy: 'manager',
          source: 'MANAGER',
        },
      });
    }

    await this.logActivity(
      managerId,
      'Pointage manuel (manager)',
      `Pointage de ${userId} le ${dateStr} - entrée: ${entryTime ?? '—'}, sortie: ${exitTime ?? '—'}`,
      'pointage',
    );
    return decryptPointage(result);
  }

  async deleteExtraSessions(userId: string, dateStr: string) {
    const date = new Date(dateStr + 'T00:00:00');
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    await this.prisma.pointage.deleteMany({
      where: {
        userId,
        date: { gte: start, lte: end },
        sessionNumber: { gt: 1 },
      },
    });
  }
}
