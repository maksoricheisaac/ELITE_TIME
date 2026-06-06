import { z } from "zod";
import { SystemSettingsSchema } from "@/schemas/admin/system-settings";
import { CreateUserSchema, UpdateUserSchema, UserIdSchema } from "@/schemas/admin/users";
import { LoginSchema } from "@/schemas/auth/login";
import { PointageSchema } from "@/schemas/employee/pointages";
import { AbsenceSchema } from "@/schemas/employee/absences";

// Helper pour valider et transformer les données
export function validateAndSanitize<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.issues.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      throw new Error(`Validation failed: ${JSON.stringify(formattedErrors)}`);
    }
    throw error;
  }
}

// Types exportés pour TypeScript
export { SystemSettingsSchema, CreateUserSchema, UpdateUserSchema, LoginSchema, UserIdSchema, PointageSchema, AbsenceSchema };
export type CreateUserData = z.infer<typeof CreateUserSchema>;
export type UpdateUserData = z.infer<typeof UpdateUserSchema>;
export type LoginData = z.infer<typeof LoginSchema>;
export type SystemSettingsData = z.infer<typeof SystemSettingsSchema>;
export type PointageData = z.infer<typeof PointageSchema>;
export type AbsenceData = z.infer<typeof AbsenceSchema>;
