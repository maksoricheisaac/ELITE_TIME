import { msToMinutes, parseHM, toSafeMinutes, MINUTES_PER_DAY } from './units';
import { BUSINESS_TIME_ZONE, addDays, zonedTimeToDate } from './zone';
import type { DayKey } from './zone';
import { isWorkingDay } from './calendar';

/**
 * Temps de travail d'UNE journée — règles uniques (voir docs/calculs-temporels.md).
 *
 *   temps travaillé = durée des sessions valides − pauses non rémunérées comprises dans ces sessions
 *
 *  - une session est l'intervalle réel [entrée ; sortie] (instants), jamais une différence de textes ;
 *  - les sessions qui se chevauchent sont FUSIONNÉES (aucune minute comptée deux fois) ;
 *  - les pauses qui se chevauchent sont fusionnées, puis ne sont déduites que pour la part comprise
 *    dans une session : une pause prise entre deux sessions (employé « sorti ») n'est jamais déduite ;
 *  - une pause en cours (sans fin) est bornée à la fin de la session ;
 *  - retard = première entrée de la journée après l'heure de début, un jour ouvré uniquement ;
 *  - heures sup. (règle journalière) = dernière sortie après l'heure de fin ;
 *  - départ anticipé = dernière sortie avant l'heure de fin (tolérance historique de 1 minute).
 */

export interface Interval {
  /** ms depuis l'epoch */
  start: number;
  end: number;
}

/** Fusionne les intervalles qui se touchent ou se chevauchent ; ignore les intervalles invalides/vides. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const valid = intervals
    .filter((i) => Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start)
    .sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of valid) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

/** Durée totale (ms) d'un ensemble d'intervalles SANS chevauchement (utiliser mergeIntervals avant). */
export function totalMs(merged: Interval[]): number {
  return merged.reduce((s, i) => s + (i.end - i.start), 0);
}

/** Durée (ms) de l'intersection entre deux ensembles d'intervalles déjà fusionnés. */
export function intersectionMs(a: Interval[], b: Interval[]): number {
  let ms = 0;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i].start, b[j].start);
    const end = Math.min(a[i].end, b[j].end);
    if (end > start) ms += end - start;
    if (a[i].end < b[j].end) i++;
    else j++;
  }
  return ms;
}

export interface SessionInput {
  /** « HH:mm » dans le fuseau métier, le jour de la journée traitée */
  entryTime: string | null | undefined;
  exitTime: string | null | undefined;
  sessionNumber?: number | null;
}

export interface BreakInput {
  /** Jour calendaire de la pause (par défaut : le jour de la journée traitée) */
  day?: DayKey;
  startTime: string | null | undefined;
  endTime: string | null | undefined;
}

export type BreakDeductionMode =
  /** Défaut — règle documentée : seules les pauses RÉELLEMENT enregistrées sont déduites */
  | 'recorded'
  /** Reproduit l'ancien forfait : si AUCUNE pause n'est enregistrée ce jour-là, on retire `flatBreakMinutes`, UNE fois par jour */
  | 'recorded_or_flat';

export interface DaySettings {
  /** « HH:mm » */
  workStartTime: string;
  workEndTime: string;
  breakDeductionMode?: BreakDeductionMode;
  /** Forfait (minutes) utilisé seulement avec `recorded_or_flat` */
  flatBreakMinutes?: number;
}

export interface DayContext {
  tz?: string;
  holidays?: ReadonlySet<DayKey>;
  /** Instant « maintenant » : borne les sessions/pauses ouvertes (injectable pour les tests) */
  now?: Date;
  /**
   * Autorise une sortie « antérieure » à l'entrée = sortie le LENDEMAIN (équipe de nuit). Désactivé par
   * défaut : aujourd'hui une sortie ≤ entrée est une erreur de saisie (voir validateSessionTimes).
   * La session est rattachée au jour de son ENTRÉE. Les heures sup. / départs anticipés ne sont pas
   * évalués pour ces journées (aucune règle métier définie pour le travail de nuit).
   */
  allowOvernight?: boolean;
}

export interface SessionTime {
  sessionNumber: number;
  /** Intervalle réel, `null` si la session est incomplète (entrée ou sortie absente/invalide) */
  interval: Interval | null;
  grossMinutes: number;
  /** Pauses réellement comprises dans CETTE session */
  breakMinutes: number;
  /** Durée nette de la session (c'est la valeur à stocker dans `duration`) */
  netMinutes: number;
  /** Entrée présente mais sortie absente */
  open: boolean;
}

export interface DayMetrics {
  day: DayKey;
  isWorkingDay: boolean;
  sessions: SessionTime[];
  /** Total des sessions valides (union), avant pauses */
  grossMinutes: number;
  /** Pauses déduites = intersection pauses ∩ sessions */
  breakMinutes: number;
  /** Pauses enregistrées ce jour (information), qu'elles tombent dans une session ou non */
  recordedBreakMinutes: number;
  /** Forfait déduit (mode `recorded_or_flat` uniquement) */
  flatDeductionMinutes: number;
  /** TEMPS TRAVAILLÉ de la journée */
  netMinutes: number;
  firstEntryMinute: number | null;
  lastExitMinute: number | null;
  lateMinutes: number;
  overtimeMinutes: number;
  earlyExitMinutes: number;
  hasOpenSession: boolean;
}

const asInterval = (day: DayKey, entry: number, exit: number, tz: string, overnight = false): Interval | null => {
  // Une sortie ≤ entrée n'est pas une session valide (saisie erronée) — le contrôle d'entrée la refuse ;
  // ici on se contente de ne JAMAIS produire de durée négative ni de session « inversée ».
  if (exit === entry) return null;
  if (exit < entry) {
    if (!overnight) return null;
    return {
      start: zonedTimeToDate(day, entry, tz).getTime(),
      end: zonedTimeToDate(addDays(day, 1), exit, tz).getTime(),
    };
  }
  return {
    start: zonedTimeToDate(day, entry, tz).getTime(),
    end: zonedTimeToDate(day, exit, tz).getTime(),
  };
};

/** Intervalle réel d'une session, ou `null` si entrée/sortie absentes ou incohérentes. */
export function sessionInterval(
  day: DayKey,
  s: SessionInput,
  tz: string = BUSINESS_TIME_ZONE,
  allowOvernight = false,
): Interval | null {
  const entry = parseHM(s.entryTime);
  const exit = parseHM(s.exitTime);
  if (entry === null || exit === null) return null;
  return asInterval(day, entry, exit, tz, allowOvernight);
}

/**
 * Validation À L'ÉCRITURE d'une session saisie à la main (manager/admin) : renvoie le message d'erreur
 * à présenter, ou `null` si la saisie est valide. Les calculs ne corrigent jamais silencieusement une
 * donnée invalide : on la refuse avant qu'elle n'entre en base.
 */
export function validateSessionTimes(entryTime: string | null | undefined, exitTime: string | null | undefined): string | null {
  if (entryTime != null && entryTime !== '' && parseHM(entryTime) === null) return "Heure d'entrée invalide (format HH:mm attendu)";
  if (exitTime != null && exitTime !== '' && parseHM(exitTime) === null) return 'Heure de sortie invalide (format HH:mm attendu)';
  const entry = parseHM(entryTime);
  const exit = parseHM(exitTime);
  if (entry === null && exit !== null) return "Une heure de sortie nécessite une heure d'entrée";
  if (entry !== null && exit !== null && exit <= entry) return "L'heure de sortie doit être postérieure à l'heure d'entrée";
  return null;
}

/**
 * Calcule toutes les métriques d'une journée à partir de ses sessions et de ses pauses.
 * C'est LA fonction que doivent appeler l'écriture des pointages, les rapports, les dashboards,
 * les exports et l'assistant : un même jeu de données donne partout le même résultat.
 */
export function computeDayMetrics(
  day: DayKey,
  sessionsIn: SessionInput[],
  breaksIn: BreakInput[],
  settings: DaySettings,
  ctx: DayContext = {},
): DayMetrics {
  const tz = ctx.tz ?? BUSINESS_TIME_ZONE;
  const now = ctx.now ?? new Date();
  const working = isWorkingDay(day, ctx.holidays);
  const startMin = parseHM(settings.workStartTime);
  const endMin = parseHM(settings.workEndTime);

  // 1. Sessions : une seule entrée par numéro de session (les doublons de base de données ne comptent qu'une fois)
  const byNumber = new Map<number, SessionInput>();
  sessionsIn.forEach((s, idx) => byNumber.set(s.sessionNumber ?? idx + 1, s));
  const ordered = [...byNumber.entries()].sort((a, b) => a[0] - b[0]);

  const sessions: SessionTime[] = ordered.map(([n, s]) => {
    const entry = parseHM(s.entryTime);
    const exit = parseHM(s.exitTime);
    const interval = entry !== null && exit !== null ? asInterval(day, entry, exit, tz, ctx.allowOvernight) : null;
    return {
      sessionNumber: n,
      interval,
      grossMinutes: interval ? msToMinutes(interval.end - interval.start) : 0,
      breakMinutes: 0,
      netMinutes: 0,
      open: entry !== null && exit === null,
    };
  });

  const merged = mergeIntervals(sessions.flatMap((s) => (s.interval ? [s.interval] : [])));

  // 2. Pauses : en cours → bornées à la fin de la session qui la contient (sinon à `now` plafonné à la journée)
  const rawBreaks: Interval[] = [];
  let recordedMs = 0;
  for (const b of breaksIn) {
    const bs = parseHM(b.startTime);
    if (bs === null) continue;
    const bDay = b.day ?? day;
    const be = parseHM(b.endTime);
    let end: number;
    if (be !== null) {
      if (be === bs || (be < bs && !ctx.allowOvernight)) continue; // pause incohérente : ignorée, jamais de durée négative
      end = zonedTimeToDate(be < bs ? addDays(bDay, 1) : bDay, be, tz).getTime();
    } else {
      const start = zonedTimeToDate(bDay, bs, tz).getTime();
      const container = merged.find((i) => start >= i.start && start < i.end);
      const dayEndMs = zonedTimeToDate(addDays(bDay, 1), 0, tz).getTime();
      end = container ? container.end : Math.min(now.getTime(), dayEndMs);
    }
    const start = zonedTimeToDate(bDay, bs, tz).getTime();
    if (end > start) {
      rawBreaks.push({ start, end });
      recordedMs += end - start;
    }
  }
  const mergedBreaks = mergeIntervals(rawBreaks);
  recordedMs = totalMs(mergedBreaks);

  // 3. Par session : pauses comprises dans la session
  for (const s of sessions) {
    if (!s.interval) continue;
    s.breakMinutes = msToMinutes(intersectionMs([s.interval], mergedBreaks));
  }

  const grossMinutes = msToMinutes(totalMs(merged));
  const breakMinutes = msToMinutes(intersectionMs(merged, mergedBreaks));

  // 4. Forfait historique (optionnel) : UNE fois par jour, uniquement si aucune pause n'est enregistrée
  let flat = 0;
  if (settings.breakDeductionMode === 'recorded_or_flat' && mergedBreaks.length === 0) {
    flat = Math.min(toSafeMinutes(settings.flatBreakMinutes), grossMinutes);
  }

  const netMinutes = Math.max(0, grossMinutes - breakMinutes - flat);

  // 5. Valeur nette par session (à stocker) : la répartition suit les minutes réellement travaillées,
  //    et la somme des sessions (non chevauchantes) redonne exactement netMinutes.
  let flatLeft = flat;
  for (const s of sessions) {
    if (!s.interval) continue;
    const take = Math.min(flatLeft, Math.max(0, s.grossMinutes - s.breakMinutes));
    flatLeft -= take;
    s.netMinutes = Math.max(0, s.grossMinutes - s.breakMinutes - take);
  }

  // 6. Retard / heures sup. / départ anticipé (une entrée seule suffit pour le retard)
  const entries = ordered.map(([, s]) => parseHM(s.entryTime)).filter((v): v is number => v !== null);
  const exits = ordered.map(([, s]) => parseHM(s.exitTime)).filter((v): v is number => v !== null);
  const firstEntry = entries.length ? Math.min(...entries) : null;
  const lastExit = exits.length ? Math.max(...exits) : null;

  // Équipe de nuit (option) : une sortie avant l'entrée est une sortie le lendemain
  const overnight =
    ctx.allowOvernight === true &&
    ordered.some(([, s]) => {
      const e = parseHM(s.entryTime);
      const x = parseHM(s.exitTime);
      return e !== null && x !== null && x < e;
    });
  const lateMinutes = working && firstEntry !== null && startMin !== null && firstEntry > startMin ? firstEntry - startMin : 0;
  let overtimeMinutes = 0;
  let earlyExitMinutes = 0;
  if (!overnight && lastExit !== null && endMin !== null) {
    if (lastExit > endMin) overtimeMinutes = lastExit - endMin;
    else if (lastExit < endMin - 1) earlyExitMinutes = endMin - lastExit;
  }

  return {
    day,
    isWorkingDay: working,
    sessions,
    grossMinutes,
    breakMinutes,
    recordedBreakMinutes: msToMinutes(recordedMs),
    flatDeductionMinutes: flat,
    netMinutes,
    firstEntryMinute: firstEntry,
    lastExitMinute: lastExit,
    lateMinutes: Math.min(lateMinutes, MINUTES_PER_DAY),
    overtimeMinutes,
    earlyExitMinutes,
    hasOpenSession: sessions.some((s) => s.open),
  };
}

/** Minutes de retard d'une entrée isolée (même règle que computeDayMetrics) — pour les contrôles à l'écriture. */
export function lateMinutesFor(
  day: DayKey,
  entryTime: string | null | undefined,
  workStartTime: string,
  holidays?: ReadonlySet<DayKey>,
): number {
  const entry = parseHM(entryTime);
  const start = parseHM(workStartTime);
  if (entry === null || start === null || !isWorkingDay(day, holidays)) return 0;
  return entry > start ? entry - start : 0;
}

export interface PeriodTotals {
  days: number;
  netMinutes: number;
  grossMinutes: number;
  breakMinutes: number;
  lateDays: number;
  lateMinutes: number;
  overtimeMinutes: number;
  earlyExitDays: number;
  incompleteDays: number;
}

/** Agrège des journées : somme d'ENTIERS (aucun arrondi intermédiaire) ; les moyennes se font à l'affichage. */
export function aggregateDays(days: DayMetrics[]): PeriodTotals {
  const t: PeriodTotals = {
    days: days.length,
    netMinutes: 0,
    grossMinutes: 0,
    breakMinutes: 0,
    lateDays: 0,
    lateMinutes: 0,
    overtimeMinutes: 0,
    earlyExitDays: 0,
    incompleteDays: 0,
  };
  for (const d of days) {
    t.netMinutes += d.netMinutes;
    t.grossMinutes += d.grossMinutes;
    t.breakMinutes += d.breakMinutes;
    if (d.lateMinutes > 0) {
      t.lateDays++;
      t.lateMinutes += d.lateMinutes;
    }
    t.overtimeMinutes += d.overtimeMinutes;
    if (d.earlyExitMinutes > 0) t.earlyExitDays++;
    if (d.hasOpenSession) t.incompleteDays++;
  }
  return t;
}

