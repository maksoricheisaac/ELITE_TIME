# 06 — API, WebSocket, intégrations et traitements automatiques

> Inventaire établi à partir des décorateurs NestJS (`backend/src/**/*.controller.ts`) et des route handlers Next.js (`frontend/app/api/**/route.ts`). Aucune route n'a été inventée. Préfixe global NestJS : `/api` (`main.ts`). Sauf mention, l'authentification est le cookie `elitetime_session` vérifié par `AuthGuard`.
>
> Abréviations : **Auth** = `AuthGuard` ; **Perm** = permission exigée par `@RequirePermissions` (ET logique) ; **DTO** = validation `class-validator` ; « — » = aucune.

---

## 1. Codes d'erreur communs

| Code | Origine |
|---|---|
| 400 | `BadRequestException` métier ou DTO invalide (`ValidationPipe`) |
| 401 | `Session manquante` / `Session invalide` / `Session expirée` / `Compte inactif` (AuthGuard) ; identifiants invalides |
| 403 | `Permissions insuffisantes` (PermissionsGuard) ; périmètre département ; compte local non admin/manager |
| 404 | `NotFoundException` (utilisateur, absence, permission introuvable) ; route inexistante |
| 409 | Nom d'utilisateur déjà existant (création) |
| 429 | Limite IA (60 requêtes/heure/utilisateur) ; limite de connexion (**inopérante**, voir `04` S-02) |
| 500 | Erreur non gérée (Prisma, valeurs invalides non validées) |
| 503 | LDAP non configuré ou injoignable (« Service temporairement indisponible ») |

---

## 2. Routes HTTP NestJS

### 2.1 Racine et authentification (`app.controller.ts`, `auth/auth.controller.ts`)

| Méthode | Chemin | Auth | Perm | Entrée | Sortie / effet |
|---|---|---|---|---|---|
| GET | `/api` | — | — | — | `"Hello World!"` (seul indicateur de vie disponible) |
| POST | `/api/auth/login` | — | — | `{username, password}` (non validé) | Pose le cookie ; `{success, user}` ; écrit `Session`, `ActivityLog` ; crée/maj l'utilisateur AD |
| POST | `/api/auth/logout` | Auth | — | — | Supprime la session, efface le cookie |
| GET | `/api/auth/me` | Auth | — | — | `{user}` (déchiffré, sans mot de passe) |
| GET | `/api/auth/permissions` | Auth | — | — | `{permissions: string[]}` (admin = toutes ; sinon défauts du rôle ∪ individuelles) |

IIS réécrit `/api/login`, `/api/logout`, `/api/me`, `/api/permissions`, `/api/user/permissions` vers ces routes.

### 2.2 Utilisateurs (`users/users.controller.ts`) — `Auth` au niveau classe

| Méthode | Chemin | Perm | Contrôle supplémentaire | Entrée | Sortie |
|---|---|---|---|---|---|
| GET | `/api/users` | — | admin/manager/team_lead : tout ; employé : selon permissions individuelles (département) | `search`, `role`, `status`, `hiddenFromLists`, `department`, `page`, `limit` (défaut 1000) | `{users, total, page, limit}` ; **`search` est ignoré** par le service |
| GET | `/api/users/me` | — | — | — | Profil |
| GET | `/api/users/:id` | — | Soi-même ; rôles privilégiés ; employé avec permission → sinon `null` (200) | — | Utilisateur |
| POST | `/api/users` | `employees.create` | — | Corps libre (username, email, noms, password, role, status, isLocal…) | Utilisateur créé (+ `HiddenUsername`) |
| PATCH | `/api/users/me/profile` | — | — | `{firstname?, lastname?}` | Profil |
| PATCH | `/api/users/me/password` | — | Ancien mot de passe vérifié | `{oldPassword, newPassword}` (aucune règle) | `{success}` |
| PATCH | `/api/users/:id` | `employees.edit` | **Aucun** (voir S-01) | email, noms, **role**, **status**, department, position, drapeaux, teamLeadId | Utilisateur |
| PATCH | `/api/users/:id/include-in-reports` | `employees.toggle_reports` | — | `{include}` | Utilisateur |
| DELETE | `/api/users/:id` | `employees.delete` | — | — | Soft delete |

### 2.3 Pointages (`pointages/pointages.controller.ts`) — `Auth` + `PermissionsGuard`

| Méthode | Chemin | Perm | Contrôle de périmètre | Entrée | Sortie |
|---|---|---|---|---|---|
| GET | `/api/pointages` | — | `userId` honoré si rôle privilégié ou permission (sinon soi-même) | `userId?`, `from`, `to` | Pointages déchiffrés |
| GET | `/api/pointages/week-stats` | — | idem | `userId?` | `{hours, lates, overtime}` |
| GET | `/api/pointages/today` | — | idem ; peut **clôturer** une session dépassant l'heure limite | `userId?` | Pointage du jour |
| GET | `/api/pointages/today/all` | — | idem | `userId?` | Sessions du jour |
| GET | `/api/pointages/incomplete` | — | soi-même | — | 5 derniers incomplets |
| POST | `/api/pointages/start` | — | soi-même | `{earlyExitReason?}` | Pointage |
| POST | `/api/pointages/end` | — | soi-même | `{earlyExitReason?}` | `{pointage, isEarlyExit, earlyExitMinutes}` |
| PATCH | `/api/pointages/today/late-reason` | — | soi-même | `{reason}` | Pointage |
| PATCH | `/api/pointages/:id/late-reason` | — | `id` + `userId` courant | `{reason}` | Pointage |
| PATCH | `/api/pointages/:id/early-exit-reason` | — | `id` + `userId` courant (500 si introuvable) | `{reason}` | Pointage |
| GET | `/api/pointages/manager/by-date` | `pointages.create` | **Aucun** | `date`, `userIds` (CSV, obligatoire — 500 si absent) | Pointages |
| POST | `/api/pointages/manager` | `pointages.create` | **Aucun** | `{userId, date, entryTime?, exitTime?, lateReason?, earlyExitReason?, sessionNumber?}` | Pointage (upsert) |
| DELETE | `/api/pointages/manager/extra-sessions` | `pointages.delete` | **Aucun** | `userId`, `date` | Suppression physique des sessions > 1 |

### 2.4 Pauses (`breaks/breaks.controller.ts`) — `Auth` seulement

| Méthode | Chemin | Contrôle | Sortie |
|---|---|---|---|
| GET | `/api/breaks/today` | `userId?` honoré si rôle privilégié ou permission | Pauses du jour |
| POST | `/api/breaks/start` | soi-même ; refus si pause en cours | Pause |
| POST | `/api/breaks/end` | soi-même | Pause (ou `null`) |

### 2.5 Absences (`absences/absences.controller.ts`) — `Auth` + `PermissionsGuard`, DTO

| Méthode | Chemin | Perm | Contrôle | Entrée (DTO) |
|---|---|---|---|---|
| GET | `/api/absences` | `absences.view_self` | `userId` d'autrui si accès équipe (pas de contrôle de département) | `userId?` |
| GET | `/api/absences/team` | — (contrôle manuel OU) | `view_team/view_all/approve/reports.view_*` ; filtrage département sauf `view_all`/admin | — |
| POST | `/api/absences` | `absences.create` | soi-même ; chevauchement interdit | `CreateAbsenceDto` |
| PATCH | `/api/absences/:id` | `absences.edit` | propriétaire + `pending` | `UpdateOwnAbsenceDto` |
| DELETE | `/api/absences/:id` | `absences.delete` | propriétaire + `pending` → `cancelled` | — |
| PATCH | `/api/absences/:id/approve` | `absences.approve` | département ; `pending` | — |
| PATCH | `/api/absences/:id/reject` | `absences.reject` | département ; `pending` | `RejectAbsenceDto` |
| POST | `/api/absences/managed` | `absences.create_managed` | département (si l'employé existe) | `CreateManagedAbsenceDto` |
| PATCH | `/api/absences/managed/:id` | `absences.edit_managed` | département ; `pending` sauf admin | `UpdateManagedAbsenceDto` |
| DELETE | `/api/absences/managed/:id` | `absences.delete_managed` | département ; `pending` sauf admin → `cancelled` | — |
| PATCH | `/api/absences/managed/:id/hide` | `absences.delete_managed` | département | — |

### 2.6 Organisation

| Méthode | Chemin | Perm | Entrée |
|---|---|---|---|
| GET | `/api/departments` | `departments.view` | — |
| GET | `/api/departments/:id` | `departments.view` | — |
| POST | `/api/departments` | `departments.create` | `{name, description?}` |
| PATCH | `/api/departments/:id` | `departments.edit` | `{name?, description?}` — le renommage tente un `user.updateMany({ department: <ancien nom en clair> })` dans une transaction (`departments.service.ts:40-47`) ; `User.department` étant **chiffré**, aucune ligne ne correspond : les employés gardent l'ancien libellé et perdent leur rattachement |
| DELETE | `/api/departments/:id` | `departments.delete` | — (cascade sur les postes) |
| GET | `/api/positions` | `positions.view` | `departmentId?` |
| POST | `/api/positions` | `positions.create` | `{name, departmentId, description?}` |
| PATCH | `/api/positions/:id` | `positions.edit` | — |
| DELETE | `/api/positions/:id` | `positions.delete` | — |

### 2.7 Tableaux de bord et rapports

| Méthode | Chemin | Perm | Entrée | Sortie |
|---|---|---|---|---|
| GET | `/api/dashboard/admin/stats` | `dashboard.view_global` | — | Totaux par rôle, présents du jour, effectifs par département |
| GET | `/api/dashboard/admin/chart` | `dashboard.view_global` | `from`, `to` | `{presence[], retards[]}` |
| GET | `/api/dashboard/manager/stats` | `dashboard.view_team` | — | Statistiques du département |
| GET | `/api/dashboard/manager/chart` | `dashboard.view_team` | `from`, `to` | Séries du département |
| GET | `/api/reports/pdf` | `reports.export_pdf` | `from`, `to`, `employeeId?` | `application/pdf` (Chromium) |
| GET | `/api/reports/excel` | `reports.export_excel` | `from`, `to`, `employeeId?` | `.xlsx` |
| GET | `/api/reports/team` | `reports.view_team` | `days?` (défaut 90, non borné) | Utilisateurs + pointages + pauses du département |

### 2.8 Administration

| Méthode | Chemin | Perm | Entrée | Effet |
|---|---|---|---|---|
| GET | `/api/settings` | `settings.view` | — | Paramètres (création des valeurs par défaut si absentes) |
| PATCH | `/api/settings` | `settings.general` | Corps libre **non validé** | Mise à jour |
| GET | `/api/permissions` | `permissions.view` | — | Catalogue |
| GET | `/api/permissions/user/:userId` | `permissions.view` | — | Permissions individuelles |
| POST | `/api/permissions/user/:userId` | `permissions.assign` | `{permissionId}` | Octroi + événement `permissions_changed` |
| DELETE | `/api/permissions/user/:userId/:permissionId` | `permissions.revoke` | — | Révocation + événement |
| POST | `/api/permissions/user/:userId/reset` | `permissions.reset` | — | Suppression de toutes les permissions individuelles |
| GET | `/api/logs` | `logs.view` | `page`, `limit` (non borné), `type`, `userId`, `from`, `to` | Journal paginé |
| GET | `/api/logs/employees` | `logs.view` | — | Utilisateurs actifs (filtre) |
| GET | `/api/email-scheduling` | `emails.view` | — | Jobs, destinataires, utilisateurs éligibles (le champ `username` y est renvoyé **chiffré**) |
| POST | `/api/email-scheduling` | `emails.configure` | `{type, enabled, hour, minute, weekday?, …, recipientUserIds?, recipientEmails?, dailyReportMode?}` non validé | Upsert du job, remplacement des destinataires |
| POST | `/api/ldap/sync` | `ldap.sync` | — | Synchronisation AD immédiate |
| GET | `/api/ldap/users` | `ldap.view_users` | — | Liste brute des comptes AD (login + désactivé) |
| POST | `/api/admin/seed/first-admin` · `/permissions` · `/grant-all` | Auth + rôle admin | — | **Non chargé en production** |

### 2.9 Assistant IA (`ai/ai.controller.ts`)

| Méthode | Chemin | Perm | Entrée | Sortie |
|---|---|---|---|---|
| POST | `/api/ai/chat` | — (rôle validé par `ai-rbac`) | `ChatRequestDto` (message ≤ 2000, historique borné) | Réponse complète |
| POST | `/api/ai/chat/stream` | — | idem | **SSE** `text/event-stream`, ping toutes les 20 s |
| GET | `/api/ai/health` | — | — | État Ollama + disjoncteur |
| GET | `/api/ai/metrics` | `ai.view_metrics` | — | Latences, erreurs, cache, file |
| POST | `/api/ai/cache/flush` | `ai.manage_cache` | — | Vide le cache |
| POST | `/api/ai/circuit/reset` | `ai.manage_circuit` | — | Réarme le disjoncteur |

---

## 3. Route handlers Next.js (`frontend/app/api`)

Ce sont des **relais** : ils lisent le cookie et appellent `API_URL` (NestJS). En production, IIS route la plupart des `/api/*` directement vers NestJS ; ces handlers ne sont atteints que si une règle IIS les cible (selon le `web.config` actif, voir `05` §1.3) ou en accès direct au port 3000.

| Chemin | Méthodes | Relaye vers |
|---|---|---|
| `/api/login`, `/api/logout`, `/api/me`, `/api/user/permissions` | POST/POST/GET/GET | `/auth/*` |
| `/api/admin/users/[userId]/permissions` | POST, DELETE | `/permissions/user/:id[/permId]` |
| `/api/admin/users/[userId]/permissions/reset` | POST | `/permissions/user/:id/reset` |
| `/api/admin/ldap/sync`, `/api/ldap/users` | POST, GET | `/ldap/*` |
| `/api/admin/seed-first-admin`, `/seed-permissions`, `/permissions/grant-all` | POST | `/admin/seed/*` (inexistant en prod) |
| `/api/admin/seed-pages`, `/test-permissions`, `/test-permissions-full` | GET/POST | Réponses statiques (vestiges) |
| `/api/reports/pdf`, `/excel`, `/pointages`, `/logs` | GET | `/reports/*`, `/logs` |
| `/api/rapports/heures-journalieres`, `-hebdomadaires`, `-mensuelles` | GET | `/reports/excel` |
| `/api/activity/report-export` | POST | Journalise un export (Server Action `createActivityLog`) |
| `/api/test-reports` | GET | Vestige de test |

---

## 4. WebSocket (Socket.IO 4.8.3)

| Paramètre | Valeur |
|---|---|
| Chemin | `/socket.io` (via IIS → `localhost:4000`) |
| Transports | `polling` puis `websocket` (client) ; serveur accepte les deux |
| CORS | `NEXT_ALLOWED_ORIGINS` (prod : vhost, `localhost:3000`, `127.0.0.1:3000`) |
| Authentification | Cookie `elitetime_session` du handshake (prioritaire) **ou** `auth.token` / `Authorization: Bearer` contenant un **token de session** ; session valide + utilisateur `active` ; sinon déconnexion |
| Salles | `user-<id>` ; `<role>-room` ; managers et chefs d'équipe rejoignent aussi `admin-room` ; les admins rejoignent `manager-room` et `employee-room` |
| Ping | 25 s, timeout 60 s |
| Journalisation | Chaque connexion/déconnexion crée une ligne `ActivityLog` (`WEBSOCKET: SOCKET_CONNECTED/DISCONNECTED`) — volume important |
| Révocation | Une socket ouverte **n'est pas fermée** à la déconnexion HTTP ni à l'expiration de la session |

### 4.1 Événements serveur → client

| Événement | Destinataires | Charge utile | Émis par |
|---|---|---|---|
| `employee_pointage_exit_reminder` | `user-<id>` | `{userId, message, timestamp}` | Scheduler (17:25–17:35) |
| `leave_request_created` | `admin-room` | `{absenceId, userId, userName, department}` | Création de demande |
| `leave_status_changed` | `user-<id>` | `{absenceId, status, comment?}` | Approbation/refus/annulation |
| `permissions_changed` | `user-<id>` | `{userId}` | Octroi/révocation/reset |
| `employee_late_alert` | `admin-room` | `{userId, userName, timestamp}` | Relais d'un client (méthode serveur jamais appelée) |
| `pointage_admin_closure` | `user-<id>` | `{userId, userName?, date}` | Relais d'un client manager/admin |
| `pointage_update` | `admin-room` (si émis par employé) ou **tous** | `{userId, action, timestamp}` | Relais d'un client |
| `error` | émetteur | `{message}` | Refus |

### 4.2 Événements client → serveur

| Événement | Autorisé à | Validation |
|---|---|---|
| `employee_late_alert` | `manager`, `admin` | Types des champs |
| `pointage_admin_closure` | `admin`, `manager` | Présence de `userId` et `date` |
| `pointage_update` | Tous ; un employé uniquement pour lui-même | Types + `action ∈ {entry, exit}` |

---

## 5. Traitements automatiques (`backend/src/scheduler/scheduler.service.ts`)

Tous s'exécutent **dans le processus `elitetime-backend`**, à l'heure **locale du serveur** (UTC+1).

| Tâche | Déclencheur | Effet en base | Dépendances | En cas d'échec / limites |
|---|---|---|---|---|
| Rappel de sortie | `@Cron('25 17 * * *')` puis `setInterval` 60 s pendant 10 min | Lecture `Pointage` actifs | Socket.IO | Heure **en dur** (ignore `workEndTime`) ; pas de reprise si le processus redémarre dans la fenêtre |
| Clôture automatique | `@Interval(60 s)`, déclenche **une fois par jour** dès `≥ maxSessionEndTime` | `Pointage.isActive=false`, `status=admin_closed` (**sans `exitTime` ni `duration`**) | PostgreSQL | Déduplication en mémoire (`lastAutoCloseDate`) ; un redémarrage après l'heure relance la clôture (idempotente) ; sessions ouvertes un jour précédent non traitées ici (traitées au pointage suivant) |
| E-mails planifiés | `@Interval(30 s)` : jobs `enabled` dont `hour:minute` = heure **locale** ; jour de semaine/mois calculé dans le fuseau `SystemSettings.timezone` | Lecture large (utilisateurs, pointages, pauses, absences) | Graph, Chromium, ExcelJS | Déduplication en mémoire par minute ; si le processus est arrêté à la minute prévue → **envoi perdu**, sans rattrapage ; échec journalisé, pas de nouvel essai |
| Correction des faux « incomplets » | `@Interval(1 h)` + après chaque sortie/saisie manager | `updateMany` statut `normal`/`late` | PostgreSQL | Charge tous les candidats en mémoire |
| Synchronisation LDAP | `@Interval(1 h)` si `ldapSyncEnabled` (l'intervalle configuré est ignoré) | Création d'utilisateurs, `status=deleted` pour les absents/non `ut…` ; `ldapLastSyncAt` | AD | Erreur journalisée (`[ldap-sync] échec`) ; 13/10/2026 : en échec (timeout) |

Un second processus backend (cluster PM2, deuxième serveur) **dupliquerait** les e-mails et les traitements : l'architecture suppose une instance unique **[Code]**.

---

## 6. Intégrations externes

### 6.1 Active Directory / LDAP

| Rubrique | Détail |
|---|---|
| Objectif | Authentifier les employés et alimenter la liste des utilisateurs |
| Source → cible | AD → ELITE TIME (lecture seule ; aucune écriture dans l'AD) |
| Protocole | **LDAP non chiffré** (`ldap://`, port 389) via `ldapts` 8.1.7 [Env] |
| Authentification | Bind simple du compte de service (`LDAP_BIND_DN`/`LDAP_PWD`) puis bind simple de l'utilisateur |
| Données | `sAMAccountName`, `cn`, `mail`, `givenName`, `sn`, `department`, `title`, `userAccountControl` |
| Fréquence | À chaque connexion + synchro horaire (si activée) + manuelle |
| Délais | `connectTimeout` 5 s, `timeout` 10 s ; pas de nouvel essai |
| Filtres | Synchro : `(&(objectClass=user)(!(sAMAccountName=*$)))`, puis logins commençant par `ut` ; exclusion `krbtgt`, `Administrateur`, `Invité` |
| Journaux | `elitetime-backend-error.log` (`LDAP login error`, `[ldap-sync] échec`) |
| Risques | Mots de passe en clair sur le réseau ; un seul contrôleur de domaine configuré (pas de bascule) ; synchro qui supprime (soft) des comptes en masse si l'annuaire renvoie une liste partielle ; règle « `ut…` » codée en dur |
| **État constaté** | **Injoignable le 13/10/2026** : TCP 389 et 636 en échec depuis le serveur ; 24 erreurs « Connection timeout » (connexion) + échec de la synchro de 09:05 ; erreurs similaires les 12/10 (18), 21/09, 18/09… [Env] |

### 6.2 Microsoft Graph / Entra ID

| Rubrique | Détail |
|---|---|
| Objectif | Envoyer les rapports planifiés par e-mail |
| Protocole | HTTPS, SDK `@microsoft/microsoft-graph-client` 3.0.7 |
| Authentification | **OAuth2 client credentials** (`ClientSecretCredential`, `@azure/identity`) avec `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` ; portée `https://graph.microsoft.com/.default` |
| Appel | `POST /users/{GRAPH_SENDER_EMAIL}/sendMail` (`saveToSentItems: true`) |
| Permission Azure attendue | `Mail.Send` (application) — **son étendue (toutes les boîtes du tenant ou politique d'accès restreinte) n'a pas pu être vérifiée** [À confirmer] |
| Données | Rapports PDF/Excel nominatifs en pièce jointe ; corps HTML avec tableau des présences |
| Fréquence | Selon jobs (quotidien/hebdomadaire/mensuel) |
| Erreurs | 401/403/404 journalisées ; exception propagée ; **pas de nouvel essai** |
| Risques | Expiration du secret client non surveillée ; secret lisible localement (S-04) ; option CSV proposée mais **non implémentée** |
| SMTP | Variables présentes, **aucune implémentation** |

### 6.3 Ollama (IA locale)

| Rubrique | Détail |
|---|---|
| Objectif | Assistant conversationnel avec outils de lecture (heures, congés, retards, absents, statistiques) |
| Protocole | HTTP `http://localhost:11434/api/chat` |
| Modèle | `qwen2.5:1.5b` |
| Délais / reprises | 90 s (180 s en streaming), 1 nouvel essai ; disjoncteur après 3 échecs ; file de 3 requêtes concurrentes ; 60 requêtes/heure/utilisateur ; cache des résultats d'outils (TTL par outil) |
| Sécurité | Outils filtrés par rôle (`ai-rbac.ts`), garde anti-injection, validation des arguments ; métriques **en mémoire** (perdues au redémarrage) |
| Données | Données de présence transmises au modèle local (aucune sortie Internet constatée) |

### 6.4 Chromium (Playwright)

Lancement d'un navigateur headless à **chaque** génération PDF (export manuel ou e-mail) ; consommation CPU/RAM notable sur une VM de 8 Go ; binaires dans le profil `ut08rm` **[Code][Env]**.
