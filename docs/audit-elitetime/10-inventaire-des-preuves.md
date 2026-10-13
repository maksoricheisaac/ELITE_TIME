# 10 — Inventaire des preuves, commandes exécutées et limites de l'audit

> Audit réalisé le 13/10/2026 (≈ 08:05 – 10:00, heure du serveur) depuis la session Windows `ELITENETWORK\ut08rm` sur `SVR-APP-PRD-01`, **sans élévation de privilèges**. Commit audité : `e3878d4` (`main`, arbre de travail propre avant et après l'audit, hors création de `docs/audit-elitetime/`).

---

## 1. Fichiers examinés

### 1.1 Racine et configuration
`.env.example` (noms et commentaires), `.gitignore`, `ecosystem.config.js`, `docker-compose.yml`, `.github/workflows/ci.yml`, `cd.yml`, `security-scan.yml`, `SECURITY_AUDIT.md` (plan + extraits), `MANUEL_EXPLOITATION_ELITETIME.md` (plan + Annexe E), `scripts/encrypt-import.ts` (en-tête), `scripts/package.json`, `scripts/dumps/elitetime-schema-20260606.sql` (en-tête + comptage).

### 1.2 Backend (lus intégralement sauf mention)
- `backend/package.json`, `tsconfig.json`, `prisma.config.ts`, `Dockerfile`, `ecosystem.config.cjs`, `prisma/schema.prisma`, `prisma/migrations/*/migration.sql` (tailles + opérations), `test/app.e2e-spec.ts`, `scripts/` (liste + en-têtes).
- `src/main.ts`, `app.module.ts`, `app.controller.ts`
- `src/auth/` : `auth.controller.ts`, `auth.service.ts`, `guards/auth.guard.ts`, `guards/permissions.guard.ts`, `decorators/*`, `interfaces/*`, `auth.module.ts`
- `src/users/users.controller.ts`, `users.service.ts`
- `src/pointages/pointages.controller.ts`, `pointages.service.ts`
- `src/breaks/breaks.controller.ts`, `breaks.service.ts`
- `src/absences/absences.controller.ts`, `absences.service.ts`, `dto/absence.dto.ts`
- `src/scheduler/scheduler.service.ts`, `src/websocket/websocket.gateway.ts`
- `src/ldap/ldap.controller.ts`, `ldap-sync.service.ts`
- `src/lib/crypto.ts`, `prisma-crypto.helper.ts`, `email.ts`, `graph-client.ts`, `reports/html-to-pdf.ts`, `reports/report-calculator.ts` (début), `reports/new-pointages-report-template.ts` et `email-body-template.ts` (échappement)
- `src/reports/reports.controller.ts`, `reports.service.ts`
- `src/email-scheduling/*`, `src/email/scheduled-email.service.ts` (extraits)
- `src/settings/*`, `src/permissions/*`, `src/logs/*`, `src/seed/seed.controller.ts`, `seed.service.ts` (extraits), `src/departments/departments.service.ts` (extrait), `src/dashboard/dashboard.service.ts` (début), `src/positions/positions.controller.ts` et `dashboard.controller.ts` (signatures)
- `src/ai/ai.controller.ts`, `security/ai-rbac.ts`, `dto/chat.dto.ts`, constantes de `ollama.service.ts`, `ai.service.ts`, `queue/`, `circuit-breaker/`
- `src/prisma/prisma.service.ts`, specs (`*.spec.ts`, en-têtes)

### 1.3 Frontend
`package.json`, `next.config.ts`, `proxy.ts`, `tsconfig.json` (strict), `src/lib/session.ts`, `api-client.ts`, `server-api.ts`, `websocket-client.ts`, `security/headers.ts`, `security/rbac.ts`, `navigation-guard.ts`, `navigation-registry.ts` (règles), tous les `app/api/**/route.ts` (en-têtes), `app/(app)/layout.tsx`, pages de test (gardes), recherches ciblées (`dangerouslySetInnerHTML`, `localStorage`, `ENCRYPTION_KEY`, `mockData`).

### 1.4 Serveur (hors dépôt)
`C:\inetpub\wwwroot\web.config`, `C:\inetpub\wwwroot\elitetime\web.config`, `C:\inetpub\elitetime\web.config`, `C:\backups\EliteTime\applicationHost.config.bak_20260527_090311` (sections `sites`, `proxy`, `allowedServerVariables`, `customHeaders` uniquement), `C:\Program Files\PostgreSQL\18\data\pg_hba.conf`, `postgresql.conf` (paramètres filtrés), `postgresql.auto.conf`, `C:\pm2-data\pm2-service-start.ps1`, `pm2-start.cmd`, `pm2.pid`, `module_conf.json`, `dump.pm2` (champs non secrets), fins des journaux `C:\pm2-data\logs\service-error.log`, `service-out.log`, `elitetime-backend-error.log` (adresses e-mail masquées), comptages sur `elitetime-backend-out.log`.

---

## 2. Commandes exécutées (toutes en lecture seule)

| # | Commande (résumé) | Objet | Résultat clé |
|---|---|---|---|
| 1 | `ls`, `find`, `wc`, `git log/branch/remote/status/ls-files/grep` | Inventaire du dépôt | 15 commits, remotes GitHub + GitLab, aucun `.env` versionné |
| 2 | `cat`/`sed`/`grep` sur les sources | Lecture du code | — |
| 3 | `Get-CimInstance Win32_OperatingSystem / ComputerSystem / LogicalDisk`, `Get-TimeZone`, `node -v`, `npm -v`, `git --version` | Système | WS2022, VMware, 4 vCPU, 8 Go, UTC+1, Node 24.13.0 |
| 4 | `pm2 -v` | Version PM2 | **A tenté de joindre/lancer le démon PM2 et a échoué (EPERM sur `C:\pm2-data\pm2.log`) ; aucun processus n'a été démarré ni modifié** (le démon existant PID 1920 est resté inchangé). Version relevée ensuite dans `package.json` de PM2 |
| 5 | `Get-NetTCPConnection -State Listen` | Ports | 80, 3000 (toutes interfaces), 4000 (local), 5432 (toutes), 11434 (local) |
| 6 | `Get-CimInstance Win32_Process` (+ `GetOwner`) | Processus | Propriétaires et lignes de commande non lisibles sans élévation |
| 7 | `Get-Service`, `Win32_Service` | Services | `PM2-EliteTime` arrêté (NSSM), `postgresql-x64-18` (NetworkService) |
| 8 | Lecture registre `HKLM\…\Services\PM2-EliteTime\Parameters` (noms de variables uniquement), `HKLM/HKCU\…\Run` | Démarrage | Clé `HKCU\Run\PM2` (pm2-windows-startup) |
| 9 | `Get-ScheduledTask` (hors `\Microsoft\`) | Tâches | Aucune visible |
| 10 | Script Node lisant `dump.pm2` en masquant les secrets | Config PM2 | 2 apps, 1 Go max, pas de rotation |
| 11 | Script Node lisant `backend/.env`, `frontend/.env` (noms, schéma LDAP, hôte BDD, longueur de clé, égalités de clés) | Configuration | `ldap://`, `COOKIE_SECURE=false`, BDD via `10.0.100.58`, clés identiques |
| 12 | `Get-WebSite` | IIS | Refusé (élévation requise) |
| 13 | `Get-NetFirewallProfile`, `Get-NetFirewallRule` + filtres de ports | Pare-feu | Règles 3000/4000 « Any », 5432 Domaine/Privé |
| 14 | `postgres.exe -V`, `pg_dump --version` | Version PG | 18.1 |
| 15 | `Resolve-DnsName elitetime.elitenetwork.local`, `Get-NetIPAddress` | DNS / IP | CNAME → `SVR-APP-PRD-01` → `10.0.100.58` |
| 16 | `curl` HEAD/GET sur `http://127.0.0.1/login`, `/api`, `/api/`, `/api/users`, `/api/ai/health` (Host = vhost), `http://10.0.100.58:3000/login`, `:4000/api`, `https://127.0.0.1/` | En-têtes, exposition | En-têtes de sécurité présents, `X-Powered-By`, `/api` → 404, `/api/users` → 401, 3000 joignable, 4000 non, pas de HTTPS |
| 17 | `Select-String` sur `elitetime-backend-error.log` ; `Test-NetConnection <DC> -Port 389/636` (hôte masqué) | Incident LDAP | 24 erreurs le 13/10 ; TCP 389 et 636 en échec |
| 18 | `Get-ChildItem` sur `C:\pm2-data`, `C:\pm2-data\logs`, `C:\backups`, `C:\inetpub` ; `Get-Acl` | Fichiers et droits | Pas de rotation, dump pré-chiffrement, ACL `Utilisateurs` |
| 19 | Recherche récursive de sauvegardes sur `C:\` (profondeur 4), `Win32_ShadowCopy`, agents de sauvegarde | Sauvegardes | Aucune sauvegarde régulière ; VSS non interrogeable |
| 20 | `npx prisma migrate status` | Migrations | « Database schema is up to date! » (lecture de `_prisma_migrations`) |
| 21 | `npx jest --ci --coverage --coverageDirectory <scratchpad>` | Tests unitaires | 142/146, couverture 16 % |
| 22 | `npm audit --omit=dev --json` (backend, frontend) | Vulnérabilités | 21 / 9 avis (envoie la liste des dépendances au registre npm) |
| 23 | Lecture des versions dans `node_modules/*/package.json` | Versions installées | Tableau `02` §2 |
| 24 | `git status --porcelain` après les tests | Non-modification | Arbre propre |

Aucune commande n'a modifié de fichier applicatif, de configuration, de service, de processus ou de donnée. Aucune requête authentifiée n'a été envoyée à l'application. Aucune donnée réelle d'employé n'a été lue en base (seule la table technique `_prisma_migrations` a été consultée par Prisma).

---

## 3. Éléments vérifiés — synthèse

| Domaine | Vérifié dans le code | Vérifié dans l'environnement |
|---|---|---|
| Stack et versions | ✓ | ✓ (versions installées) |
| Architecture et routage | ✓ | ✓ (ports, `web.config`, DNS) |
| Authentification, sessions, cookies | ✓ | partiel (`COOKIE_SECURE`, LDAP clair) |
| Chiffrement | ✓ | partiel (longueur/identité des clés, pas de valeurs) |
| RBAC | ✓ | — (aucun test authentifié) |
| Base de données | ✓ (schéma) | ✓ (version, config, migrations) |
| Processus, démarrage | ✓ | ✓ (PM2, NSSM, HKCU Run) |
| Sauvegardes | — | ✓ (absence constatée dans le périmètre accessible) |
| Journaux | ✓ | ✓ |
| Tests et dépendances | ✓ | ✓ (exécution, audit) |

---

## 4. Informations manquantes / à confirmer

| Élément | Pourquoi | Comment l'obtenir |
|---|---|---|
| Configuration IIS courante (site, pool, identité, `web.config` effectif, journaux) | Élévation requise | PowerShell **administrateur** : `Get-Website`, `Get-WebConfiguration`, `Get-IISAppPool`, lecture de `C:\Windows\System32\inetsrv\config\applicationHost.config` |
| Propriétaire des processus Node, identité du pool IIS | Élévation requise | `Get-Process -IncludeUserName` en administrateur |
| Tâches planifiées d'autres comptes, mécanisme de lancement d'Ollama | Élévation requise | `schtasks /query /v /fo list` en administrateur |
| Chiffrement du volume (BitLocker / Prim'X) | Élévation requise | `manage-bde -status` ; console Prim'X |
| Sauvegarde de la VM (snapshots, backup hyperviseur) | Hors serveur | Équipe virtualisation / sauvegarde |
| Sauvegarde et détention de la clé `ENCRYPTION_KEY` | Organisationnel | Responsable applicatif |
| Droits du compte PostgreSQL applicatif | Connexion BDD requise | `\du` et `\dp` en `psql` avec un compte d'administration |
| Permission Graph accordée (`Mail.Send` et périmètre), date d'expiration du secret | Portail Azure | Entra ID → App registrations |
| Politique de verrouillage de l'AD, contrôleurs disponibles | Annuaire | Administrateur AD |
| Comptes autorisés à ouvrir une session sur le serveur (RDP) | Stratégie de groupe | `secpol.msc` / GPO, groupe « Utilisateurs du Bureau à distance » |
| Rôles réellement attribués en base (nombre d'admins/managers, comptes locaux) | Lecture de données | Requête agrégée anonymisée (`SELECT role, "isLocal", count(*) FROM "User" GROUP BY 1,2`) |
| Exécution réelle des workflows GitHub | Hors serveur | Onglet Actions du dépôt |
| Exploitabilité des avis `npm audit` | Analyse dédiée | Revue des avis + tests en recette |
| Comportement exact en heure d'été (R-17) | Observation datée | Comparer des pointages d'été et d'hiver |

---

## 5. Limites de la mission

- **Audit statique** + vérifications non intrusives : **pas de test d'intrusion**, pas de test de charge, aucune exploitation des failles décrites ; les scénarios d'attaque sont déduits du code.
- Session **non élevée** : IIS, journaux IIS, chiffrement disque, tâches d'autres comptes et propriétaires de processus non vérifiés.
- Aucune lecture de données métier : les volumes, la qualité des données et les rôles effectifs ne sont pas connus.
- Les composants frontend volumineux (`features/*`) ont été examinés de manière ciblée (gardes, appels API), pas ligne à ligne.
- Le module IA a été examiné sur ses contrôles d'accès et paramètres, pas sur la qualité des réponses du modèle.
- L'état décrit est celui du 13/10/2026 ; l'incident LDAP en cours peut évoluer.
