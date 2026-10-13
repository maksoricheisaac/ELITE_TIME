# 08 — Tests, qualité du code et dépendances

---

## 1. Tests existants

### 1.1 Inventaire

| Zone | Fichiers | Nature |
|---|---|---|
| Backend — module IA | 9 fichiers `src/ai/__tests__/*.spec.ts` (≈ 142 cas) | Unitaires (mocks) : RBAC IA, anti-injection, validation d'arguments, file, disjoncteur, cache, orchestrateur, métriques |
| Backend — divers | `src/app.controller.spec.ts`, `src/prisma/prisma.service.spec.ts` | Squelettes générés par Nest (« should be defined ») |
| Backend — e2e | `test/app.e2e-spec.ts` | Squelette (`GET /` → « Hello World! ») ; **non exécuté** pendant l'audit car il démarre toute l'application sur la base configurée (production) |
| Frontend | **Aucun test** | — |
| Tests de charge, de sécurité, d'intégration LDAP/Graph | **Aucun** | — |

### 1.2 Exécution réalisée pendant l'audit

Commande : `npx jest --ci --coverage --coverageDirectory <scratchpad>` dans `backend/` (13/10/2026, couverture écrite hors dépôt ; dépôt vérifié inchangé ensuite).

| Résultat | Valeur |
|---|---|
| Suites | 11 (9 réussies, **2 en échec**) |
| Cas | 146 (142 réussis, **4 en échec**) |
| Durée | ≈ 34 s |
| Couverture instructions / branches / fonctions / lignes | **15,9 % / 10,9 % / 13,7 % / 16,3 %** (backend entier) |

Échecs :
1. `tool-orchestrator.spec.ts` › filtrage tools par rôle › envoie `get_department_statistics` à Ollama pour un admin (liste d'outils vide reçue).
2. `tool-orchestrator.spec.ts` › limite d'itérations › stoppe après 3 itérations (1 appel au lieu de 4).
3. `tool-orchestrator.spec.ts` › tool call valide › exécute `get_my_hours` pour un employee.
4. `tool-args-validator.spec.ts` › `validateGetLeaveRequestsArgs` › rejette un statut inconnu.

Ces échecs indiquent que les tests de l'orchestrateur IA et du validateur n'ont pas suivi des évolutions récentes du code (ou une régression) **[Env]**. La CI (`ci.yml`) **n'exécute pas les tests** : elle ne fait que compiler **[Code]**.

### 1.3 Lacunes de couverture prioritaires

| Domaine non testé | Risque |
|---|---|
| `PermissionsGuard`, `AuthGuard`, contrôles de périmètre (pointages, rapports, absences) | Régressions de sécurité silencieuses (cf. S-01, S-07) |
| `AuthService.login` (rate limit, LDAP, comptes locaux) | Bug S-02 non détecté |
| `lib/crypto.ts` (aller-retour, tag altéré, clé absente) | Comportement « fail-open » non spécifié |
| Calculs de durée / retard / départ anticipé / heures sup (`pointages.service.ts`, `report-calculator.ts`) | Erreurs de paie/RH |
| Machine à états des congés | Transitions illégales |
| Scheduler (clôture, e-mails, fuseau) | Envois manqués ou en double |
| Frontend (gardes de navigation, formulaires) | — |

---

## 2. Qualité du code

### 2.1 Organisation et conventions

- Organisation **claire et conventionnelle** : un module NestJS par domaine ; frontend séparé par rôle (`features/admin|manager|employee`), actions serveur par rôle ; nommage cohérent, commentaires abondants en français **[Code]**.
- TypeScript : backend `strictNullChecks` + `noImplicitAny` (pas `strict` complet) ; frontend `strict: true` ; seulement 4 `any` explicites côté backend, 0 côté frontend ; 7 désactivations ESLint au total **[Code]**.
- ESLint + Prettier configurés ; le script `npm run lint` du backend applique `--fix` (modifie les fichiers) **[Code]**.

### 2.2 Points faibles

| Constat | Exemple / preuve | Impact |
|---|---|---|
| **Logique d'autorisation dupliquée** | 8 appels `userPermission.findMany` répartis dans `PermissionsGuard`, `auth.service`, `users.controller`, `pointages.controller`, `breaks.controller`, `absences.controller`, `reports.service` ; règles OR différentes à chaque endroit | Incohérences d'accès (cause directe de S-07) |
| Validation des entrées quasi absente hors absences/IA | Types inline dans les `@Body()` | S-10 |
| Accès Prisma directement depuis les contrôleurs | `users.controller.ts`, `pointages.controller.ts`… | Couplage |
| Composants frontend très volumineux | `features/admin/settings.tsx` (1 909 lignes), `features/manager/pointages.tsx` (1 620), `features/employee/dashboard.tsx` (1 288) | Maintenance difficile |
| Code mort / vestiges | Modèles `Page`, `PagePermission`, `CorrectionRequest` ; helpers `encryptSession`, `encryptActivityLog`… ; routes Next.js de test ; `frontend/src/data/mockData.ts` ; `backend/ecosystem.config.cjs` ; `@hono/node-server`, `@nestjs/throttler` non utilisés ; variables `SMTP_*`, `INTERNAL_SOCKET_TOKEN` | Confusion, surface d'attaque |
| Requêtes inopérantes sur champs chiffrés | `ldap-sync.service.ts:146-149, 294-296`, `departments.service.ts:40-47` | Bugs silencieux |
| Scripts de correction de données manuels | `backend/scripts/` : `supprimer-pointages-jour.js`, `reactiver-sessions-actives.js`, `corriger-statuts-incomplets.js`, 4 scripts `_debug_*.js` | Indicateurs de bugs récurrents sur les pointages ; opérations destructives hors traçabilité applicative |
| `console.log` en production | 18 côté backend (dont adresses e-mail), 5 côté frontend | Journaux non structurés, PII |
| Deux conventions de date pour `Pointage.date` | Horodatage (employé) vs minuit local (manager) | Requêtes et rapports fragiles |
| Gestion d'erreurs côté frontend | `serverFetch` renvoie `null` sur toute erreur GET | Erreurs masquées à l'utilisateur |
| Historique Git | 15 commits, gros commits (« feat »), un seul contributeur | Traçabilité faible des changements |
| Migrations | 29/33 sont des stubs vides (voir `03` §8) | Reconstruction impossible |

### 2.3 Documentation existante

| Document | Constat |
|---|---|
| `MANUEL_EXPLOITATION_ELITETIME.md` (166 Ko) | Manuel **utilisateur** détaillé ; l'annexe technique contient des **affirmations inexactes** : « HTTPS obligatoire en production », « blocage après 5 tentatives », « synchronisation LDAP configurable », « rappel configurable » — contredites par le code et l'environnement |
| `SECURITY_AUDIT.md` (mai 2026) | Audit antérieur ; certains constats corrigés (seed en production), d'autres toujours présents (LDAP clair, `.env` en clair, verrouillage) |
| `.env.example` | Complet et commenté |
| README | **Absent** (aucun guide d'installation développeur) |

### 2.4 Difficultés de reprise par un autre développeur

1. Pas de README ni de procédure d'installation locale.
2. Impossibilité de recréer la base depuis les migrations.
3. Comportements implicites (chiffrement + `HiddenUsername`, filtrage en mémoire, deux conventions de date).
4. Environnement de production = poste de développement = profil personnel.
5. Tests quasi inexistants hors IA.

---

## 3. Dépendances

### 3.1 Vulnérabilités connues (`npm audit --omit=dev`, 13/10/2026)

| Projet | Critique | Élevée | Moyenne | Faible | Total |
|---|---|---|---|---|---|
| Backend | 1 | 13 | 6 | 1 | 21 |
| Frontend | 1 | 7 | 1 | 0 | 9 |

Principales entrées :

| Paquet | Gravité | Direct ? | Sujet (avis npm) |
|---|---|---|---|
| `next` 16.2.7 | **Critique** | Direct (frontend) | Contournement du middleware/proxy (App Router), DoS via Server Actions |
| `proxy-addr` | **Critique** | Indirect (express) | Usurpation d'IP via IPv6 mappée (pertinent car `trust proxy` est activé) |
| `socket.io-parser`, `engine.io`, `ws` | Élevée | Indirect | Déni de service (épuisement mémoire) |
| `multer` | Élevée | Indirect (platform-express) | DoS |
| `@nestjs/platform-express`, `prisma`, `@prisma/config` | Élevée | Direct / indirect | Hérités de dépendances |
| `hono`, `@hono/node-server` | Élevée / Moyenne | Direct (inutilisé) | Contournements, traversée de chemin sous Windows |
| `exceljs` | Moyenne | Direct | (hérité : `uuid`) |
| `postcss`, `sharp`, `nanoid`, `source-map-js` | Élevée | Indirect (frontend, build/images) | Principalement outillage de build |

L'exploitabilité de chaque avis dans le contexte d'ELITE TIME n'a pas été évaluée individuellement **[À vérifier]**. La CI hebdomadaire produit ces rapports mais **ne bloque rien** (`|| true`).

### 3.2 Versions et cohérence

- Versions déclarées en `^` (mises à jour mineures automatiques à chaque `npm install`), mais figées par `package-lock.json` ; le pipeline utilise `npm ci` (reproductible) **[Code]**.
- Node : CI 20, Docker 22, production 24 **[Code][Env]**.
- `react` 19.2.7 vs `react-dom` 19.2.0 (épinglé) : désalignement mineur **[Env]**.
- `prisma` CLI en devDependency alors que le Dockerfile et les procédures l'utilisent au runtime **[Code]**.

---

## 4. Améliorations proposées (qualité)

| Priorité | Action | Coût estimé | Impact |
|---|---|---|---|
| P1 | Faire exécuter `jest` par la CI et corriger les 4 tests en échec | 0,5 j | Moyen |
| P1 | Tests unitaires des gardes, du login, de `crypto.ts`, des calculs de durée | 3–5 j | Élevé |
| P1 | Service d'autorisation unique (`canAccessUser(requester, targetId, action)`) remplaçant les 8 implémentations | 2–3 j | Élevé |
| P1 | DTO `class-validator` pour toutes les routes + `forbidNonWhitelisted` | 2–3 j | Élevé |
| P2 | Migration « baseline » réelle (schéma complet) pour remplacer les stubs | 0,5–1 j | Élevé (PRA) |
| P2 | README développeur + procédure de déploiement | 1 j | Moyen |
| P2 | Nettoyage du code mort, des dépendances et variables inutilisées | 1 j | Moyen |
| P3 | Découpage des composants > 700 lignes | 3–5 j | Moyen |
| P3 | Journalisation structurée (pino) sans PII | 1–2 j | Moyen |
