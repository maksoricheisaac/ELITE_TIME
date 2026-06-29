# ── Stage 1 : build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Dépendances d'abord pour profiter du cache Docker
COPY package*.json ./
RUN npm ci

# Code source
COPY . .

# Génération du client Prisma puis build NestJS
RUN npx prisma generate --schema=prisma/schema.prisma
RUN npm run build

# ── Stage 2 : production ─────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Dépendances de production uniquement
COPY package*.json ./
RUN npm ci --omit=dev

# Artefacts du build
COPY --from=builder /app/dist ./dist

# Schéma Prisma + client généré (requis au runtime)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Migrations Prisma (exécutées au démarrage via entrypoint)
COPY --from=builder /app/prisma/migrations ./prisma/migrations

EXPOSE 4000

# Appliquer les migrations puis démarrer
CMD ["sh", "-c", "npx prisma migrate deploy --schema=prisma/schema.prisma && node dist/src/main"]
