import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@elitetime/database';
import type { Prisma } from '@elitetime/database';
import { decryptBreak, decryptPointage } from '@elitetime/shared';
import {
  BUSINESS_TIME_ZONE,
  computeDayMetrics,
  dayEnd,
  dayKeyOf,
  dayStart,
  eachDay,
  normalizeHolidays,
} from '@elitetime/time';
import type { BreakDeductionMode, DayKey, DayMetrics } from '@elitetime/time';

export type Db = PrismaService | Prisma.TransactionClient;

/** Fuseau métier : variable BUSINESS_TIMEZONE, sinon Africa/Brazzaville (UTC+1, sans heure d'été). */
export function businessTimeZone(): string {
  const tz = process.env.BUSINESS_TIMEZONE?.trim();
  if (!tz) return BUSINESS_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return BUSINESS_TIME_ZONE;
  }
}

/**
 * Règle de déduction des pauses. Défaut `recorded` = règle documentée du produit (« déduction faite des
 * pauses enregistrées »). `recorded_or_flat` reproduit l'ancien forfait (une fois par jour, seulement si
 * aucune pause n'est enregistrée) — à n'utiliser que pour une transition contrôlée.
 */
export function breakDeductionMode(): BreakDeductionMode {
  return process.env.BREAK_DEDUCTION_MODE === 'recorded_or_flat'
    ? 'recorded_or_flat'
    : 'recorded';
}

export interface WorkTimeSettings {
  workStartTime: string;
  workEndTime: string;
  maxSessionEndTime: string;
  breakDuration: number;
  holidays: ReadonlySet<DayKey>;
  tz: string;
  breakMode: BreakDeductionMode;
}

const DEFAULTS = {
  workStartTime: '08:45',
  workEndTime: '17:30',
  maxSessionEndTime: '20:00',
  breakDuration: 60,
};

/**
 * Point d'entrée UNIQUE des calculs de temps de travail côté serveur : les pointages, les pauses, les
 * rapports, les tableaux de bord, l'assistant et les tâches planifiées passent tous par ici (et donc par
 * le moteur `@elitetime/time`). Aucune autre implémentation de ces règles ne doit exister.
 */
@Injectable()
export class WorkTimeService {
  private readonly logger = new Logger(WorkTimeService.name);
  private warnedTimezone = false;

  constructor(private readonly prisma: PrismaService) {}

  get tz(): string {
    return businessTimeZone();
  }

  async getSettings(db: Db = this.prisma): Promise<WorkTimeSettings> {
    const s = await db.systemSettings.findFirst();
    if (s?.timezone && s.timezone !== this.tz && !this.warnedTimezone) {
      this.warnedTimezone = true;
      this.logger.warn(
        `SystemSettings.timezone="${s.timezone}" est ignoré : le fuseau métier est « ${this.tz} » (BUSINESS_TIMEZONE). ` +
          `Alignez le paramètre en base pour éviter toute confusion.`,
      );
    }
    return {
      workStartTime: s?.workStartTime ?? DEFAULTS.workStartTime,
      workEndTime: s?.workEndTime ?? DEFAULTS.workEndTime,
      maxSessionEndTime: s?.maxSessionEndTime ?? DEFAULTS.maxSessionEndTime,
      breakDuration: s?.breakDuration ?? DEFAULTS.breakDuration,
      holidays: normalizeHolidays(s?.holidays),
      tz: this.tz,
      breakMode: breakDeductionMode(),
    };
  }

  /** Paramètres consommés par les rapports (groupPointagesByDay / ReportCalculator). */
  async reportThresholds(db: Db = this.prisma) {
    const s = await this.getSettings(db);
    return {
      lateThreshold: s.workStartTime,
      overtimeThreshold: s.workEndTime,
      holidays: s.holidays,
      breakMode: s.breakMode,
      flatBreakMinutes: s.breakDuration,
      tz: s.tz,
    };
  }

  /** Sessions et pauses (déchiffrées) d'un employé pour un jour calendaire du fuseau métier. */
  async loadDay(userId: string, day: DayKey, db: Db = this.prisma) {
    const range = { gte: dayStart(day, this.tz), lte: dayEnd(day, this.tz) };
    const [pointages, breaks] = await Promise.all([
      db.pointage.findMany({
        where: { userId, date: range },
        orderBy: { sessionNumber: 'asc' },
      }),
      db.break.findMany({
        where: { userId, date: range },
        orderBy: { date: 'asc' },
      }),
    ]);
    return {
      pointages: pointages.map((p) => decryptPointage(p)),
      breaks: breaks.map((b) => decryptBreak(b)),
    };
  }

  /** Métriques d'une journée, avec éventuellement une session remplacée (ex. sortie qui vient d'être pointée). */
  async computeDay(
    userId: string,
    day: DayKey,
    override?: {
      sessionNumber: number;
      entryTime?: string | null;
      exitTime?: string | null;
    },
    db: Db = this.prisma,
    now: Date = new Date(),
  ): Promise<DayMetrics> {
    const [settings, { pointages, breaks }] = await Promise.all([
      this.getSettings(db),
      this.loadDay(userId, day, db),
    ]);
    const sessions = pointages.map((p) =>
      override && p.sessionNumber === override.sessionNumber
        ? {
            sessionNumber: p.sessionNumber,
            entryTime:
              override.entryTime !== undefined
                ? override.entryTime
                : p.entryTime,
            exitTime:
              override.exitTime !== undefined ? override.exitTime : p.exitTime,
          }
        : {
            sessionNumber: p.sessionNumber,
            entryTime: p.entryTime,
            exitTime: p.exitTime,
          },
    );
    return computeDayMetrics(
      day,
      sessions,
      breaks.map((b) => ({
        day: dayKeyOf(b.date, this.tz),
        startTime: b.startTime,
        endTime: b.endTime,
      })),
      {
        workStartTime: settings.workStartTime,
        workEndTime: settings.workEndTime,
        breakDeductionMode: settings.breakMode,
        flatBreakMinutes: settings.breakDuration,
      },
      { tz: this.tz, holidays: settings.holidays, now },
    );
  }

  /**
   * Métriques de chaque jour de [from, to] (jours du fuseau métier) pour un employé, en deux requêtes.
   * Les jours sans pointage sont présents avec des valeurs à 0.
   */
  async computeRange(
    userId: string,
    from: DayKey,
    to: DayKey,
    db: Db = this.prisma,
    now: Date = new Date(),
  ): Promise<DayMetrics[]> {
    const settings = await this.getSettings(db);
    const range = { gte: dayStart(from, this.tz), lte: dayEnd(to, this.tz) };
    const [rows, brks] = await Promise.all([
      db.pointage.findMany({ where: { userId, date: range } }),
      db.break.findMany({ where: { userId, date: range } }),
    ]);
    const byDay = new Map<DayKey, ReturnType<typeof decryptPointage>[]>();
    for (const r of rows) {
      const d = dayKeyOf(r.date, this.tz);
      byDay.set(d, [...(byDay.get(d) ?? []), decryptPointage(r)]);
    }
    const breaksByDay = new Map<
      DayKey,
      { day: DayKey; startTime: string; endTime: string | null }[]
    >();
    for (const b of brks) {
      const db_ = decryptBreak(b);
      const d = dayKeyOf(b.date, this.tz);
      breaksByDay.set(d, [
        ...(breaksByDay.get(d) ?? []),
        { day: d, startTime: db_.startTime, endTime: db_.endTime },
      ]);
    }
    return eachDay(from, to).map((d) =>
      computeDayMetrics(
        d,
        (byDay.get(d) ?? []).map((p) => ({
          sessionNumber: p.sessionNumber,
          entryTime: p.entryTime,
          exitTime: p.exitTime,
        })),
        breaksByDay.get(d) ?? [],
        {
          workStartTime: settings.workStartTime,
          workEndTime: settings.workEndTime,
          breakDeductionMode: settings.breakMode,
          flatBreakMinutes: settings.breakDuration,
        },
        { tz: this.tz, holidays: settings.holidays, now },
      ),
    );
  }

  /**
   * Remet `duration` de chaque session TERMINÉE de la journée en accord avec le moteur. À appeler après
   * toute modification de la journée (sortie, pause, saisie manuelle, suppression). Idempotent.
   */
  async recomputeDay(
    userId: string,
    day: DayKey,
    db: Db = this.prisma,
  ): Promise<number> {
    const [{ pointages }, metrics] = await Promise.all([
      this.loadDay(userId, day, db),
      this.computeDay(userId, day, undefined, db),
    ]);
    const net = new Map(
      metrics.sessions.map((s) => [s.sessionNumber, s.netMinutes]),
    );
    let updated = 0;
    for (const p of pointages) {
      if (!p.exitTime) continue; // une session ouverte garde duration = 0
      const expected = net.get(p.sessionNumber) ?? 0;
      if (p.duration !== expected) {
        await db.pointage.update({
          where: { id: p.id },
          data: { duration: expected },
        });
        updated++;
      }
    }
    return updated;
  }

  /** Verrou applicatif par employé : sérialise start/end/saisie manuelle (jamais deux pointages simultanés). */
  async withUserLock<T>(
    userId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'pointage:' + userId}))`;
        return fn(tx);
      },
      { timeout: 15_000 },
    );
  }
}
