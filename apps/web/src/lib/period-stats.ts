import {
  BUSINESS_TIME_ZONE,
  classifyPeriod,
  dayKeyOf,
  leaveBreakdown,
  normalizeHolidays,
  type DayKey,
  type PeriodClassification,
} from "@elitetime/time";

/**
 * Calculs de période côté interface — adaptateur mince au-dessus du moteur `@elitetime/time`
 * (mêmes règles que l'API, les rapports PDF/Excel et les tableaux de bord) :
 * jours ouvrés (lundi-vendredi hors fériés), jours travaillés / en congé approuvé / absents
 * mutuellement exclusifs, jours futurs jamais comptés absents.
 */

export const BUSINESS_TZ = BUSINESS_TIME_ZONE;

/** Jour calendaire (fuseau métier) d'un instant ou d'une chaîne ISO ; null si illisible. */
export function businessDayKey(value: Date | string | null | undefined): DayKey | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : dayKeyOf(d, BUSINESS_TZ);
}

export interface LeaveLike {
  userId?: string;
  status?: string;
  startDate: string | Date;
  endDate: string | Date;
}

/** Jours ouvrés couverts par des congés/absences APPROUVÉS, limités à la période (aucun double comptage). */
export function leaveDayKeys(
  absences: LeaveLike[],
  from: DayKey,
  to: DayKey,
  holidays?: unknown,
): Set<DayKey> {
  const h = normalizeHolidays(holidays);
  const keys = new Set<DayKey>();
  for (const a of absences) {
    if (a.status && a.status !== "approved") continue;
    leaveBreakdown(
      { startDate: a.startDate, endDate: a.endDate },
      { holidays: h, within: { from, to } },
    ).workingDayKeys.forEach((k) => keys.add(k));
  }
  return keys;
}

export function summarizePeriod(input: {
  from: DayKey;
  to: DayKey;
  /** Jours où l'employé a au moins un pointage */
  workedDayKeys: Iterable<DayKey>;
  absences: LeaveLike[];
  holidays?: unknown;
  today?: DayKey;
}): PeriodClassification {
  const holidays = normalizeHolidays(input.holidays);
  const leaveDays = leaveDayKeys(input.absences, input.from, input.to, input.holidays);
  return classifyPeriod({
    from: input.from,
    to: input.to,
    today: input.today ?? dayKeyOf(new Date(), BUSINESS_TZ),
    workedDayKeys: new Set(input.workedDayKeys),
    approvedLeaveDayKeys: leaveDays,
    holidays,
  });
}
