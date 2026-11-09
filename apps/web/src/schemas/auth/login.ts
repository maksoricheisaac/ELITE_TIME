import { z } from "zod";

export const LoginSchema = z.object({
  username: z
    .string()
    .min(1, "Username requis")
    .max(100, "Username trop long")
    .regex(/^[a-zA-Z0-9._@-]+$/, "Caractères non autorisés")
    .trim(),
  password: z
    .string()
    .min(1, "Mot de passe requis")
    .max(255, "Mot de passe trop long"),
});

export type LoginData = z.infer<typeof LoginSchema>;
