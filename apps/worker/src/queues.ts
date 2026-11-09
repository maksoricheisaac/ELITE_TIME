/** File BullMQ unique des tâches récurrentes. */
export const SCHEDULED_QUEUE = 'scheduled-tasks';

export const TASKS = {
  EXIT_REMINDER: 'exit-reminder',
  AUTO_CLOSE: 'auto-close-check',
  EMAIL_POLL: 'email-poll',
  RESOLVE_INCOMPLETE: 'resolve-incomplete',
  LDAP_SYNC: 'ldap-sync',
} as const;

export type TaskName = (typeof TASKS)[keyof typeof TASKS];

/**
 * Planification (équivalent des anciens @Cron / @Interval de l'API).
 * Un "job scheduler" BullMQ produit UN job par échéance, quel que soit le nombre
 * d'instances du worker : pas d'exécution multiple.
 */
export const SCHEDULES: Array<{
  id: TaskName;
  repeat: { pattern: string } | { every: number };
  attempts: number;
}> = [
  // 17:25 → 17:34 chaque minute (10 envois, comme l'ancienne fenêtre de 10 min)
  { id: TASKS.EXIT_REMINDER, repeat: { pattern: '25-34 17 * * *' }, attempts: 1 },
  { id: TASKS.AUTO_CLOSE, repeat: { every: 60_000 }, attempts: 1 },
  { id: TASKS.EMAIL_POLL, repeat: { every: 30_000 }, attempts: 1 },
  { id: TASKS.RESOLVE_INCOMPLETE, repeat: { every: 3_600_000 }, attempts: 2 },
  { id: TASKS.LDAP_SYNC, repeat: { every: 3_600_000 }, attempts: 3 },
];
