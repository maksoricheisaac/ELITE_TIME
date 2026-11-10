import { compareDays, dayKeyOf, daysInclusive, eachDay, isValidDayKey, weekdayOf, BUSINESS_TIME_ZONE } from './zone';
import type { DayKey } from './zone';

/**
 * Calendrier de travail.
 *
 * Règles (documentées dans docs/calculs-temporels.md) :
 *  - jour OUVRÉ = lundi à vendredi, hors jours fériés du paramètre `holidays` ;
 *  - samedi et dimanche ne sont jamais ouvrés (pas de retard, pas d'absence, pas de congé décompté) ;
 *  - un pointage un jour non ouvré reste du temps TRAVAILLÉ (il est compté), mais jamais « en retard ».
 */

/** Lit le réglage `holidays` (JSON libre) : ne retient que les jours calendaires valides. */
export function normalizeHolidays(raw: unknown): Set<DayKey> {
  const out = new Set<DayKey>();
  if (!Array.isArray(raw)) return out;
  for (const item of raw) {
    const candidate =
      typeof item === 'string'
        ? item.slice(0, 10)
        : item && typeof item === 'object' && typeof (item as { date?: unknown }).date === 'string'
          ? ((item as { date: string }).date).slice(0, 10)
          : '';
    if (isValidDayKey(candidate)) out.add(candidate);
  }
  return out;
}

export function isWeekend(day: DayKey): boolean {
  const w = weekdayOf(day);
  return w === 0 || w === 6;
}

export function isWorkingDay(day: DayKey, holidays?: ReadonlySet<DayKey>): boolean {
  return !isWeekend(day) && !(holidays?.has(day) ?? false);
}

/** Nombre de jours ouvrés de `from` à `to` inclus. */
export function countWorkingDays(from: DayKey, to: DayKey, holidays?: ReadonlySet<DayKey>): number {
  let n = 0;
  for (const d of eachDay(from, to)) if (isWorkingDay(d, holidays)) n++;
  return n;
}

export interface LeaveBreakdown {
  /** Jours calendaires couverts (week-ends et fériés inclus) */
  calendarDays: number;
  /** Jours OUVRÉS couverts : c'est la valeur à décompter d'un solde de congés */
  workingDays: number;
  /** Chaque jour ouvré couvert (pour croiser avec les pointages sans double comptage) */
  workingDayKeys: DayKey[];
}

/**
 * Décompte d'un congé [start, end] (bornes inclusives), éventuellement restreint à `within`
 * (ex. un mois) — ce qui permet de répartir proprement un congé à cheval sur deux mois / deux années.
 * Les dates sont d'abord ramenées au jour calendaire dans le fuseau métier : un congé « du 30/11 à
 * 23:00 UTC » est bien un congé commençant le 1er/12 à Brazzaville.
 */
export function leaveBreakdown(
  leave: { startDate: Date | string; endDate: Date | string },
  options: { within?: { from: DayKey; to: DayKey }; holidays?: ReadonlySet<DayKey>; tz?: string } = {},
): LeaveBreakdown {
  const tz = options.tz ?? BUSINESS_TIME_ZONE;
  const toKey = (v: Date | string) => dayKeyOf(v instanceof Date ? v : new Date(v), tz);
  let start: DayKey;
  let end: DayKey;
  try {
    start = toKey(leave.startDate);
    end = toKey(leave.endDate);
  } catch {
    return { calendarDays: 0, workingDays: 0, workingDayKeys: [] };
  }
  if (compareDays(end, start) < 0) return { calendarDays: 0, workingDays: 0, workingDayKeys: [] };
  if (options.within) {
    if (compareDays(start, options.within.from) < 0) start = options.within.from;
    if (compareDays(end, options.within.to) > 0) end = options.within.to;
    if (compareDays(end, start) < 0) return { calendarDays: 0, workingDays: 0, workingDayKeys: [] };
  }
  const keys = eachDay(start, end).filter((d) => isWorkingDay(d, options.holidays));
  return { calendarDays: daysInclusive(start, end), workingDays: keys.length, workingDayKeys: keys };
}

export interface PeriodClassification {
  /** Jours ouvrés de la période (futur compris) */
  workingDays: number;
  /** Jours ouvrés déjà écoulés (≤ aujourd'hui) : base des taux de présence */
  elapsedWorkingDays: number;
  /** Jours ouvrés avec au moins un pointage */
  workedDays: number;
  /** Jours ouvrés couverts par un congé APPROUVÉ et sans pointage */
  leaveDays: number;
  /** Jours ouvrés écoulés sans pointage et sans congé approuvé = absences non justifiées */
  absentDays: number;
  absentDayKeys: DayKey[];
  /** Jours non ouvrés où l'employé a pourtant pointé (temps compté, jamais en retard) */
  workedOffDays: number;
}

/**
 * Classe chaque jour d'une période. Un jour reçoit UNE SEULE catégorie : pas de double comptage
 * entre « congé » et « absence ». Un jour FUTUR n'est jamais une absence.
 */
export function classifyPeriod(input: {
  from: DayKey;
  to: DayKey;
  today: DayKey;
  workedDayKeys: ReadonlySet<DayKey>;
  approvedLeaveDayKeys: ReadonlySet<DayKey>;
  holidays?: ReadonlySet<DayKey>;
}): PeriodClassification {
  const res: PeriodClassification = {
    workingDays: 0,
    elapsedWorkingDays: 0,
    workedDays: 0,
    leaveDays: 0,
    absentDays: 0,
    absentDayKeys: [],
    workedOffDays: 0,
  };
  for (const d of eachDay(input.from, input.to)) {
    const working = isWorkingDay(d, input.holidays);
    const worked = input.workedDayKeys.has(d);
    if (!working) {
      if (worked) res.workedOffDays++;
      continue;
    }
    res.workingDays++;
    if (compareDays(d, input.today) > 0) continue; // futur
    res.elapsedWorkingDays++;
    if (worked) res.workedDays++;
    else if (input.approvedLeaveDayKeys.has(d)) res.leaveDays++;
    else {
      res.absentDays++;
      res.absentDayKeys.push(d);
    }
  }
  return res;
}

