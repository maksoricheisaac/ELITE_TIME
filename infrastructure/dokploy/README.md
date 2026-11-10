# Déploiement Dokploy — ELITE TIME

> **Statut : non testé sur une instance Dokploy.** Cette configuration a été préparée
> à partir du `docker-compose.yml` validé en local avec Docker. Les étapes propres à
> Dokploy (domaines, certificats, redéploiement Git) sont à vérifier sur un VPS de staging.

## Principe

- Type d'application Dokploy : **Docker Compose**, source **Git**, fichier `./docker-compose.yml`.
- Le compose ne contient ni `container_name`, ni port publié (hors loopback), ni label Traefik :
  les domaines se déclarent dans l'onglet **Domains** de Dokploy, qui configure Traefik et
  le réseau pour vous. Aucune modification des fichiers internes de Traefik.
- PostgreSQL, Redis, migrate, backup : réseau Docker `data` **interne** (sans accès Internet).
  L'API n'est pas publiée : elle n'est joignable que par `web`, `worker` et par les routes
  ci-dessous.

## Domaine unique (recommandé)

Dans l'onglet **Domains**, ajouter 3 entrées pour le même hôte (`APP_DOMAIN`, HTTPS + Let's Encrypt) :

| Service | Port | Chemin (path) | Rôle |
|---|---|---|---|
| `web` | 3000 | `/` | Interface Next.js (et ses route handlers `/api/login`, `/api/me`, `/api/reports/*`…) |
| `api` | 4000 | `/socket.io` | Socket.IO (polling + WebSocket) |
| `api` | 4000 | `/api/ai` | Assistant IA (streaming SSE) |

Pourquoi ces deux chemins seulement : le navigateur n'appelle l'API NestJS **directement** que pour
Socket.IO et l'assistant IA (`NEXT_PUBLIC_API_URL`). Tout le reste passe par Next.js (qui joint
l'API via `http://api:4000/api` sur le réseau interne). Ne **pas** router `/api` entier vers
l'API : les route handlers Next.js sont aussi sous `/api`. Le chemin le plus spécifique doit
l'emporter (Traefik priorise les règles `PathPrefix` les plus longues).

À vérifier sur staging : le WebSocket (`wss://APP_DOMAIN/socket.io/?EIO=4&transport=websocket`)
traverse bien Traefik, et le streaming de `/api/ai/chat/stream` n'est pas mis en tampon.

## Variables d'environnement (onglet Environment)

Voir `docs/environment-variables.md` (complet) ; minimum :

```
APP_DOMAIN=elitetime.example.com
POSTGRES_PASSWORD=<openssl rand -hex 24>
REDIS_PASSWORD=<openssl rand -hex 24>
ENCRYPTION_KEY=<clé existante de la production — NE PAS RÉGÉNÉRER>
LDAP_URL=ldaps://...   LDAP_BIND_DN=...   LDAP_PWD=...   LDAP_BASE_DN=...
AZURE_TENANT_ID=...    AZURE_CLIENT_ID=... AZURE_CLIENT_SECRET=...   GRAPH_SENDER_EMAIL=...
```

Les mots de passe PostgreSQL/Redis sont insérés dans des URL : n'utiliser que des caractères
alphanumériques (`openssl rand -hex 24`).

`NEXT_PUBLIC_*` sont **figées à la compilation** : changer `APP_DOMAIN` impose un redéploiement
avec reconstruction de l'image `web`.

## Environnements

Un projet Dokploy par environnement (staging, production), chacun avec **son** compose, ses
volumes (`pgdata`, `redisdata`, `pgbackups`), sa base, son Redis, ses secrets et son domaine.
Pour partager un Redis entre environnements (déconseillé), changer `REDIS_KEY_PREFIX`.

## Redéploiement

Activer « Auto Deploy » (webhook Git) sur la branche voulue ; chaque push reconstruit les images,
relance `migrate` (migrations en attente uniquement) puis api/worker/web. Retour arrière :
redéployer le commit précédent (les migrations déjà appliquées ne sont pas annulées — voir
`docs/migration-production.md`).
