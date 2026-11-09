# Démo locale — voir les espaces par rôle (sans Active Directory)

Base séparée `elitetime_demo` (ne touche pas `elitetime_dev`). Prérequis : PostgreSQL local.

```bash
pnpm install
pnpm build                                  # une fois (packages partagés)
pnpm dev:demo                               # API :4000 + Web :3001
```

Ouvrir http://localhost:3001 — mot de passe de tous les comptes : `Demo#Elite2026`

| Compte | Rôle |
|---|---|
| demo.admin | admin |
| demo.manager | manager |
| demo.teamlead | team_lead |
| demo.employee | employee |

Fichiers de profil (non versionnés) : `apps/api/.env.demo` (base demo, `DEV_ALLOW_LOCAL_LOGIN_ALL_ROLES=true`),
`apps/web/.env.local` (URLs de l'API). Après la première connexion en admin, appeler une fois
`POST /api/admin/seed/permissions` puis `/api/admin/seed/grant-all` (déjà fait sur `elitetime_demo`).

Recréer la base demo : voir `apps/api/scripts/seed-demo-users.js` (refuse toute base ne finissant pas par `_demo`, `_dev` ou `_local`).
