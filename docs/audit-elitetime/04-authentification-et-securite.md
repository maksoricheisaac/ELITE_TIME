# 04 — Authentification, autorisations, chiffrement et audit de sécurité

> **Nature de l'audit** : revue statique du code, lecture de la configuration et vérifications non intrusives sur le serveur (13/10/2026). **Ce n'est pas un test d'intrusion** : aucune exploitation n'a été tentée, aucune requête authentifiée n'a été envoyée. Les constats « confirmés » le sont par lecture du code ou de la configuration ; leur exploitabilité réelle reste à démontrer par un test en environnement de recette.
>
> Aucune valeur secrète n'est reproduite dans ce document.

---

## 1. Authentification

### 1.1 Mécanisme

| Élément | Implémentation | Preuve |
|---|---|---|
| Type | **Sessions serveur opaques** (pas de JWT, pas d'OAuth pour les utilisateurs) | `auth.service.ts` [Code] |
| Point d'entrée | `POST /api/auth/login` (IIS réécrit `/api/login` vers cette route) | `auth.controller.ts:33`, `web.config` [Code][Env] |
| Recherche du compte | Table `HiddenUsername` (login **en clair**, normalisé en minuscules) | `auth.service.ts:148-152` [Code] |
| Compte **local** (`isLocal` + mot de passe) | `bcrypt.compare` ; **réservé aux rôles `admin` et `manager`** (403 sinon) | `auth.service.ts:168-215` [Code] |
| Compte **AD** | Bind du compte de service → recherche `(sAMAccountName=<login échappé>)` → **bind avec le DN et le mot de passe de l'utilisateur** | `auth.service.ts:222-370` [Code] |
| Provisionnement | Création automatique en `employee` à la 1ʳᵉ connexion AD réussie ; mise à jour du profil et **`status: 'active'`** aux connexions suivantes | `auth.service.ts:375-450` [Code] |
| Échappement LDAP | `\ * ( ) NUL /` échappés (conforme RFC 4515 pour le filtre) | `auth.service.ts:248-254` [Code] |
| Messages d'erreur | « Identifiants invalides » uniforme ; **exception** : un compte local non admin/manager avec bon mot de passe reçoit un 403 distinct (confirme la validité du mot de passe) | `auth.service.ts:186-195` [Code] |
| Transport | **HTTP clair** navigateur ↔ IIS ; **LDAP clair** (`ldap://`, port 389) serveur ↔ AD | Liaison IIS, `LDAP_URL` [Env] |

### 1.2 Sessions et cookie

| Attribut | Valeur réelle | Preuve |
|---|---|---|
| Nom | `elitetime_session` | `auth.guard.ts:11` |
| Valeur | `crypto.randomUUID()` (UUID v4, 122 bits aléatoires) | `auth.service.ts:80` |
| Stockage serveur | Table `Session`, **token en clair** (le helper `encryptSession` n'est jamais appelé) | `auth.service.ts:83-85` |
| `HttpOnly` | `true` | `auth.controller.ts:21-27` |
| `SameSite` | `Strict` | idem |
| `Secure` | `process.env.COOKIE_SECURE === 'true'` → **`false` en production** (`COOKIE_SECURE=false`) | `.env` [Env] |
| Durée | 24 h fixes (`maxAge` et `expiresAt`), pas de prolongation glissante, pas de délai d'inactivité | `auth.service.ts:18` |
| Portée | `path=/`, pas d'attribut `Domain` (hôte courant) | idem |
| Validation à chaque requête | `AuthGuard` : session existante, non expirée, utilisateur `active` ; rôle relu en base à chaque requête (un changement de rôle est immédiat) | `auth.guard.ts` |
| Déconnexion | Suppression de la session en base + `clearCookie` | `auth.controller.ts:68-80` |
| Invalidation globale | **Absente** : pas de « déconnecter toutes les sessions », pas de révocation au changement de mot de passe, au changement de rôle ou à la désactivation (la désactivation bloque toutefois via le contrôle `status`) | [Code] |
| Purge des sessions expirées | Uniquement à la présentation d'un token expiré | `auth.guard.ts` |

> Le fichier `frontend/src/lib/session.ts` définit d'autres options (`SameSite=lax`, `secure` en production) **qui ne sont utilisées nulle part** ; le cookie réel est posé par NestJS **[Code]**.

### 1.3 Protection contre la force brute — **inopérante**

`checkRateLimit()` compte les `ActivityLog` dont `details` **contient** la clé `"<ip>:<login>"` (`auth.service.ts:30-41`), alors que `markLoginAttempt()` écrit `details = "Failed login: <login> from <ip>"` (`auth.service.ts:43-54`). La sous-chaîne `"<ip>:<login>"` n'apparaît jamais dans ce texte : **le compteur vaut toujours 0 et la limite de 5 tentatives / 15 min n'est jamais atteinte** **[Code]**.

Aucun autre mécanisme ne compense : `@nestjs/throttler` est installé mais non configuré ; la limite de `proxy.ts` (60 req/min/IP, en mémoire) **ne s'applique pas** aux routes `/api/*` (exclues du matcher, et routées par IIS directement vers NestJS) **[Code][Env]**.

Le manuel d'exploitation (Annexe E) affirme pourtant « blocage automatique après 5 tentatives échouées » **[Doc — contredit par le code]**. La politique de verrouillage de l'AD (non vérifiée) reste la seule protection pour les comptes AD ; elle peut à l'inverse être exploitée pour **verrouiller volontairement des comptes AD** via l'application.

### 1.4 Comptes désactivés et supprimés

- Un compte `inactive`/`deleted` est rejeté par `AuthGuard` à chaque requête **[Code]**.
- **Mais** la connexion AD réactive le compte : `upsertLdapUser()` retrouve l'utilisateur via `HiddenUsername` (non modifié par le soft delete) et force `status: 'active'` (`auth.service.ts:404-415`). Un employé désactivé ou supprimé dans ELITE TIME **retrouve l'accès dès qu'il se reconnecte** tant que son compte AD est actif **[Code]**.
- La synchronisation AD ne met pas à jour le statut des utilisateurs existants (voir `06` §4) : un compte **désactivé dans l'AD** reste `active` dans l'application (il ne peut plus s'authentifier, mais ses sessions en cours restent valides jusqu'à 24 h).

### 1.5 Mots de passe (comptes locaux)

| Élément | Constat |
|---|---|
| Algorithme | **bcrypt** (`bcryptjs` 3.0.3), coût **10** (`users.service.ts:19`) — hachage à sens unique, à ne pas confondre avec le chiffrement réversible AES |
| Politique | **Aucune** (longueur, complexité) à la création ou au changement (`PATCH /api/users/me/password`) |
| Réinitialisation | Permission `employees.reset_password` sans route [Non implémenté] |
| Compte de seed | Mot de passe par défaut codé en dur dans `seed.service.ts:729` ; module **désactivé en production** (vérifié) ; à changer si un compte `admin` local a été créé par ce biais [À confirmer] |

### 1.6 CSRF, XSS, injections

| Risque | Protection constatée | Évaluation |
|---|---|---|
| CSRF | Cookie `SameSite=Strict` ; CORS limité à `NEXT_ALLOWED_ORIGINS` avec `credentials` ; Server Actions limitées aux mêmes origines (`next.config.ts`) ; `validateOrigin()` dans `proxy.ts` pour les pages | **Correct** tant que les navigateurs respectent SameSite ; pas de jeton anti-CSRF |
| XSS | Rendu React échappé ; `dangerouslySetInnerHTML` uniquement dans `components/ui/chart.tsx` (styles générés depuis la config) ; échappement HTML dans les modèles PDF/e-mail ; CSP présente mais `script-src 'unsafe-inline'`, `connect-src http: https: ws: wss:` | **Risque faible**, CSP permissive |
| Injection SQL | Prisma exclusivement, **aucune requête brute** (`$queryRaw` absent) | **Faible** |
| Injection LDAP | Filtre échappé | **Faible** |
| Injection de prompt (IA) | `prompt-injection.guard.ts`, outils filtrés par rôle, arguments validés | Couvert par tests unitaires (dont 4 échecs, voir `08`) |

---

## 2. Autorisations (RBAC)

### 2.1 Mécanisme

1. `PermissionsGuard` (`permissions.guard.ts:185-228`) : `admin` → tout ; sinon permissions **par défaut du rôle** (`ROLE_DEFAULT_PERMISSIONS`, en dur) ∪ permissions **individuelles** (`UserPermission`). Les permissions requises par `@RequirePermissions` sont combinées en **ET**.
2. Contrôles de **périmètre** ad hoc dans certains contrôleurs/services (département).
3. Le frontend masque les pages via `navigation-registry.ts` ; **ce n'est pas une barrière de sécurité**.

- 111 permissions sont déclarées dans le seed, mais **seules 42 sont réellement vérifiées** par un `@RequirePermissions` du backend ; les autres (ex. `corrections.*`, `workers.*`, `employees.reset_password`, `employees.view_sensitive`, `auth.*`) n'ont **aucun effet côté serveur** **[Code]**.
- Lorsqu'un administrateur accorde une permission, aucun contrôle ne vérifie que l'octroyant la détient ou que la permission est cohérente avec le rôle **[Code]**.

### 2.2 Matrice des permissions effectives par défaut (côté serveur)

Légende : ✅ autorisé par défaut · 🔸 autorisé par défaut **sans cloisonnement d'équipe** · ❌ refusé (sauf permission individuelle) · — sans objet.

| Fonctionnalité (route) | employee | team_lead | manager | admin |
|---|---|---|---|---|
| Pointer / pause (`/pointages/start|end`, `/breaks/*`) | ✅ | ✅ | ✅ | ✅ |
| Lire ses pointages | ✅ | ✅ | ✅ | ✅ |
| Lire les pointages / pauses d'un autre (`?userId=`) | ❌ | 🔸 tout employé | 🔸 tout employé | ✅ |
| Saisie manuelle de pointage (`/pointages/manager`) | ❌ | 🔸 tout employé | 🔸 tout employé | ✅ |
| Supprimer des sessions (`/pointages/manager/extra-sessions`) | ❌ | 🔸 | 🔸 | ✅ |
| Demander / modifier / annuler ses congés | ✅ | ✅ | ✅ | ✅ |
| Voir les congés de l'équipe (`/absences/team`) | ❌ | ✅ département | ✅ département | ✅ tous |
| Approuver / refuser / créer pour un tiers | ❌ | ✅ département | ✅ département | ✅ |
| Lister les utilisateurs (`GET /users`) | ❌ (liste vide) | 🔸 tous | 🔸 tous | ✅ |
| Créer un utilisateur | ❌ | ❌ | ✅ | ✅ |
| **Modifier un utilisateur, y compris son rôle** (`PATCH /users/:id`) | ❌ | ❌ | ✅ **(escalade possible)** | ✅ |
| Supprimer un utilisateur | ❌ | ❌ | ❌ | ✅ |
| Rapport individuel PDF/Excel | ❌ | ✅ département | ✅ tous (`reports.view_all`) | ✅ |
| **Rapport global PDF/Excel** (sans `employeeId`) | ❌ | 🔸 tous | ✅ | ✅ |
| Tableau de bord global / équipe | ❌ / ❌ | ❌ / ✅ | ❌ / ✅ | ✅ / ✅ |
| Départements / postes : lecture | ❌ | ✅ | ✅ | ✅ |
| Départements / postes : écriture | ❌ | ❌ | ❌ | ✅ |
| Paramètres : lecture / écriture | ❌ / ❌ | ❌ / ❌ | ✅ / ❌ | ✅ / ✅ |
| Journaux d'activité | ❌ | ❌ | ✅ | ✅ |
| Permissions : lecture / attribution | ❌ / ❌ | ❌ / ❌ | ✅ / ❌ | ✅ / ✅ |
| **E-mails planifiés : configuration et destinataires externes** | ❌ | ❌ | ✅ | ✅ |
| Synchro LDAP / liste AD | ❌ | ❌ | ✅ | ✅ |
| Assistant IA (`/ai/chat`) | ✅ (aucune permission vérifiée) | ✅ | ✅ | ✅ |
| Métriques IA / cache / circuit | ❌ | ❌ | ✅ / ❌ / ❌ | ✅ |

### 2.3 Routes sensibles insuffisamment protégées côté serveur

Voir constats S-01, S-05, S-06, S-07 au §5.

---

## 3. Chiffrement

### 3.1 Les différentes couches — ce qui est chiffré et ce qui ne l'est pas

| Couche | État constaté | Preuve |
|---|---|---|
| **Chiffrement applicatif des champs** | ✅ AES-256-GCM sur une **liste précise de champs** (§3.3) | `backend/src/lib/crypto.ts` [Code] |
| **TLS navigateur ↔ serveur** | ❌ HTTP uniquement (liaison IIS :80, pas de :443 en écoute ; l'en-tête HSTS envoyé sur HTTP est ignoré par les navigateurs) | `Get-NetTCPConnection`, `curl` [Env] |
| **TLS application ↔ PostgreSQL** | ❌ `ssl` désactivé, pas de `sslmode` ; la connexion passe par l'IP LAN `10.0.100.58` | `postgresql.conf`, `.env` [Env] |
| **TLS application ↔ AD** | ❌ `ldap://` ; le **mot de passe de chaque utilisateur** et celui du compte de service transitent en clair sur le réseau lors du bind | `.env` [Env] |
| **TLS application ↔ Microsoft Graph** | ✅ HTTPS (SDK Microsoft) | [Code] |
| **Chiffrement natif de la base (TDE)** | ❌ PostgreSQL n'en dispose pas nativement ; non configuré | [Env] |
| **Chiffrement du disque / volume** | Non vérifiable sans élévation (BitLocker non interrogeable) ; présence du logiciel **Prim'X ZoneCentral** (chiffrement de fichiers) détectée dans les clés de démarrage — périmètre inconnu | [À confirmer] |
| **Protection des sauvegardes** | ❌ Le seul dump trouvé est **antérieur au chiffrement applicatif** (données en clair) et lisible par `BUILTIN\Utilisateurs` | `C:\backups` [Env] |
| **Hachage des mots de passe** | ✅ bcrypt coût 10 (comptes locaux uniquement ; les mots de passe AD ne sont pas stockés) | [Code] |

> ⚠️ **La base n'est pas « entièrement chiffrée »** : les dates, durées, statuts, rôles, types d'absence, journaux d'activité, sessions, logins (`HiddenUsername`), noms de départements/postes et paramètres sont en clair.

### 3.2 Implémentation AES-256-GCM (`backend/src/lib/crypto.ts`)

| Paramètre | Valeur | Commentaire |
|---|---|---|
| Algorithme / mode | `aes-256-gcm` (Node `crypto`) | Chiffrement authentifié (AEAD) |
| Taille de clé | 256 bits (32 octets) | Chargée depuis `ENCRYPTION_KEY` (64 caractères hexadécimaux, longueur contrôlée, validité hexadécimale non contrôlée) |
| Nonce / IV | 12 octets (96 bits), `crypto.randomBytes(12)` **à chaque chiffrement** | Conforme aux recommandations GCM ; unicité probabiliste (risque de collision négligeable sous ≈ 2³² chiffrements par clé) |
| Tag d'authentification | 16 octets (128 bits), récupéré par `getAuthTag()` et **stocké** | Conforme |
| Format stocké | `base64( IV[12] ‖ TAG[16] ‖ CIPHERTEXT )` dans la même colonne texte | Pas de numéro de version ni d'identifiant de clé |
| Données associées (AAD) | **Aucune** | Un chiffré peut être déplacé d'une ligne/colonne à une autre sans être détecté (attaque par permutation pour qui a un accès en écriture à la base) |
| Normalisation | `email` et `username` mis en minuscules + `trim` avant chiffrement | — |
| Chiffrement déterministe / index aveugle | **Aucun** → recherche/filtre impossible en SQL (d'où `HiddenUsername` en clair et les filtres en mémoire) | — |

**Traitement des erreurs de déchiffrement — « fail-open »** (`crypto.ts:43-94`) :
- valeur trop courte (< 29 octets décodés) → **renvoyée telle quelle** (supposée en clair) ;
- échec de vérification du tag (`Unsupported state or unable to authenticate data`) → **renvoyée telle quelle** (le base64 brut s'affiche) ;
- `ENCRYPTION_KEY` absente → **chaîne vide** pour toute lecture, alors que l'écriture lève une exception.

Conséquences : une altération de données ou une mauvaise clé **ne déclenche aucune alerte** ; les données chiffrées et en clair peuvent coexister sans être détectées ; la garantie d'intégrité de GCM est neutralisée au niveau applicatif.

### 3.3 Champs chiffrés

| Table | Chiffrés | En clair |
|---|---|---|
| `User` | `email`, `username`, `firstname`, `lastname`, `department`, `position` | `role`, `status`, `password` (hash), drapeaux, dates, `teamLeadId` |
| `HiddenUsername` | — | **`username` (login AD)** |
| `Pointage` | `entryTime`, `exitTime`, `lateReason`, `earlyExitReason` | `date` (horodatage complet de l'entrée), `duration`, `status`, `sessionNumber`, `source` |
| `Break` | `startTime`, `endTime` | `date` (horodatage), `duration` |
| `Absence` | `reason`, `comment` | `type` (dont `maladie`), dates, statut, décideurs |
| `ScheduledEmailJobRecipient` | `email` | — |
| `ActivityLog` | — | **Tout** (noms, logins échoués, IP, actions) |
| `Session` | — | **Token**, IP, user-agent |
| `Department`, `Position`, `SystemSettings`, `Permission*` | — | Tout |

> Observation : `Pointage.date` contient l'horodatage exact de l'arrivée en clair, ce qui **révèle l'heure d'entrée** que `entryTime` est censé protéger **[Code]**.

### 3.4 Gestion des clés

| Point | Constat | Niveau |
|---|---|---|
| Génération | Documentée : `crypto.randomBytes(32).toString('hex')` (`.env.example`) | [Doc] |
| Stockage | Fichiers en clair `backend/.env` **et** `frontend/.env` (le frontend n'utilise pas la clé) ; `ENCRYPTION_KEY_PROD` identique à `ENCRYPTION_KEY` dans `backend/.env` | [Env] |
| Droits NTFS | `backend/.env` et `frontend/.env` lisibles par **`BUILTIN\Utilisateurs`** ; `frontend/.env` modifiable par `svc_nodejs` | `Get-Acl` [Env] |
| Coffre / DPAPI / HSM | Aucun | [Env] |
| Rotation | **Impossible sans script** : pas d'identifiant de version de clé ; le `.env.example` indique qu'il faut rechiffrer toute la base | [Code] |
| Sauvegarde de la clé | Aucune preuve | [À confirmer] |
| Perte de la clé | **Perte irréversible** de toutes les identités, horaires et motifs (aucune récupération possible) | — |
| Compromission de la clé | Avec un accès à la base (5432 ouvert à deux /24, dumps), toutes les données chiffrées deviennent lisibles | — |
| Migration historique | Chiffrement introduit vers mars 2026 par export/réimport (`scripts/decrypt-export.ts`, `scripts/encrypt-import.ts`, dump `elite_time_avant_chiffrement.dump`) | [Code][Env] |

---

## 4. Gestion des secrets

| Secret | Où | Observations |
|---|---|---|
| `DATABASE_URL` (mot de passe BDD) | `backend/.env`, `frontend/.env` | Dupliqué inutilement côté frontend |
| `ENCRYPTION_KEY` (+ `ENCRYPTION_KEY_PROD`) | `backend/.env`, `frontend/.env` | Idem ; même clé |
| `LDAP_BIND_DN`, `LDAP_PWD` | `backend/.env`, `frontend/.env` | Compte de service AD |
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `GRAPH_SENDER_EMAIL` | `backend/.env`, `frontend/.env` | Secret client à durée de vie limitée (expiration non surveillée) |
| `SMTP_*` | `backend/.env`, `frontend/.env` | **Non utilisés par le code** |
| `INTERNAL_SOCKET_TOKEN` | `backend/.env`, `frontend/.env` | **Non utilisé par le code** |
| Dépôt Git | Aucun `.env` réel versionné (historique vérifié) ; `.env.example` contient des exemples génériques | `git log --name-only` [Code] |
| CI | Gitleaks à chaque PR + hebdomadaire | `.github/workflows` [Code] |
| PM2 | Les secrets ne sont **pas** dans `dump.pm2` ; ils sont chargés par `dotenv` au démarrage | [Env] |

---

## 5. Constats de sécurité

Échelle de gravité : **Critique** (compromission large, exploitation simple) · **Élevée** · **Moyenne** · **Faible** · **Info**. Confiance : **Confirmé (code/config)** = démontré par lecture ; **Probable** = dépend d'un élément non vérifié ; **À vérifier**.

### S-01 — Escalade de privilèges manager → administrateur — **Critique**
- **Preuve** : `PATCH /api/users/:id` exige seulement `employees.edit` (`users.controller.ts:156-164`), accordée par défaut au rôle `manager` (`permissions.guard.ts`) ; `UsersService.update` applique `role` et `status` tels quels (`users.service.ts:164-213`), sans vérifier le rôle de l'appelant ni empêcher l'auto-modification.
- **Scénario** : un manager connecté envoie `PATCH /api/users/<son id>` avec `{"role":"admin"}` ; à la requête suivante, `AuthGuard` relit le rôle → accès total (permissions, paramètres, suppression).
- **Impact** : prise de contrôle complète de l'application, accès à toutes les données personnelles et altération des temps de présence.
- **Correctif** : réserver la modification de `role` (et `status`) à une permission dédiée réservée à l'admin ; interdire l'auto-modification ; DTO avec liste blanche des champs ; journaliser les changements de rôle.
- **Confiance** : Confirmé (code).

### S-02 — Protection anti-force brute inopérante — **Élevée**
- **Preuve** : §1.3 (`auth.service.ts:30-52`).
- **Scénario** : essais de mots de passe illimités sur `/api/login`, notamment contre les comptes locaux `admin`/`manager` (non protégés par la politique AD).
- **Impact** : compromission de comptes privilégiés ; verrouillage volontaire de comptes AD.
- **Correctif** : corriger la clé de comptage (ou utiliser un compteur dédié indexé), ajouter `@nestjs/throttler` sur `/auth/login`, limiter par login **et** par IP, imposer une politique de mot de passe locale, envisager le MFA pour les comptes locaux.
- **Confiance** : Confirmé (code).

### S-03 — Absence de chiffrement réseau (HTTP, LDAP, PostgreSQL) — **Élevée**
- **Preuve** : liaison IIS HTTP seule, `COOKIE_SECURE=false`, `LDAP_URL` en `ldap://`, PostgreSQL `ssl` désactivé, `listen_addresses='*'`, connexion applicative via l'IP LAN.
- **Scénario** : toute personne capable d'observer le trafic du LAN (poste compromis, ARP spoofing, port miroir) capture les cookies de session, les mots de passe AD saisis à la connexion (dans la requête HTTP **et** dans le bind LDAP) et le mot de passe AD du compte de service.
- **Impact** : vol de comptes AD (au-delà d'ELITE TIME), usurpation de sessions.
- **Correctif** : certificat (PKI interne) et liaison HTTPS sur IIS, redirection 80→443, `COOKIE_SECURE=true` ; `ldaps://` (636) ou StartTLS avec validation du certificat ; `ssl=on` + `hostssl` dans `pg_hba.conf` **ou** connexion par `localhost` et `listen_addresses='localhost'`.
- **Confiance** : Confirmé (configuration).

### S-04 — Secrets et sauvegardes lisibles par tous les utilisateurs locaux — **Élevée**
- **Preuve** : ACL `BUILTIN\Utilisateurs : ReadAndExecute` sur `backend/.env`, `frontend/.env` ; dump `C:\backups\elite_time_avant_chiffrement.dump` (données **en clair**) dans un dossier lisible par `BUILTIN\Utilisateurs` ; le dossier `C:\APPS\ELITE_TIME` autorise `CreateFiles/AppendData` à `BUILTIN\Utilisateurs`.
- **Scénario** : tout compte autorisé à ouvrir une session sur le serveur (RDP, tâche planifiée, compte de service compromis) lit la clé AES, le secret Azure (envoi d'e-mails au nom de l'organisation selon les droits Graph), le mot de passe AD de service et la base ; il peut aussi déposer des fichiers dans l'arborescence applicative.
- **Impact** : déchiffrement de toute la base ; usurpation d'e-mails ; altération du code exécuté.
- **Correctif** : ACL restreintes au compte d'exécution + Administrateurs ; suppression des secrets de `frontend/.env` ; suppression ou chiffrement du dump historique ; coffre de secrets (DPAPI/Credential Manager, Azure Key Vault) ; retirer `CreateFiles` aux Utilisateurs sur `C:\APPS\ELITE_TIME`.
- **Confiance** : Confirmé (environnement). Liste des comptes autorisés à se connecter au serveur : À vérifier.

### S-05 — Contournement de la désactivation/suppression par connexion AD — **Élevée**
- **Preuve** : §1.4 (`auth.service.ts:404-415` force `status: 'active'`).
- **Scénario** : un salarié dont l'accès a été retiré dans ELITE TIME (statut `inactive` ou `deleted`) mais dont le compte AD est actif se reconnecte normalement.
- **Impact** : les décisions d'administration (désactivation) sont ineffectives.
- **Correctif** : ne jamais réactiver un compte à la connexion ; refuser la connexion si `status !== 'active'`.
- **Confiance** : Confirmé (code).

### S-06 — Exfiltration des données de présence par e-mail externe — **Élevée**
- **Preuve** : `POST /api/email-scheduling` (`emails.configure`, accordée par défaut aux managers) accepte `recipientEmails` arbitraires (`email-scheduling.service.ts`), sans validation de domaine ; les rapports joints couvrent **tous** les employés inclus dans les rapports.
- **Scénario** : un manager ajoute une adresse personnelle externe au rapport quotidien.
- **Impact** : fuite régulière et silencieuse de données personnelles (RGPD/loi applicable).
- **Correctif** : limiter aux domaines de l'organisation, réserver la configuration aux administrateurs, journaliser et notifier chaque changement de destinataires.
- **Confiance** : Confirmé (code).

### S-07 — Cloisonnement équipe/département insuffisant (IDOR horizontal) — **Moyenne à Élevée**
- **Preuve** : `pointages.controller.ts:30-43` et `breaks.controller.ts:24-37` (rôle seul) ; `managerUpsert`, `getManagerByDate`, `deleteExtraSessions` sans contrôle de périmètre ; `reports.service.ts:48` (rapport global non filtré) ; `GET /users` complet pour `team_lead` ; comparaison `null === null` des départements.
- **Scénario** : un chef d'équipe consulte ou modifie les pointages d'un employé d'un autre service en changeant `userId`, ou exporte le rapport global de l'entreprise.
- **Impact** : atteinte à la confidentialité et à l'intégrité des temps de présence (fraude, litiges).
- **Correctif** : service central d'autorisation « peut agir sur l'utilisateur X » (équipe via `teamLeadId` et/ou département non nul), appliqué à toutes les routes acceptant un `userId`/`employeeId`, et filtrage du rapport global.
- **Confiance** : Confirmé (code).

### S-08 — Exposition directe de Next.js et de PostgreSQL sur le LAN — **Moyenne**
- **Preuve** : Next.js écoute `::`:3000 (`HOSTNAME=0.0.0.0`) avec règle pare-feu « Allow Node.js port 3000 » (profil Any) ; `curl http://10.0.100.58:3000/login` → 200 ; PostgreSQL ouvert à `10.0.100.0/24` et `10.0.210.0/24`.
- **Impact** : contournement d'IIS (journaux IIS, futures protections TLS/WAF) ; surface d'attaque réseau sur la base (force brute SCRAM, vulnérabilités PG).
- **Correctif** : lier Next.js à `127.0.0.1`, supprimer les règles 3000/4000 ; restreindre `pg_hba.conf` aux postes d'administration nécessaires.
- **Confiance** : Confirmé (environnement).

### S-09 — Déchiffrement « fail-open » et absence d'AAD — **Moyenne**
- Voir §3.2. **Correctif** : lever une erreur (et alerter) sur échec d'authentification ; ajouter un préfixe de version (`v1:`) et un identifiant de clé ; utiliser l'identifiant de ligne + nom de colonne comme AAD lors d'une future rotation.
- **Confiance** : Confirmé (code).

### S-10 — Validation des entrées partielle — **Moyenne**
- **Preuve** : DTO `class-validator` uniquement pour absences et IA ; `PATCH /settings` transmet le corps brut à Prisma ; `POST /pointages/manager` accepte des heures non validées ; `POST /users` accepte `role`, `status`, `isLocal`, `password` sans contrainte.
- **Impact** : données incohérentes (heures invalides → `NaN`), erreurs 500, contournements logiques.
- **Correctif** : DTO pour chaque route ; `forbidNonWhitelisted: true`.
- **Confiance** : Confirmé (code).

### S-11 — Dépendances vulnérables — **Moyenne** (Élevée pour `next`)
- **Preuve** : `npm audit --omit=dev` (13/10/2026) : backend 21 vulnérabilités (1 critique `proxy-addr` via Express, 13 élevées dont `socket.io-parser`, `ws`, `engine.io`, `multer`) ; frontend 9 (1 **critique sur `next` 16.2.7** : contournement du middleware/proxy et DoS Server Actions). Détail dans `08`.
- **Correctif** : mises à jour mineures (`npm update`/`npm audit fix` en recette), retrait de `@hono/node-server` inutilisé, suivi hebdomadaire **bloquant** pour les critiques.
- **Confiance** : Confirmé (outil) ; exploitabilité dans ce contexte : À vérifier.

### S-12 — Sessions : token en clair, pas de révocation globale — **Moyenne**
- **Preuve** : §1.2.
- **Impact** : une fuite de la table `Session` (dump, accès BDD) permet l'usurpation immédiate de toutes les sessions actives.
- **Correctif** : stocker un hash SHA-256 du token ; révoquer les sessions au changement de mot de passe/rôle/statut ; délai d'inactivité ; purge planifiée.
- **Confiance** : Confirmé (code).

### S-13 — Journaux contenant des données personnelles, sans rétention — **Faible à Moyenne**
- **Preuve** : `ActivityLog` en clair (noms, logins échoués, IP) ; journaux PM2 avec adresses e-mail (`lib/email.ts:38-40`) ; aucune rotation (voir `07`).
- **Correctif** : minimisation, rétention définie, rotation, accès restreint.

### S-14 — En-têtes et durcissement HTTP — **Faible**
- `X-Powered-By: Next.js` et `ARR/3.0` exposés ; HSTS sur HTTP sans effet ; CSP permissive (`unsafe-inline`, `connect-src http: ws:`) ; `X-XSS-Protection` obsolète ; aucun en-tête de sécurité posé par NestJS (pas de `helmet`) sur les réponses API.

### S-15 — WebSocket : messages clients relayés sans vérification — **Faible**
- **Preuve** : `pointage_update` émis par un manager/chef d'équipe est diffusé à **tous** les clients (`server.emit`) avec une charge utile libre ; `employee_late_alert` et `pointage_admin_closure` relayés sans contrôle en base (`websocket.gateway.ts`).
- **Impact** : fausses notifications / ingénierie sociale interne.
- **Correctif** : n'émettre ces événements que depuis le serveur après une action métier.

### S-16 — Assistant IA accessible sans permission `ai.chat` — **Faible**
- **Preuve** : `ai.controller.ts:38-60` sans `@RequirePermissions` ; le rôle `employee` n'a pas `ai.chat`. Le filtrage des outils par rôle (`ai-rbac.ts`) limite l'impact.

### S-17 — Pages de test déployées — **Info**
- `/test-permissions`, `/test-reports`, `app/api/test-reports`, `app/api/admin/test-permissions*` présents en production (sans données sensibles constatées).

### Points vérifiés et jugés corrects
- Endpoints de seed désactivés en production (`NODE_ENV=production`) — le constat F-01 de `SECURITY_AUDIT.md` (mai 2026) est corrigé.
- Port 4000 NestJS lié à `127.0.0.1` (non joignable depuis le LAN, vérifié).
- Aucune requête SQL brute ; filtre LDAP échappé ; échappement HTML des rapports ; cookie `HttpOnly` + `SameSite=Strict` ; contrôle `status` à chaque requête ; aucun secret réel dans l'historique Git.
