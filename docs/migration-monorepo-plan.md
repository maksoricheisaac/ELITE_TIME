# ELITE TIME — Audit d'entrée et plan de migration monorepo (Étapes 1 et 2)

Statut : **proposition, aucune modification de code effectuée.** Branche de travail : `riche`.

## 1. Constats de l'audit

### Dépôt actuel
- Deux projets npm indépendants, sans workspace : `backend/` (NestJS 11, Prisma 7.8 + adapter-pg, Socket.IO, ldapts, Graph, exceljs, playwright) et `frontend/` (Next 16, React 19). Un 3e mini-projet `scripts/` (chiffrement/import de dumps).
- 3 `package-lock.json` ; aucun `pnpm`. Outils locaux : Node 24.15, pnpm 12.14, Docker 29.8 (les Dockerfiles actuels ciblent Node 22 : à trancher).
- Prisma : `backend/prisma/schema.prisma`, 34 migrations, client généré dans `backend/src/generated/prisma` (commité/généré dans `src`), `prisma.config.ts` dans backend.
- Dockerfiles et `docker-compose.yml` existent déjà (backend + frontend seulement, pas de Postgres, ports 3000/4000 publiés, backend lié à `127.0.0.1` dans `main.ts` → **inaccessible depuis un autre conteneur**, healthcheck `localhost`). Frontend : `distDir: .next-build`, pas de `standalone`. Ils ne sont pas utilisés en prod (prod = IIS + PM2 + Windows).

### Tâches planifiées (toutes dans le processus API, `@nestjs/schedule`)
`backend/src/scheduler/scheduler.service.ts` : rappel de sortie (cron + setInterval), `checkAutoClose` (60 s), `pollScheduledEmails` (30 s), `resolveIncompleteStatuses` (1 h), `runLdapSync` (1 h). Aucune exclusivité → doublons dès 2 instances. Cibles naturelles du worker.

### Points de friction architecturaux
1. **Collision de préfixe `/api`** : Next possède ~20+ route handlers sous `frontend/app/api/*` (login, logout, me, rapports, reports/pdf|excel, admin/…) et NestJS expose aussi `/api`. Un domaine unique impose un routage par chemin (Traefik) ou des rewrites Next ; à décider avant d'écrire le compose.
2. Le frontend n'accède pas à Postgres (aucun import prisma/pg) : l'exigence « web sans DB » est déjà respectée. `ENCRYPTION_KEY` est injectée dans le conteneur frontend sans y être utilisée → à retirer.
3. Sessions : cookie `elitetime_session`, token en base, TTL 24 h, token en clair en base (audit S-12). Pas de migration vers Redis ; au mieux un cache de lecture avec TTL court + invalidation au logout.
4. `@nestjs/throttler` est installé mais **jamais utilisé** (aucune occurrence dans `src`). `ValidationPipe` global existe déjà (`whitelist`, `transform`) mais pas `forbidNonWhitelisted`, et la majorité des routes n'ont pas de DTO (audit S-10).
5. Variables d'environnement lues directement via `process.env` (~25 variables), sans validation centralisée. Noms réels à conserver : `DATABASE_URL`, `ENCRYPTION_KEY`, `LDAP_URL/LDAP_BIND_DN/LDAP_PWD/LDAP_BASE_DN`, `AZURE_*`, `GRAPH_SENDER_EMAIL`, `SMTP_*`, `INTERNAL_SOCKET_TOKEN`, `NEXT_ALLOWED_ORIGINS`, `COOKIE_SECURE`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL`, `API_URL`, `OLLAMA_*`. `REDIS_URL` et `SESSION_SECRET` n'existent pas (le second est inutile tant que les sessions restent en base).
6. PDF : `lib/reports/html-to-pdf.ts` utilise Playwright/Chromium dans le backend → image lourde ; candidat à une extraction dans le worker, mais les exports PDF sont synchrones (appelés par le frontend) : ne pas déplacer sans file + attente de résultat.
7. Dépendances Windows : `ecosystem.config.*`, scripts `.ps1`, binding `127.0.0.1`, chemins IIS/ARR dans les commentaires (`trust proxy`). Fuseau horaire : R-17 de l'audit (Windows UTC+1 vs Europe/Paris) → `TZ` explicite dans les conteneurs.
8. Risques sécurité déjà connus à corriger pendant la migration : R-01 (escalade manager→admin), R-02 (brute-force), R-03 (LDAP clair), R-05, R-06, R-07, R-09, R-12.

### Contrainte non négociable
`ENCRYPTION_KEY` : lue telle quelle, jamais générée par un script de déploiement ; documenter sa sauvegarde séparée.

## 2. Architecture cible retenue (ajustée au réel)

```
apps/web      ← frontend/        apps/api   ← backend/ (sans les crons)
apps/worker   ← nouveau (Nest standalone context, BullMQ + crons)
packages/database  Prisma (schema, migrations, client généré, PrismaService)
packages/config    env Zod partagé + tsconfig/eslint de base
packages/shared    uniquement ce qui est réellement partagé (crypto AES, constantes, types)
infrastructure/    docker/, postgres/, redis/, dokploy/
```
Non créé tant qu'il n'a pas de consommateur : `packages/validation` (le frontend a `src/schemas` ; à n'extraire que si l'API réutilise ces schémas Zod).

Le worker réutilise les services existants (LDAP sync, email, rapports) en important les modules Nest depuis un package partagé ou depuis `apps/api` en lib ; **décision à prendre** (voir §4).

## 3. Phases

| # | Phase | Contenu | Validation |
|---|---|---|---|
| 0 | Filet de sécurité | Tag git, branche dédiée, build+tests actuels en référence (npm) | build/test verts avant tout déplacement |
| 1 | Workspace pnpm | `git mv frontend→apps/web`, `backend→apps/api`, `pnpm-workspace.yaml`, `.npmrc`, `package.json` racine, `engines`/`packageManager`, un seul lockfile, suppression des `package-lock.json` | `pnpm install`, `pnpm -r build/lint/typecheck/test` identiques à la référence |
| 2 | `packages/database` | Déplacer schema+migrations+client généré+`PrismaService` ; aucune modif de modèle ; `migrate status` sur base de dev jetable | build api OK, `prisma migrate diff` vide |
| 3 | `packages/config` + `shared` | Env Zod (noms existants), crypto AES-GCM inchangé (tests d'iso-comportement sur valeurs chiffrées existantes) | tests crypto + démarrage avec ancien `.env` |
| 4 | Redis + API | Module Redis unique (ioredis), health `/api/health` (DB+Redis), throttler réel avec stockage Redis (fail-open si Redis down), cache TTL ciblé, adapter Socket.IO Redis (dégradé en mémoire si indisponible) | tests unitaires + Redis arrêté/relancé |
| 5 | Worker | `apps/worker`, BullMQ (job schedulers répétables, `jobId` déterministe, verrous, idempotence), retrait des `@Interval/@Cron` de l'API derrière un flag `RUN_SCHEDULERS=false` | tâche exécutée une seule fois avec 2 workers |
| 6 | Sécurité | R-01, R-02, R-05, R-06 (correctifs ciblés), `forbidNonWhitelisted`, DTO sur routes sensibles, CORS/WS stricts | tests de non-régression des gardes |
| 7 | Docker | 3 Dockerfiles multi-stage non-root (`pnpm deploy`), `output: standalone`, compose dev + prod, Postgres/Redis non exposés, service `migrate` one-shot | `docker compose up`, healthchecks, restart, persistance |
| 8 | Dokploy | Compose compatible (pas de `container_name`, pas de ports hôte, réseau `dokploy-network` + labels Traefik pour web seulement), staging | déploiement staging réel (nécessite un VPS) |
| 9 | Docs + plan prod | Les 10 documents demandés, `migration-production.md`, sauvegarde/restauration testée | restauration réelle vérifiée |

Chaque phase = un commit séparé, retour arrière par `git revert`. La prod Windows n'est jamais touchée.

## 4. Décisions à valider avant la phase 1

1. **Domaine** : un seul domaine (Traefik route `/api/*` non-Next et `/socket.io` vers l'API, le reste vers Next) ou deux (`app.` / `api.`) ? Le domaine unique oblige à renommer le préfixe des route handlers Next ou le préfixe Nest pour lever la collision `/api`. Recommandation : API Nest sous `/api` inchangé (préserve les clients et le frontend actuel), et regrouper les handlers Next sous un autre préfixe, ou router par liste explicite de chemins.
2. **Node** : 22 LTS (Dockerfiles actuels) ou 24 (poste local) ? Recommandation : 22 LTS en image, `engines >=22`.
3. **Worker** : partager le code des services (LDAP, email, rapports) via `packages/` (plus propre, plus de déplacements) ou importer depuis `apps/api` ? Recommandation : garder les modules métier dans `apps/api` en phase 5 et exposer un contexte Nest minimal au worker via un package interne `@elitetime/core` seulement si le couplage l'impose.
4. **PDF/Playwright** : rester dans l'API en première étape (recommandé) ; extraction au worker plus tard.
5. **Rythme** : le plan est séquentiel et chaque phase est vérifiée. Faut-il enchaîner les phases 0 à 3 maintenant ?

## 5. Ce qui ne pourra pas être validé en local
Authentification LDAP réelle, envoi Graph réel, déploiement Dokploy/Traefik/HTTPS, basculement DNS : nécessitent l'AD, un tenant Azure et un VPS Ubuntu. Ils seront listés « non testés » dans le rapport final.
