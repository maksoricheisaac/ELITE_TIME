# Audit et documentation technique d'ELITE TIME

**Date** : 13/10/2026 · **Commit audité** : `e3878d4` (branche `main`) · **Serveur** : `SVR-APP-PRD-01` (10.0.100.58)
**Nature** : audit statique du code + vérifications non intrusives de l'environnement (session non élevée). Ce n'est pas un test d'intrusion. Aucun fichier applicatif, service ou donnée n'a été modifié.

## Index

| Fichier | Contenu | Public principal |
|---|---|---|
| [01-presentation-fonctionnelle.md](01-presentation-fonctionnelle.md) | Finalité, utilisateurs, rôles, fonctionnalités, workflows, limites | Direction, métier, développeurs |
| [02-architecture-technique.md](02-architecture-technique.md) | Stack et versions, frontend, backend, diagrammes, flux | Développeurs, architectes |
| [03-base-de-donnees.md](03-base-de-donnees.md) | PostgreSQL, modèles, ERD, dictionnaire, index, migrations | Développeurs, DBA |
| [04-authentification-et-securite.md](04-authentification-et-securite.md) | Sessions, RBAC, matrice, chiffrement AES-GCM, secrets, constats S-01…S-17 | RSSI, auditeurs, développeurs |
| [05-infrastructure-et-deploiement.md](05-infrastructure-et-deploiement.md) | Serveur, ports, IIS, PM2, démarrage, déploiement | Administrateurs système |
| [06-api-et-integrations.md](06-api-et-integrations.md) | Inventaire des routes, WebSocket, tâches planifiées, LDAP, Graph, Ollama | Développeurs, intégrateurs |
| [07-exploitation-et-maintenance.md](07-exploitation-et-maintenance.md) | Démarrage/arrêt, journaux, supervision, diagnostic, sauvegarde/restauration | Exploitation |
| [08-tests-et-qualite.md](08-tests-et-qualite.md) | Tests, couverture, qualité, dépendances vulnérables | Développeurs |
| [09-risques-et-recommandations.md](09-risques-et-recommandations.md) | Registre des risques R-01…R-30, plan priorisé, top 10 | Direction, RSSI, DSI |
| [10-inventaire-des-preuves.md](10-inventaire-des-preuves.md) | Fichiers lus, commandes exécutées, éléments à confirmer, limites | Auditeurs |

**Guide de lecture** — Direction/DSI : ce README puis `09`. Administrateur système : `05`, `07`, puis `04` §3–5. Développeur reprenant le projet : `02`, `03`, `06`, `08`, puis `04`. Auditeur sécurité : `04`, `09`, `10`.

**Niveaux de preuve utilisés** : **[Code]** vérifié dans le code · **[Env]** vérifié dans l'environnement · **[Doc]** documenté, non vérifié · **[À confirmer]** · **[Non implémenté]** · **[Partiel]**.

---

## ⚠️ Alertes immédiates (constatées le 13/10/2026)

1. **Annuaire AD injoignable** depuis le serveur (TCP 389 et 636 en échec ; 24 erreurs « LDAP Connection timeout » aujourd'hui, 18 la veille) : les employés ne peuvent pas se connecter ; seuls les comptes locaux admin/manager fonctionnent.
2. **Aucune sauvegarde exploitable de la base** trouvée ; le seul dump (mars 2026) précède le chiffrement et est lisible par tous les utilisateurs locaux.
3. **Escalade de privilèges** : un manager peut se donner le rôle `admin` via l'API.
4. **L'application ne redémarre pas seule** après un reboot : elle dépend de l'ouverture de session du compte personnel `ut08rm`.

---

## Synthèse exécutive

### 1. Qu'est-ce qu'ELITE TIME ?
Une application web interne de gestion des temps de présence : pointage d'arrivée/départ (sessions multiples), pauses, retards, demandes et validation de congés, tableaux de bord, rapports PDF/Excel et envois automatiques par e-mail, synchronisation avec l'Active Directory et assistant IA local. Elle sert les employés, chefs d'équipe, managers et administrateurs d'Elite Network (`01`).

### 2. Comment fonctionne-t-elle, de la connexion à l'enregistrement en base ?
Le navigateur appelle `http://elitetime.elitenetwork.local` (IIS, port 80). IIS envoie `/api/*` et `/socket.io/*` au backend NestJS (`localhost:4000`) et le reste au frontend Next.js (`localhost:3000`). À la connexion, NestJS vérifie le login dans la table `HiddenUsername`, authentifie l'utilisateur contre l'AD (ou par bcrypt pour un compte local), crée une ligne `Session` (UUID) et pose le cookie `elitetime_session` (HttpOnly, SameSite=Strict, non Secure). À chaque requête, `AuthGuard` relit la session et l'utilisateur, `PermissionsGuard` vérifie les permissions du rôle et les permissions individuelles, le service applique les règles métier, chiffre les champs sensibles en AES-256-GCM et écrit dans PostgreSQL via Prisma ; la réponse est déchiffrée avant envoi et des notifications Socket.IO sont émises (`02` §5).

### 3. Quelle est sa stack technique exacte ?
TypeScript sur Node.js 24.13.0. Frontend **Next.js 16.2.7 / React 19.2**, Tailwind 4, Radix/shadcn, react-hook-form + zod, Socket.IO client 4.8.3. Backend **NestJS 11.1.19 / Express 5.2.1**, Prisma 7.8.0 (adaptateur `pg` 8.20), Socket.IO 4.8.3, `@nestjs/schedule` 5.0.1, ldapts 8.1.7, bcryptjs 3.0.3, ExcelJS 4.4.0, Playwright 1.59.1 (PDF), SDK Microsoft Graph 3.0.7 / @azure/identity 4.13.1. **PostgreSQL 18.1**, **IIS 10 + URL Rewrite + ARR 3.0**, **PM2 6.0.14**, **Ollama** (`qwen2.5:1.5b`), Windows Server 2022 sur VMware (`02` §2).

### 4. Frontend et backend sont-ils séparés ?
**Oui** : deux applications et deux processus distincts (ports 3000 et 4000), dans un **même dépôt** Git. Le frontend ne touche jamais la base ; il passe toujours par l'API NestJS (directement depuis le navigateur ou via ses Server Components/Server Actions).

### 5. Quelle base de données ?
**PostgreSQL 18.1** (base `elite_time`, 18 tables dont 17 modèles Prisma), installée **sur le même serveur**, accessible sans TLS et ouverte à deux sous-réseaux du LAN. Le schéma est à jour, mais **29 des 33 migrations sont vides** : la base ne peut pas être reconstruite depuis le dépôt (`03`).

### 6. Quelles données sont chiffrées, avec quel algorithme, où sont les clés ?
**AES-256-GCM** applicatif (IV aléatoire 96 bits par valeur, tag 128 bits, format `base64(IV‖TAG‖chiffré)`, sans AAD ni version de clé). Champs chiffrés : identité et e-mail, département et poste des utilisateurs ; heures et motifs des pointages ; heures des pauses ; motifs et commentaires des absences ; e-mails des destinataires externes. **Restent en clair** : logins (`HiddenUsername`), horodatages complets des pointages, durées, statuts, types d'absence (dont « maladie »), journaux d'activité, sessions. La clé unique est dans `backend/.env` (et inutilement dans `frontend/.env`), **lisible par tous les utilisateurs locaux**, sans coffre, sans rotation, sans sauvegarde prouvée. Les mots de passe locaux sont **hachés en bcrypt** (coût 10). Il n'y a **ni HTTPS, ni LDAPS, ni TLS PostgreSQL** ; le chiffrement du disque n'a pas pu être vérifié (`04` §3).

### 7. Comment les utilisateurs sont-ils authentifiés et autorisés ?
Authentification **AD par bind LDAP** (comptes `ut…`, créés automatiquement en `employee`) ou **compte local bcrypt** réservé aux rôles admin/manager ; session serveur de 24 h par cookie. Autorisation **RBAC** à 4 rôles (`employee`, `team_lead`, `manager`, `admin`) avec permissions par défaut codées en dur + permissions individuelles en base ; 42 permissions sur 111 sont réellement vérifiées côté serveur. Défauts majeurs : escalade manager→admin, anti-force brute inopérant, cloisonnement d'équipe incomplet, réactivation de comptes désactivés (`04`).

### 8. Sur quel serveur et quel système ?
VM VMware **`SVR-APP-PRD-01`** (10.0.100.58, domaine `elitenetwork.local`), **Windows Server 2022 Standard**, 4 vCPU, 8 Go RAM, un disque de 99 Go, fuseau `W. Central Africa Standard Time` (UTC+1). Tout est sur cette machine : IIS, Node, PostgreSQL, Ollama (`05` §1).

### 9. Comment les processus sont-ils démarrés et supervisés ?
**PM2 6.0.14** (`PM2_HOME=C:\pm2-data`) supervise `elitetime-frontend` (`next start -p 3000`) et `elitetime-backend` (`node dist/src/main.js`), avec redémarrage automatique et limite de 1 Go. Le démon PM2 est lancé par la clé **`HKCU\…\Run`** du compte `ut08rm` (pm2-windows-startup) ; le service Windows NSSM prévu est arrêté et mal configuré. Aucune sonde de santé, aucune alerte, aucune rotation des journaux (`05` §2, `07`).

### 10. Comment les mises à jour sont-elles déployées ?
**Manuellement sur le serveur** : `git pull`, `npm ci`, `npm run build` (backend et frontend), migrations éventuelles, `pm2 restart`. Le workflow GitHub `cd.yml` est manuel, non configuré (pas de SSH) et ne fonctionnerait pas en l'état ; la CI compile mais n'exécute pas les tests. Pas de recette, pas de retour arrière (`05` §4).

### 11. Comment les sauvegardes et restaurations sont-elles gérées ?
**Elles ne le sont pas, d'après les preuves accessibles** : aucune tâche, aucun script, aucun agent de sauvegarde ; un seul dump de mars 2026 (non chiffré, antérieur au chiffrement). Sauvegarde de la VM et de la clé : à confirmer. Aucune procédure ni test de restauration ; RPO/RTO non définis (`07` §5).

### 12. Quels systèmes externes sont intégrés ?
**Active Directory** (LDAP 389, en clair — injoignable le 13/10), **Microsoft Graph / Entra ID** (envoi des e-mails, OAuth2 client credentials), **Ollama** local (IA). SMTP est configuré mais non implémenté (`06` §6).

### 13. Principaux risques de sécurité
Escalade de privilèges (critique) ; absence de chiffrement réseau (mots de passe AD en clair sur le LAN) ; secrets et dump lisibles par tous les utilisateurs du serveur ; anti-force brute inopérant ; réactivation de comptes désactivés ; exfiltration possible de rapports vers des adresses externes ; cloisonnement d'équipe insuffisant ; ports 3000/5432 exposés ; dépendances avec vulnérabilités critiques (`04` §5, `09` §1.1).

### 14. Risques de disponibilité et de performance
Pas de sauvegarde ; démarrage dépendant d'une session personnelle ; AD unique et actuellement injoignable ; serveur unique tout-en-un (8 Go) ; aucune supervision ; journaux sans rotation ; e-mails perdus si le backend est arrêté à l'heure prévue ; fuseaux horaires incohérents ; filtrages en mémoire et `ActivityLog` non indexé qui se dégraderont avec le volume (`09` §1.2–1.3).

### 15. Informations restant à confirmer
Configuration IIS courante et journaux IIS ; identité d'exécution des processus et du pool IIS ; chiffrement du disque ; sauvegarde de la VM et de la clé ; droits du compte PostgreSQL ; permission Graph et expiration du secret ; politique de verrouillage AD ; comptes autorisés en RDP ; rôles effectivement attribués ; exécution des workflows GitHub ; mécanisme de lancement d'Ollama. Détail et méthode dans `10` §4.

### 16. Les dix améliorations prioritaires
1. Sauvegardes quotidiennes externalisées + sauvegarde séparée de la clé + test de restauration.
2. Corriger l'escalade de privilèges et auditer les rôles.
3. Rétablir et redonder l'accès AD, passer en LDAPS.
4. Démarrage par service Windows sous un compte de service, hors profil personnel.
5. Protéger les secrets (ACL, suppression du dump en clair, retrait côté frontend, coffre).
6. HTTPS, cookie Secure, PostgreSQL local/TLS, fermeture des ports 3000 et 5432 au LAN.
7. Réparer l'anti-force brute + throttling.
8. Contrôle d'accès centralisé avec cloisonnement réel ; restriction des destinataires e-mail.
9. Supervision minimale (santé, sonde, alertes, rotation des journaux).
10. Mise à jour des dépendances critiques, puis recette + CD avec retour arrière.

---

## Appréciation de la maturité

Échelle qualitative : **Insuffisant** · **Fragile** · **Acceptable** · **Solide**. Chaque appréciation repose sur les critères indiqués ; aucune note chiffrée n'est attribuée.

| Axe | Appréciation | Critères et preuves |
|---|---|---|
| **Maturité technique** | **Acceptable** | ✔ Stack moderne et à jour (Next 16, Nest 11, Prisma 7, PG 18) ; architecture modulaire claire ; chiffrement applicatif AEAD correctement implémenté côté chiffrement ; TypeScript strict. ✘ Migrations inutilisables, validation des entrées quasi absente, logique d'autorisation dupliquée, calculs métier incohérents, fuseaux mélangés. |
| **Sécurité** | **Insuffisant** | ✘ Une faille critique (escalade) et cinq élevées confirmées ; aucun chiffrement réseau ; secrets lisibles localement ; anti-force brute inopérant ; dépendances critiques. ✔ Sessions HttpOnly/SameSite=Strict, pas de SQL brut, LDAP échappé, seed désactivé en prod, Gitleaks en CI. |
| **Maintenabilité** | **Fragile** | ✔ Code lisible et commenté, conventions cohérentes. ✘ Couverture de tests ≈ 16 % (IA uniquement, 4 échecs), aucun README, composants de 1 000–1 900 lignes, code mort, base non reconstructible, un seul contributeur, documentation existante partiellement inexacte. |
| **Disponibilité** | **Insuffisant** | ✘ Pas de sauvegarde, point unique de défaillance (VM, disque, AD unique), démarrage lié à une session utilisateur, incident AD en cours. ✔ PM2 redémarre les processus en cas de crash ; PostgreSQL et IIS en services automatiques. |
| **Exploitabilité** | **Fragile** | ✘ Aucune supervision ni alerte, pas de route de santé, journaux sans rotation, déploiement manuel sans retour arrière, production servant de poste de développement. ✔ Journaux PM2 lisibles, scripts de diagnostic de données, manuel utilisateur détaillé. |
