import { z } from "zod";

export const AbsenceSchema = z.object({
  userId: z.string().cuid(),
  type: z.enum(["conge", "maladie", "autre"]),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  reason: z.string().min(1, "Raison requise").max(500).trim(),
  comment: z.string().max(1000).trim().nullable(),
});

export type AbsenceData = z.infer<typeof AbsenceSchema>;
