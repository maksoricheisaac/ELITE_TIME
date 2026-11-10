import { MS_PER_DAY } from './units';

/**
 * Fuseau horaire MÉTIER d'ELITE TIME : Africa/Brazzaville (UTC+1, sans heure d'été).
 *
 * Stratégie temporelle de toute l'application :
 *  1. la base de données stocke des INSTANTS (UTC) ;
 *  2. les heures de pointage « HH:mm » et les jours calendaires sont exprimés dans le fuseau MÉTIER ;
 *  3. tout rattachement d'un instant à un jour passe par `dayKeyOf(date, tz)` — jamais par
 *     `toISOString().slice(0, 10)` (UTC) ni par les getters « locaux » du processus ;
 *  4. les bornes d'une journée sont `dayStart` / `dayEnd` dans ce fuseau.
 * Le fuseau est passé EXPLICITEMENT : les tests et les calculs ne dépendent pas du `TZ` de la machine.
 */
export const BUSINESS_TIME_ZONE = 'Africa/Brazzaville';

/** Jour calendaire « AAAA-MM-JJ » (sans heure, sans fuseau). */
export type DayKey = string;

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
  weekday: number; // 0 = dimanche … 6 = samedi
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    formatterCache.set(tz, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Décompose un instant en champs calendaires dans le fuseau donné. */
export function zonedParts(date: Date, tz: string = BUSINESS_TIME_ZONE): ZonedParts {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new RangeError('Date invalide');
  }
  const get: Record<string, string> = {};
  for (const p of formatter(tz).formatToParts(date)) get[p.type] = p.value;
  return {
    year: Number(get.year),
    month: Number(get.month),
    day: Number(get.day),
    hour: Number(get.hour) % 24,
    minute: Number(get.minute),
    second: Number(get.second),
    weekday: WEEKDAYS[get.weekday] ?? 0,
  };
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Jour calendaire de l'instant dans le fuseau. */
export function dayKeyOf(date: Date, tz: string = BUSINESS_TIME_ZONE): DayKey {
  const p = zonedParts(date, tz);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

/** Heure de la journée (minutes depuis minuit) de l'instant dans le fuseau. */
export function minuteOfDay(date: Date, tz: string = BUSINESS_TIME_ZONE): number {
  const p = zonedParts(date, tz);
  return p.hour * 60 + p.minute;
}

const DAY_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `true` si la chaîne est un jour calendaire réel (le 2026-02-30 est refusé). */
export function isValidDayKey(value: unknown): value is DayKey {
  if (typeof value !== 'string') return false;
  const m = DAY_KEY_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
}

function assertDayKey(value: string): [number, number, number] {
  if (!isValidDayKey(value)) throw new RangeError(`Jour invalide : « ${String(value)} »`);
  const m = DAY_KEY_RE.exec(value)!;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Jour de la semaine d'un jour calendaire (0 = dimanche … 6 = samedi) — indépendant de tout fuseau. */
export function weekdayOf(day: DayKey): number {
  const [y, m, d] = assertDayKey(day);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Arithmétique calendaire pure : `addDays('2026-12-31', 1)` → `'2027-01-01'`. */
export function addDays(day: DayKey, delta: number): DayKey {
  const [y, m, d] = assertDayKey(day);
  const t = new Date(Date.UTC(y, m - 1, d) + delta * MS_PER_DAY);
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Nombre de jours calendaires de `from` à `to` INCLUS (0 si `to` < `from`). */
export function daysInclusive(from: DayKey, to: DayKey): number {
  const [fy, fm, fd] = assertDayKey(from);
  const [ty, tm, td] = assertDayKey(to);
  const diff = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / MS_PER_DAY);
  return diff < 0 ? 0 : diff + 1;
}

/** Tous les jours de `from` à `to` inclus (vide si `to` < `from`). */
export function eachDay(from: DayKey, to: DayKey): DayKey[] {
  const n = daysInclusive(from, to);
  const out: DayKey[] = [];
  for (let i = 0; i < n; i++) out.push(addDays(from, i));
  return out;
}

export function compareDays(a: DayKey, b: DayKey): number {
  return a < b ? -1 : a > b ? 1 : 0; // l'ordre lexicographique de AAAA-MM-JJ est l'ordre chronologique
}

/** Premier jour de la semaine contenant `day` (`weekStart` : 1 = lundi par défaut, 0 = dimanche). */
export function startOfWeek(day: DayKey, weekStart = 1): DayKey {
  const back = (weekdayOf(day) - weekStart + 7) % 7;
  return addDays(day, -back);
}

/** Décalage (ms) du fuseau par rapport à l'UTC à l'instant donné. */
function offsetMs(instant: Date, tz: string): number {
  const p = zonedParts(instant, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Instant correspondant à « jour + heure (minutes depuis minuit) » DANS le fuseau.
 * Fonctionne pour tout fuseau IANA, y compris avec heure d'été (deux passes pour absorber le changement).
 */
export function zonedTimeToDate(day: DayKey, minutes: number, tz: string = BUSINESS_TIME_ZONE): Date {
  const [y, m, d] = assertDayKey(day);
  const wall = Date.UTC(y, m - 1, d, 0, 0, 0) + Math.round(minutes) * 60_000;
  let guess = new Date(wall - offsetMs(new Date(wall), tz));
  guess = new Date(wall - offsetMs(guess, tz));
  return guess;
}

/** Instant du début de journée (00:00:00.000) dans le fuseau. */
export function dayStart(day: DayKey, tz: string = BUSINESS_TIME_ZONE): Date {
  return zonedTimeToDate(day, 0, tz);
}

/** Instant de la fin de journée (23:59:59.999) dans le fuseau. */
export function dayEnd(day: DayKey, tz: string = BUSINESS_TIME_ZONE): Date {
  return new Date(dayStart(addDays(day, 1), tz).getTime() - 1);
}

/** Jour courant dans le fuseau (injectable pour les tests via `now`). */
export function todayKey(tz: string = BUSINESS_TIME_ZONE, now: Date = new Date()): DayKey {
  return dayKeyOf(now, tz);
}
