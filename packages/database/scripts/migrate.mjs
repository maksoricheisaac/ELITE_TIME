#!/usr/bin/env node
/**
 * Migration sûre et idempotente, exécutée AVANT le démarrage des applications.
 *
 *  - Base déjà gérée par Prisma (table _prisma_migrations) ou contenant déjà des
 *    tables  -> `prisma migrate deploy` (applique uniquement les migrations en attente).
 *  - Base VIDE (aucune table dans le schéma public) -> amorçage : `prisma db push`
 *    crée le schéma complet, puis chaque migration est marquée "appliquée"
 *    (`migrate resolve --applied`). Nécessaire car l'historique de migrations
 *    ne peut pas reconstruire une base vide (la migration rbac_granular suppose
 *    des tables créées hors migrations).
 *
 * Ne lance JAMAIS `migrate reset` et ne supprime aucune donnée.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'prisma', 'migrations');

if (!process.env.DATABASE_URL) {
  console.error('[migrate] DATABASE_URL manquante');
  process.exit(1);
}

const prisma = (...args) =>
  execFileSync('npx', ['prisma', ...args], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

async function tableCount() {
  // Retries : PostgreSQL peut démarrer en même temps que ce script
  for (let i = 1; i <= 30; i++) {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    try {
      await client.connect();
      const r = await client.query(
        "select count(*)::int as n from information_schema.tables where table_schema = 'public'",
      );
      return r.rows[0].n;
    } catch (e) {
      console.log(`[migrate] base non joignable (${i}/30) : ${e.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    } finally {
      await client.end().catch(() => undefined);
    }
  }
  throw new Error('Base de données injoignable');
}

const tables = await tableCount();

if (tables === 0) {
  console.log('[migrate] base vide : amorçage du schéma (db push) puis marquage des migrations');
  prisma('db', 'push');
  const names = readdirSync(migrationsDir)
    .filter((n) => statSync(join(migrationsDir, n)).isDirectory())
    .sort();
  for (const name of names) prisma('migrate', 'resolve', '--applied', name);
}

console.log('[migrate] migrate deploy');
prisma('migrate', 'deploy');
console.log('[migrate] terminé');
