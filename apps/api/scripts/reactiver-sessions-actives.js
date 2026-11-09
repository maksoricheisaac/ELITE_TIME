#!/usr/bin/env node
/**
 * Réactivation des sessions pointées sans sortie — EliteTime
 *
 * Détecte les pointages du jour (ou d'une date donnée) marqués
 * isActive=false MAIS sans heure de sortie enregistrée.
 * Ces sessions ont été incorrectement fermées (auto-close, action admin,
 * bug de concurrence…) alors que l'employé est toujours présent.
 *
 * Usage :
 *   node backend/scripts/reactiver-sessions-actives.js            ← dry-run (simulation)
 *   node backend/scripts/reactiver-sessions-actives.js --fix      ← APPLIQUE les corrections
 *   node backend/scripts/reactiver-sessions-actives.js --date 2026-05-26 --fix
 *
 * Options :
 *   --fix              Applique réellement les modifications en base
 *   --date YYYY-MM-DD  Cible une date précise (défaut : aujourd'hui)
 *   --silencieux       Supprime le détail par ligne
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const { createDecipheriv } = require('crypto');
const { Client }           = require('pg');

// ─── Charger le .env ─────────────────────────────────────────────────────────
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .forEach(line => {
      const m = line.match(/^([^#=\s][^=]*?)=(.*)$/);
      if (m && !process.env[m[1]]) {
        let val = m[2].trim();
        if (/^["'].*["']$/.test(val)) val = val.slice(1, -1);
        process.env[m[1]] = val;
      }
    });
}

// ─── Crypto AES-256-GCM ──────────────────────────────────────────────────────
const IV_LENGTH       = 12;
const AUTH_TAG_LENGTH = 16;

function decrypt(value) {
  if (!value) return value;
  const key = process.env.ENCRYPTION_KEY;
  if (!key) return null;
  try {
    const buf = Buffer.from(value, 'base64');
    if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) return value;
    const iv         = buf.subarray(0, IV_LENGTH);
    const authTag    = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher   = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return value;
  }
}

// ─── Parsing CLI ─────────────────────────────────────────────────────────────
const args       = process.argv.slice(2);
const DRY_RUN    = !args.includes('--fix');
const SILENCIEUX = args.includes('--silencieux');

const dateArgIdx = args.indexOf('--date');
let targetDate   = null;
if (dateArgIdx !== -1 && args[dateArgIdx + 1]) {
  targetDate = args[dateArgIdx + 1];
} else {
  const now = new Date();
  targetDate = now.toISOString().slice(0, 10); // YYYY-MM-DD
}

// ─── Couleurs ANSI ───────────────────────────────────────────────────────────
const USE_COLOR = process.stdout.isTTY !== false;
const C = {
  reset:'\x1b[0m', bold:'\x1b[1m', dim:'\x1b[2m',
  red:'\x1b[31m', yellow:'\x1b[33m', cyan:'\x1b[36m',
  green:'\x1b[32m', magenta:'\x1b[35m',
};
const c = (color, text) => USE_COLOR ? `${C[color]}${text}${C.reset}` : text;
function sep(ch = '─', n = 100) { return c('dim', ch.repeat(n)); }
function fmtDate(d) {
  return d
    ? new Date(d).toLocaleDateString('fr-FR', { weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit' })
    : '—';
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[ERREUR] DATABASE_URL non défini. Vérifiez votre .env');
    process.exit(1);
  }

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  try {
    // Plage du jour ciblé (UTC → le serveur gère les TZ dans les requêtes)
    const dayStart = new Date(targetDate + 'T00:00:00');
    const dayEnd   = new Date(targetDate + 'T23:59:59.999');

    // ── 1. Trouver les sessions sans sortie incorrectement fermées ────────────
    const { rows } = await db.query(`
      SELECT
        p.id,
        p."userId",
        p.date,
        p."entryTime",
        p."exitTime",
        p.status,
        p."isActive",
        p."sessionNumber",
        p.source,
        p."pointedBy",
        u.firstname,
        u.lastname,
        u.username
      FROM "Pointage" p
      JOIN "User" u ON u.id = p."userId"
      WHERE p."isActive"  = false
        AND p."entryTime" IS NOT NULL
        AND p."exitTime"  IS NULL
        AND p.date >= $1
        AND p.date <= $2
      ORDER BY p.date DESC, u.lastname ASC
    `, [dayStart, dayEnd]);

    console.log();
    console.log(sep('═'));
    if (DRY_RUN) {
      console.log(c('bold', c('yellow', '  ⚠  MODE SIMULATION — aucune modification en base')));
      console.log(c('dim', '  Pour appliquer : node scripts/reactiver-sessions-actives.js --fix'));
    } else {
      console.log(c('bold', c('green', '  ✔  MODE CORRECTION — application en base')));
    }
    console.log(sep('═'));
    console.log(`\n  Date ciblée : ${c('cyan', targetDate)}\n`);

    if (rows.length === 0) {
      console.log(c('green', '  ✔  Aucune session à réactiver pour cette date.\n'));
      return;
    }

    console.log(`  Sessions à réactiver : ${c('bold', rows.length)}\n`);

    if (!SILENCIEUX) {
      console.log(c('bold', '  DÉTAIL'));
      console.log(sep());

      for (const [i, row] of rows.entries()) {
        const entryTime = decrypt(row.entryTime ?? row.entrytime);
        const nom = [
          decrypt(row.firstname),
          decrypt(row.lastname),
        ].filter(Boolean).join(' ') || decrypt(row.username) || (row.userId ?? row.userid);

        console.log(
          `  [${String(i + 1).padStart(2, '0')}]  ${c('bold', nom.padEnd(42))}  ${fmtDate(row.date)}`
        );
        console.log(
          `         Entrée: ${c('cyan', entryTime || '—').padEnd(12)}  ` +
          `Session n°${row.sessionNumber ?? row.sessionnumber}  ` +
          `Statut actuel: ${c('yellow', row.status)}  ` +
          c('dim', `(source: ${row.source})`)
        );
        console.log(
          `         ${c('magenta', 'isActive: false → true')}  ` +
          c('dim', '(l\'employé n\'a pas pointé sa sortie)')
        );
        console.log();
      }
    }

    if (DRY_RUN) {
      console.log(sep('═'));
      console.log(c('yellow', '  SIMULATION TERMINÉE — aucune donnée modifiée.'));
      console.log(c('dim',    '  Relancez avec --fix pour appliquer ces réactivations.'));
      console.log(sep('═'));
      console.log();
      return;
    }

    // ── 2. Réactiver les sessions ─────────────────────────────────────────────
    const ids = rows.map(r => r.id);
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const res = await db.query(
      `UPDATE "Pointage"
         SET "isActive" = true,
             "updatedAt" = NOW()
       WHERE id IN (${placeholders})`,
      ids
    );

    console.log(sep('═'));
    console.log(c('bold', c('green', `  ✔  RÉACTIVATION TERMINÉE — ${res.rowCount} session(s) remises à isActive=true`)));
    console.log(sep('═'));
    console.log();
    console.log(c('dim', '  Les employés concernés verront maintenant "Pointer ma sortie" sur leur dashboard.'));
    console.log();

  } finally {
    await db.end();
  }
}

main().catch(err => {
  console.error('\n' + c('red', '[ERREUR]'), err.message || err);
  process.exit(1);
});
