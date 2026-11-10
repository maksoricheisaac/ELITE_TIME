import { businessTimeZone } from './work-time.service';

/**
 * Aligne le fuseau du PROCESSUS sur le fuseau métier (Africa/Brazzaville par défaut).
 *
 * Les calculs métier passent par `@elitetime/time` avec un fuseau explicite et ne dépendent donc pas de
 * `TZ`. Mais les plannings (@Cron), les `toLocale*String` et les derniers `getHours()` résiduels, eux,
 * suivent le fuseau du processus : on le fixe pour qu'il n'y ait AUCUN écart entre « l'heure du serveur »
 * et « l'heure de l'entreprise », quel que soit l'hôte (Docker en UTC, Windows, etc.).
 *
 * À importer en tout premier dans chaque point d'entrée (api, worker), après le chargement du .env.
 */
const tz = businessTimeZone();
if (process.env.TZ !== tz) {
  process.env.TZ = tz;
}
