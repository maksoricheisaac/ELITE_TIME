/**
 * Unités et conversions — SOURCE UNIQUE.
 *
 * Convention de tout le moteur :
 *  - une DURÉE est un nombre ENTIER de minutes (jamais une chaîne, jamais des heures décimales) ;
 *  - une HEURE DE LA JOURNÉE est un nombre de minutes depuis minuit (0..1439) ;
 *  - un INSTANT est un `Date` (ms depuis l'epoch, UTC) ;
 *  - la conversion en texte lisible n'a lieu qu'à l'affichage.
 * Aucune division entière implicite : `floor`/`round` sont toujours explicites et nommés.
 */

export const MS_PER_MINUTE = 60_000;
export const MS_PER_DAY = 86_400_000;
export const MINUTES_PER_DAY = 1_440;

/** Convertit une valeur inconnue en nombre fini de minutes ≥ 0 (null/undefined/NaN/∞/négatif → 0). */
export function toSafeMinutes(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

/** Millisecondes → minutes entières (troncature : une minute entamée n'est pas comptée). */
export function msToMinutes(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.floor(ms / MS_PER_MINUTE);
}

/** Heures décimales → minutes entières (arrondi au plus proche : 7,75 h → 465 min). */
export function hoursToMinutes(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  return Math.round(hours * 60);
}

/**
 * Analyse une heure de la journée « H:mm » / « HH:mm » / « HH:mm:ss » → minutes depuis minuit (0..1439).
 * Renvoie `null` si la valeur est absente ou invalide (jamais NaN, jamais 24:00).
 */
export function parseHM(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null;
  const m = /^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Minutes depuis minuit → « HH:mm ». Les durées > 24 h sont acceptées (« 41:08 »). */
export function formatHM(minutes: number): string {
  const total = toSafeMinutes(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Durée → texte lisible : « 45 min », « 2h », « 7h45min ». */
export function formatDurationHuman(minutes: number): string {
  const total = toSafeMinutes(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}min`;
}

/** Pourcentage arrondi à l'entier, borné à [0, 100]·(max) — sans NaN si le dénominateur est nul. */
export function percent(part: number, total: number, max = 100): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(max, Math.round((part / total) * 100));
}
