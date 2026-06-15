/**
 * Validation stricte des arguments transmis par le LLM aux outils IA.
 * AUCUN outil ne doit exécuter Prisma avec des données LLM non validées.
 * Pas de Zod (non disponible) — validation TypeScript pure, explicite.
 */

export interface ToolArgsValidation {
  valid: boolean;
  error?: string;
  sanitized: Record<string, unknown>;
}

/** YYYY-MM-DD strict */
const DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
/** YYYY seul */
const YEAR_REGEX = /^\d{4}$/;

const VALID_PERIODS = ['today', 'week', 'month'] as const;
const VALID_STATUSES = ['pending', 'approved', 'rejected'] as const;

/** Vérifie que la date YYYY-MM-DD est valide et non dans un futur lointain (max +1 jour) */
function isValidDate(dateStr: string): boolean {
  if (!DATE_REGEX.test(dateStr)) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(23, 59, 59, 999);
  return d <= tomorrow;
}

// ─────────────────────────────────────────────────────────────────────────────
// get_my_hours  →  { period?: 'today' | 'week' | 'month' }
// ─────────────────────────────────────────────────────────────────────────────
export function validateGetMyHoursArgs(
  args: Record<string, unknown>,
): ToolArgsValidation {
  const { period } = args;

  if (period === undefined || period === null || period === '') {
    return { valid: true, sanitized: { period: 'week' } };
  }
  if (typeof period !== 'string') {
    return {
      valid: false,
      error: 'Le champ period doit être une chaîne.',
      sanitized: {},
    };
  }
  if (!(VALID_PERIODS as readonly string[]).includes(period)) {
    return {
      valid: false,
      error: `Période invalide "${period}". Valeurs acceptées : ${VALID_PERIODS.join(', ')}.`,
      sanitized: {},
    };
  }
  return { valid: true, sanitized: { period } };
}

// ─────────────────────────────────────────────────────────────────────────────
// get_absent_today  →  { department?: string }
// ─────────────────────────────────────────────────────────────────────────────
export function validateGetAbsentTodayArgs(
  args: Record<string, unknown>,
): ToolArgsValidation {
  const { department } = args;

  if (department === undefined || department === null || department === '') {
    return { valid: true, sanitized: {} };
  }
  if (typeof department !== 'string') {
    return {
      valid: false,
      error: 'Le champ department doit être une chaîne.',
      sanitized: {},
    };
  }
  if (department.length > 100) {
    return {
      valid: false,
      error: 'Nom de département trop long (max 100 caractères).',
      sanitized: {},
    };
  }
  return { valid: true, sanitized: { department: department.trim() } };
}

// ─────────────────────────────────────────────────────────────────────────────
// get_late_employees  →  { date?: string (YYYY-MM-DD) }
// ─────────────────────────────────────────────────────────────────────────────
export function validateGetLateEmployeesArgs(
  args: Record<string, unknown>,
): ToolArgsValidation {
  const { date } = args;

  if (date === undefined || date === null || date === '') {
    return { valid: true, sanitized: {} };
  }
  if (typeof date !== 'string') {
    return {
      valid: false,
      error: 'Le champ date doit être une chaîne.',
      sanitized: {},
    };
  }
  if (!isValidDate(date)) {
    return {
      valid: false,
      error: `Date invalide "${date}". Format attendu : YYYY-MM-DD, passé ou aujourd'hui uniquement.`,
      sanitized: {},
    };
  }
  return { valid: true, sanitized: { date: date.trim() } };
}

// ─────────────────────────────────────────────────────────────────────────────
// get_leave_requests  →  { status?: 'pending' | 'approved' | 'rejected' }
// ─────────────────────────────────────────────────────────────────────────────
export function validateGetLeaveRequestsArgs(
  args: Record<string, unknown>,
): ToolArgsValidation {
  const { status } = args;

  if (status === undefined || status === null || status === '') {
    return { valid: true, sanitized: {} };
  }
  if (typeof status !== 'string') {
    return {
      valid: false,
      error: 'Le champ status doit être une chaîne.',
      sanitized: {},
    };
  }
  if (!(VALID_STATUSES as readonly string[]).includes(status)) {
    return {
      valid: false,
      error: `Statut invalide "${status}". Valeurs acceptées : ${VALID_STATUSES.join(', ')}.`,
      sanitized: {},
    };
  }
  return { valid: true, sanitized: { status } };
}

// ─────────────────────────────────────────────────────────────────────────────
// get_team_attendance  →  { date?: string (YYYY-MM-DD) }
// ─────────────────────────────────────────────────────────────────────────────
export function validateGetTeamAttendanceArgs(
  args: Record<string, unknown>,
): ToolArgsValidation {
  const { date } = args;

  if (date === undefined || date === null || date === '') {
    return { valid: true, sanitized: {} };
  }
  if (typeof date !== 'string') {
    return {
      valid: false,
      error: 'Le champ date doit être une chaîne.',
      sanitized: {},
    };
  }
  if (!isValidDate(date)) {
    return {
      valid: false,
      error: `Date invalide "${date}". Format attendu : YYYY-MM-DD, passé ou aujourd'hui uniquement.`,
      sanitized: {},
    };
  }
  return { valid: true, sanitized: { date: date.trim() } };
}

// ─────────────────────────────────────────────────────────────────────────────
// get_department_statistics  →  aucun argument attendu
// ─────────────────────────────────────────────────────────────────────────────
export function validateGetDepartmentStatisticsArgs(
  _args: Record<string, unknown>,
): ToolArgsValidation {
  return { valid: true, sanitized: {} };
}

// ─────────────────────────────────────────────────────────────────────────────
// get_my_pointage_history  →  { period?: 'today' | 'week' | 'month' }
// ─────────────────────────────────────────────────────────────────────────────
export function validateGetMyPointageHistoryArgs(
  args: Record<string, unknown>,
): ToolArgsValidation {
  const { period } = args;

  if (period === undefined || period === null || period === '') {
    return { valid: true, sanitized: { period: 'week' } };
  }
  if (typeof period !== 'string') {
    return {
      valid: false,
      error: 'Le champ period doit être une chaîne.',
      sanitized: {},
    };
  }
  if (!(VALID_PERIODS as readonly string[]).includes(period)) {
    return {
      valid: false,
      error: `Période invalide "${period}". Valeurs acceptées : ${VALID_PERIODS.join(', ')}.`,
      sanitized: {},
    };
  }
  return { valid: true, sanitized: { period } };
}

// ─────────────────────────────────────────────────────────────────────────────
// search_employee  →  { query: string }
// ─────────────────────────────────────────────────────────────────────────────
export function validateSearchEmployeeArgs(
  args: Record<string, unknown>,
): ToolArgsValidation {
  const { query } = args;

  if (typeof query !== 'string' || query.trim().length === 0) {
    return {
      valid: false,
      error: 'Le champ query est requis et doit être une chaîne non vide.',
      sanitized: {},
    };
  }
  if (query.length > 100) {
    return {
      valid: false,
      error: 'Recherche trop longue (max 100 caractères).',
      sanitized: {},
    };
  }
  return { valid: true, sanitized: { query: query.trim() } };
}

// ─────────────────────────────────────────────────────────────────────────────
// get_my_leaves_summary  →  { year?: string | number }
// ─────────────────────────────────────────────────────────────────────────────
export function validateGetMyLeavesSummaryArgs(
  args: Record<string, unknown>,
): ToolArgsValidation {
  const { year } = args;

  if (year === undefined || year === null || year === '') {
    return { valid: true, sanitized: {} };
  }

  const yearStr = typeof year === 'number' ? String(Math.trunc(year)) : year;

  if (typeof yearStr !== 'string' || !YEAR_REGEX.test(yearStr)) {
    return {
      valid: false,
      error: "L'année doit être un nombre à 4 chiffres (ex: 2025).",
      sanitized: {},
    };
  }

  const y = parseInt(yearStr, 10);
  const currentYear = new Date().getFullYear();

  if (y < 2000 || y > currentYear + 1) {
    return {
      valid: false,
      error: `Année hors limites. Plage autorisée : 2000–${currentYear + 1}.`,
      sanitized: {},
    };
  }

  return { valid: true, sanitized: { year: yearStr } };
}
