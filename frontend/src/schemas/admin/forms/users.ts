import { z } from "zod";

export const adminCreateUserFormSchema = z.object({
  email: z
    .string()
    .email("Email invalide")
    .max(254, "Email trop long")
    .trim(),
  username: z
    .string()
    .min(3, "Username trop court")
    .max(50, "Username trop long")
    .regex(/^[a-zA-Z0-9._-]+$/, "Caractères non autorisés")
    .toLowerCase()
    .trim(),
  firstname: z
    .string()
    .max(100, "Prénom trop long")
    .trim()
    .optional(),
  lastname: z
    .string()
    .max(100, "Nom trop long")
    .trim()
    .optional(),
  role: z.enum(["employee", "team_lead", "manager", "admin"]).default("employee"),
  department: z
    .string()
    .max(100, "Service trop long")
    .trim()
    .optional(),
  position: z
    .string()
    .max(100, "Poste trop long")
    .trim()
    .optional(),
  includeInReports: z.boolean().default(true),
});

export const adminEditUserFormSchema = z.object({
  firstname: z
    .string()
    .max(100, "Prénom trop long")
    .trim()
    .optional(),
  lastname: z
    .string()
    .max(100, "Nom trop long")
    .trim()
    .optional(),
  email: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), { message: "Email invalide" })
    .refine((v) => !v || v.length <= 254, { message: "Email trop long" }),
  role: z.enum(["employee", "team_lead", "manager", "admin"]),
  department: z
    .string()
    .max(100, "Service trop long")
    .trim()
    .optional(),
  position: z
    .string()
    .max(100, "Poste trop long")
    .trim()
    .optional(),
  status: z.enum(["active", "inactive"]),
  includeInReports: z.boolean().default(true),
});

export const adminUsersFiltersSchema = z.object({
  search: z
    .string()
    .max(200, "Recherche trop longue")
    .trim()
    .optional(),
  role: z.enum(["all", "employee", "team_lead", "manager", "admin"]).default("all"),
  department: z
    .union([
      z.literal("all"),
      z
        .string()
        .max(100, "Service trop long")
        .trim(),
    ])
    .optional(),
});

export type AdminCreateUserFormInput = z.input<typeof adminCreateUserFormSchema>;
export type AdminCreateUserFormValues = z.output<typeof adminCreateUserFormSchema>;
export type AdminEditUserFormInput = z.input<typeof adminEditUserFormSchema>;
export type AdminEditUserFormValues = z.output<typeof adminEditUserFormSchema>;
export type AdminUsersFiltersInput = z.input<typeof adminUsersFiltersSchema>;
export type AdminUsersFiltersValues = z.output<typeof adminUsersFiltersSchema>;
