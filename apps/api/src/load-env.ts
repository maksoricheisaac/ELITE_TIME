import { config } from 'dotenv';

/**
 * Charge l'environnement avant tout autre module.
 * ELITETIME_ENV_FILE (liste séparée par des virgules) permet d'activer un profil
 * (ex. ".env.demo") prioritaire sur le .env par défaut. Aucune variable déjà
 * définie dans l'environnement du processus n'est écrasée.
 */
const profileFiles = (process.env.ELITETIME_ENV_FILE ?? '')
  .split(',')
  .map((f) => f.trim())
  .filter(Boolean);
if (profileFiles.length) config({ path: profileFiles, quiet: true });
config({ quiet: true });
