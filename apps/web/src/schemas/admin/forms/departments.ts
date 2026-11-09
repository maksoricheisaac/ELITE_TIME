import { z } from "zod";

export const departmentUpdateFormSchema = z.object({
  id: z.string().cuid("ID de département invalide"),
  name: z
    .string()
    .min(1, "Nom requis")
    .max(100, "Nom trop long")
    .trim(),
  description: z
    .string()
    .max(255, "Description trop longue")
    .trim()
    .optional(),
});

export const createDepartmentFormSchema = z.object({
  name: z
    .string()
    .min(1, "Nom requis")
    .max(100, "Nom trop long")
    .trim(),
  description: z
    .string()
    .max(255, "Description trop longue")
    .trim()
    .optional(),
});

export const departmentsSearchSchema = z.object({
  q: z
    .string()
    .max(200, "Recherche trop longue")
    .trim()
    .optional(),
});

export type DepartmentUpdateFormValues = z.infer<typeof departmentUpdateFormSchema>;
export type CreateDepartmentFormValues = z.infer<typeof createDepartmentFormSchema>;
export type DepartmentsSearchValues = z.infer<typeof departmentsSearchSchema>;
