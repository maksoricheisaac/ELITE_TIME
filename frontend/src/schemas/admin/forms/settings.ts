import { z } from "zod";

export const systemSettingsFormSchema = z.object({
  workStartTime: z
    .string()
    .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Format HH:MM invalide"),
  workEndTime: z
    .string()
    .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Format HH:MM invalide"),
  maxSessionEndTime: z
    .string()
    .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Format HH:MM invalide")
    .optional()
    .or(z.literal("")),
  breakDuration: z
    .coerce
    .number()
    .int()
    .min(0, "Minimum 0 minute")
    .max(480, "Maximum 480 minutes"),
  overtimeThreshold: z
    .coerce
    .number()
    .int()
    .min(0, "Minimum 0 heure")
    .max(24, "Maximum 24 heures"),
  holidays: z
    .array(
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (aaaa-mm-jj)"),
    )
    .max(50, "Maximum 50 jours fériés"),
  notificationsEnabled: z.boolean(),
  newHoliday: z
    .string()
    .regex(/^$|^\d{4}-\d{2}-\d{2}$/, "Date invalide (aaaa-mm-jj)"),
  ldapSyncEnabled: z.boolean(),
  ldapSyncIntervalMinutes: z
    .coerce
    .number()
    .int()
    .min(5, "Minimum 5 minutes")
    .max(1440, "Maximum 1440 minutes"),
  dailyReportMode: z.enum(["TODAY", "YESTERDAY"]),
});

export type SystemSettingsFormInput = z.input<typeof systemSettingsFormSchema>;
export type SystemSettingsFormValues = z.output<typeof systemSettingsFormSchema>;
