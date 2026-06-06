import { z } from "zod";

export const PointageSchema = z.object({
  userId: z.string().cuid(),
  date: z.string().datetime(),
  entryTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).nullable(),
  exitTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).nullable(),
  duration: z.number().int().min(0).max(1440),
});

export type PointageData = z.infer<typeof PointageSchema>;
