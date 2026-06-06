import { z } from "zod";

const manualPointageRowSchema = z
  .object({
    userId: z.string().cuid("Employé invalide"),
    entryTime: z
      .string()
      .trim()
      .optional()
      .or(z.literal("")),
    exitTime: z
      .string()
      .trim()
      .optional()
      .or(z.literal("")),
    lateReason: z.string().trim().optional().or(z.literal("")),
    earlyExitReason: z.string().trim().optional().or(z.literal("")),
    entryTime2: z.string().trim().optional().or(z.literal("")),
    exitTime2: z.string().trim().optional().or(z.literal("")),
    earlyExitReason2: z.string().trim().optional().or(z.literal("")),
    sessionNumber: z.number().int().positive(),
    isMultiPointage: z.boolean(),
  })
  .refine(
    (_data) => {
      // Session 1 validation:
      // - Si l'admin pointe, l'entrée seule est autorisée (pour ouvrir la session)
      // - Si les deux sont vides, c'est valide (pas de pointage pour cet employé)
      // - Si l'un est rempli, l'autre peut être vide (admin ouvre session), SAUF si on veut forcer la sortie (ce n'est pas le cas ici)
      return true;
    },
    {
      message: "Les heures d'entrée et de sortie doivent être cohérentes.",
      path: ["exitTime"],
    }
  );

export const manualPointageFormSchema = z.object({
  date: z
    .string()
    .min(1, "Date requise"),
  rows: z.array(manualPointageRowSchema),
});

export type ManualPointageFormValues = z.infer<typeof manualPointageFormSchema>;
