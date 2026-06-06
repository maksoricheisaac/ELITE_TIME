import { z } from "zod";

export const SystemSettingsSchema = z.object({
  workStartTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Format HH:MM invalide"),
  workEndTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Format HH:MM invalide"),
  maxSessionEndTime: z
    .string()
    .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Format HH:MM invalide")
    .optional(),
  breakDuration: z.number().int().min(0).max(480),
  overtimeThreshold: z.number().int().min(0).max(24),
  holidays: z.array(z.string()).max(50), // Changed from datetime to string as holidays are stored as ISO dates or simple strings
  notificationsEnabled: z.boolean(),
  emailNotificationsEnabled: z.boolean(),
  lateAlertsEnabled: z.boolean(),
  pointageRemindersEnabled: z.boolean(),
  ldapSyncEnabled: z.boolean(),
  ldapSyncIntervalMinutes: z.number().int().min(1).max(1440),
  ldapLastSyncAt: z.date().nullable().optional().or(z.string().datetime().nullable().optional()),
  dailyReportMode: z.enum(["TODAY", "YESTERDAY"]),
});

export type SystemSettingsData = z.infer<typeof SystemSettingsSchema>;
