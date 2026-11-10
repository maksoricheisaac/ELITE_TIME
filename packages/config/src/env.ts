import { z } from 'zod';

// Une variable vide (ex. "${LDAP_URL:-}" dans docker-compose) équivaut à non définie
const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);
const optionalString = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(1).optional(),
);
const boolString = z.preprocess(
  emptyToUndefined,
  z.enum(['true', 'false']).optional(),
);

/**
 * Variables lues par l'API (et le worker). Les noms sont ceux déjà utilisés
 * dans le code : aucun renommage. Seules DATABASE_URL et ENCRYPTION_KEY sont
 * obligatoires ; le reste garde le comportement historique (valeurs par défaut
 * dans le code appelant).
 */
export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: optionalString,

  DATABASE_URL: z.string().min(1, 'obligatoire'),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'doit faire exactement 64 caractères hexadécimaux'),

  NEXT_ALLOWED_ORIGINS: optionalString,
  COOKIE_SECURE: boolString,
  INTERNAL_SOCKET_TOKEN: optionalString,

  LDAP_URL: optionalString,
  LDAP_BIND_DN: optionalString,
  LDAP_PWD: optionalString,
  LDAP_BASE_DN: optionalString,

  AZURE_TENANT_ID: optionalString,
  AZURE_CLIENT_ID: optionalString,
  AZURE_CLIENT_SECRET: optionalString,
  GRAPH_SENDER_EMAIL: optionalString,

  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  SMTP_FROM: optionalString,

  OLLAMA_BASE_URL: optionalString,
  OLLAMA_MODEL: optionalString,

  DEV_ALLOW_LOCAL_LOGIN_ALL_ROLES: boolString,
  REDIS_URL: optionalString,
  REDIS_KEY_PREFIX: optionalString,
  THROTTLE_LIMIT: z.coerce.number().int().positive().optional(),
  THROTTLE_LOGIN_LIMIT: z.coerce.number().int().positive().optional(),
});

/**
 * Variables du worker : même base de données et même clé de chiffrement que
 * l'API (données chiffrées partagées) ; Redis est OBLIGATOIRE (BullMQ).
 */
export const workerEnvSchema = apiEnvSchema.extend({
  REDIS_URL: z.string().min(1, 'obligatoire (files BullMQ)'),
  WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(4100),
  WORKER_HEALTH_HOST: z.string().default('0.0.0.0'),
});

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export class EnvValidationError extends Error {}

/**
 * Valide `source` et lève une erreur listant les variables en défaut.
 * Les VALEURS ne figurent jamais dans le message (secrets).
 */
export function parseEnv<T extends z.ZodType>(
  schema: T,
  source: Record<string, string | undefined> = process.env,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `  - ${i.path.join('.') || '(racine)'} : ${i.message}`,
    );
    throw new EnvValidationError(
      `Configuration d'environnement invalide :\n${lines.join('\n')}`,
    );
  }
  return result.data;
}

/** Règles inter-variables : certaines options de développement sont interdites en production. */
function assertProductionSafety(env: ApiEnv) {
  if (env.NODE_ENV === 'production' && env.DEV_ALLOW_LOCAL_LOGIN_ALL_ROLES === 'true') {
    throw new EnvValidationError(
      "Configuration d'environnement invalide :\n  - DEV_ALLOW_LOCAL_LOGIN_ALL_ROLES : interdit en production",
    );
  }
}

export const validateApiEnv = (
  source?: Record<string, string | undefined>,
): ApiEnv => {
  const env = parseEnv(apiEnvSchema, source);
  assertProductionSafety(env);
  return env;
};

export const validateWorkerEnv = (
  source?: Record<string, string | undefined>,
): WorkerEnv => {
  const env = parseEnv(workerEnvSchema, source);
  assertProductionSafety(env);
  return env;
};
