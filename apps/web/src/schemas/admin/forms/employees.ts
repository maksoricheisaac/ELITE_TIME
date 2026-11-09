import { z } from "zod";

export const employeeUpdateFormSchema = z.object({
  id: z.string().cuid("ID employé invalide"),
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
    .email("Email invalide")
    .max(254, "Email trop long")
    .trim()
    .nullable()
    .optional(),
  role: z.enum(["employee", "team_lead", "manager", "admin"]),
  status: z.enum(["active", "inactive", "deleted"]),
  department: z
    .string()
    .max(100, "Département trop long")
    .trim()
    .nullable()
    .optional(),
  position: z
    .string()
    .max(100, "Poste trop long")
    .trim()
    .nullable()
    .optional(),
});

export const employeesFiltersSchema = z.object({
  search: z
    .string()
    .max(200, "Recherche trop longue")
    .trim()
    .optional(),
  department: z
    .string()
    .max(100, "Nom de département trop long")
    .trim()
    .optional(),
  role: z.enum(["all", "employee", "team_lead", "manager", "admin"]),
});

export type EmployeeUpdateFormInput = z.input<typeof employeeUpdateFormSchema>;
export type EmployeeUpdateFormValues = z.output<typeof employeeUpdateFormSchema>;
export type EmployeesFiltersValues = z.infer<typeof employeesFiltersSchema>;
