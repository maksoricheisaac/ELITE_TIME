#!/usr/bin/env node
/**
 * Correcteur de statuts "incomplete" erronés — EliteTime
 *
 * Détecte les pointages marqués "incomplete" alors qu'ils ont une heure
 * d'entrée ET une heure de sortie (i.e. ils sont réellement complets),
 * puis recalcule le bon statut : "normal" ou "late" selon workStartTime.
 *
 * Note : depuis la correction du bug dans PointagesService.start(), les
 * sessions carry-over (active d'un jour précédent) reçoivent "admin_closed"
 * et non "incomplete". Ce script corrige les données historiques antérieures
 * à ce fix.
 *
 * Usage :
 *   node backend/scripts/corriger-statuts-incomplets.js          ← dry-run (simulation)
 *   node backend/scripts/corriger-statuts-incomplets.js --fix    ← APPLIQUE les corrections
 *   node backend/scripts/corriger-statuts-incomplets.js --fix --silencieux
 *
 *   Options supplémentaires :
 *   --aussi-sans-sortie   Inclut aussi les pointages "incomplete" sans exitTime
 *                         mais avec entryTime : les passe en "admin_closed"
 *                         (carry-over d'anciennes versions du bug).
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
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) return null;
  try {
    const buf = Buffer.from(value, 'base64');
    if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) return value;
    const iv         = buf.subarray(0, IV_LENGTH);
    const authTag    = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const key        = Buffer.from(encryptionKey, 'hex');
    const decipher   = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return value;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isWeekend(date) {
  const d = new Date(date).getDay();
  return d === 0 || d === 6;
}

function computeStatus(entryTime, date, workStartTime) {
  if (!entryTime) return 'incomplete';
  if (isWeekend(date)) return 'normal';
  const [eh, em] = entryTime.split(':').map(Number);
  const [sh, sm] = workStartTime.split(':').map(Number);
  return (eh > sh || (eh === sh && em > sm)) ? 'late' : 'normal';
}

// ─── Parsing CLI ─────────────────────────────────────────────────────────────
const args           = process.argv.slice(2);
const DRY_RUN        = !args.includes('--fix');
const SILENCIEUX     = args.includes('--silencieux');
const AUSSI_SANS_SORTIE = args.includes('--aussi-sans-sortie');

// ─── Couleurs ANSI ───────────────────────────────────────────────────────────
const USE_COLOR = process.stdout.isTTY !== false;
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m',
  green: '\x1b[32m', magenta: '\x1b[35m', white: '\x1b[37m',
  bgGreen: '\x1b[42m', bgYellow: '\x1b[43m', bgBlue: '\x1b[44m',
};
const c = (color, text) => USE_COLOR ? `${C[color]}${text}${C.reset}` : text;

function sep(char = '─', len = 100) { return c('dim', char.repeat(len)); }

function fmtDate(d) {
  return d
    ? new Date(d).toLocaleDateString('fr-FR', { weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit' })
    : '—';
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[ERREUR] DATABASE_URL non défini. Vérifiez votre fichier .env');
    process.exit(1);
  }

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  try {
    // ── 1. Récupérer les paramètres système ───────────────────────────────────
    const { rows: [settings] } = await db.query(
      `SELECT "workStartTime", "workEndTime", "maxSessionEndTime", timezone FROM "SystemSettings" WHERE id = 1`
    );

    if (!settings) {
      console.error('[ERREUR] Table SystemSettings vide.');
      process.exit(1);
    }

    const workStartTime = settings.workStartTime ?? settings.workstarttime ?? '08:45';

    // ── 2a. Pointages "incomplete" avec entrée ET sortie (faux incomplets) ────
    const { rows: rowsComplets } = await db.query(`
      SELECT
        p.id,
        p."userId",
        p.date,
        p."entryTime",
        p."exitTime",
        p.duration,
        p.status,
        p."isActive",
        p."sessionNumber",
        p.source,
        p."pointedBy",
        p."createdAt",
        p."updatedAt",
        u.firstname,
        u.lastname,
        u.username
      FROM "Pointage" p
      JOIN "User" u ON u.id = p."userId"
      WHERE p.status = 'incomplete'
        AND p."entryTime" IS NOT NULL
        AND p."exitTime"  IS NOT NULL
        AND p."isActive"  = false
      ORDER BY p.date DESC, u.lastname ASC
    `);

    // ── 2b. (optionnel) "incomplete" avec entrée mais sans sortie ─────────────
    // Ces pointages sont des carry-over de l'ancien bug de start() :
    // ils recevaient "incomplete" au lieu de "admin_closed".
    let rowsSansSortie = [];
    if (AUSSI_SANS_SORTIE) {
      const { rows } = await db.query(`
        SELECT
          p.id,
          p."userId",
          p.date,
          p."entryTime",
          p."exitTime",
          p.duration,
          p.status,
          p."isActive",
          p."sessionNumber",
          p.source,
          p."pointedBy",
          p."createdAt",
          p."updatedAt",
          u.firstname,
          u.lastname,
          u.username
        FROM "Pointage" p
        JOIN "User" u ON u.id = p."userId"
        WHERE p.status = 'incomplete'
          AND p."entryTime" IS NOT NULL
          AND p."exitTime"  IS NULL
          AND p."isActive"  = false
        ORDER BY p.date DESC, u.lastname ASC
      `);
      rowsSansSortie = rows;
    }

    if (rowsComplets.length === 0 && rowsSansSortie.length === 0) {
      console.log(c('green', '\n  ✔  Aucun pointage à corriger.\n'));
      return;
    }

    // ── 3. Calculer le nouveau statut ─────────────────────────────────────────
    const corrections = rowsComplets.map(row => {
      const entryTime = decrypt(row.entryTime ?? row.entrytime);
      const exitTime  = decrypt(row.exitTime  ?? row.exittime);
      const nom       = [decrypt(row.firstname), decrypt(row.lastname)]
        .filter(Boolean).join(' ') || decrypt(row.username) || (row.userId ?? row.userid);
      const nouveauStatut = computeStatus(entryTime, row.date, workStartTime);
      return {
        id:            row.id,
        userId:        row.userId         ?? row.userid,
        date:          row.date,
        nom,
        sessionNumber: row.sessionNumber  ?? row.sessionnumber,
        source:        row.source,
        pointedBy:     row.pointedBy      ?? row.pointedby,
        entryTime,
        exitTime,
        duration:      row.duration,
        ancienStatut:  row.status,
        nouveauStatut,
        createdAt:     row.createdAt      ?? row.createdat,
        updatedAt:     row.updatedAt      ?? row.updatedat,
      };
    });

    const carryOver = rowsSansSortie.map(row => {
      const entryTime = decrypt(row.entryTime ?? row.entrytime);
      const nom       = [decrypt(row.firstname), decrypt(row.lastname)]
        .filter(Boolean).join(' ') || decrypt(row.username) || (row.userId ?? row.userid);
      return {
        id:            row.id,
        userId:        row.userId         ?? row.userid,
        date:          row.date,
        nom,
        sessionNumber: row.sessionNumber  ?? row.sessionnumber,
        source:        row.source,
        pointedBy:     row.pointedBy      ?? row.pointedby,
        entryTime,
        exitTime:      null,
        duration:      row.duration,
        ancienStatut:  row.status,
        nouveauStatut: 'admin_closed',
        createdAt:     row.createdAt      ?? row.createdat,
        updatedAt:     row.updatedAt      ?? row.updatedat,
      };
    });

    const nbNormal     = corrections.filter(r => r.nouveauStatut === 'normal').length;
    const nbLate       = corrections.filter(r => r.nouveauStatut === 'late').length;
    const nbAdminClosed = carryOver.length;

    // ── 4. Affichage ──────────────────────────────────────────────────────────
    console.log();
    console.log(sep('═'));
    if (DRY_RUN) {
      console.log(c('bold', c('yellow', '  ⚠  MODE SIMULATION (dry-run) — aucune modification en base')));
      console.log(c('dim', '  Pour appliquer : node scripts/corriger-statuts-incomplets.js --fix'));
    } else {
      console.log(c('bold', c('green', '  ✔  MODE CORRECTION — application des modifications en base')));
    }
    console.log(sep('═'));
    console.log();
    console.log(`  Heure début travail (workStartTime) : ${c('cyan', workStartTime)}`);
    console.log(`  Règle : entryTime > ${workStartTime} → ${c('yellow','late')}  |  entryTime ≤ ${workStartTime} → ${c('green','normal')}  |  sans sortie → ${c('magenta','admin_closed')}`);
    console.log();

    if (corrections.length > 0) {
      console.log(c('bold', `  GROUPE 1 — Faux "incomplete" (entrée + sortie présentes) : ${c('bold', corrections.length)}`));
      console.log(`    → ${c('green', nbNormal)} passeront à "normal"`);
      console.log(`    → ${c('yellow', nbLate)} passeront à "late"`);
      console.log();
    }

    if (carryOver.length > 0) {
      console.log(c('bold', `  GROUPE 2 — Carry-over (entrée sans sortie) : ${c('bold', nbAdminClosed)}`));
      console.log(`    → ${c('magenta', nbAdminClosed)} passeront à "admin_closed"`);
      console.log();
    }

    if (!SILENCIEUX) {
      const allRows = [...corrections, ...carryOver];

      if (allRows.length > 0) {
        console.log(c('bold', '  DÉTAIL DES CORRECTIONS'));
        console.log(sep());

        for (const [i, cor] of allRows.entries()) {
          const idx = c('dim', `[${String(i + 1).padStart(2, '0')}]`);
          const nvColor = cor.nouveauStatut === 'normal' ? 'green'
                        : cor.nouveauStatut === 'late'   ? 'yellow'
                        : 'magenta';

          console.log(
            `${idx}  ${c('bold', cor.nom.padEnd(42))}  ` +
            `${fmtDate(cor.date)}  ` +
            `  session n°${cor.sessionNumber}`
          );
          console.log(
            `       Entrée: ${c('cyan', cor.entryTime || '—').padEnd(10)}  ` +
            `Sortie: ${c('cyan', cor.exitTime || '—').padEnd(10)}  ` +
            `Durée: ${cor.duration != null ? Math.floor(cor.duration/60)+'h'+String(cor.duration%60).padStart(2,'0') : '—'}`
          );
          console.log(
            `       Statut: ${c('red', cor.ancienStatut.padEnd(12))} → ${c(nvColor, cor.nouveauStatut)}  ` +
            c('dim', `(source: ${cor.source}, pointé par: ${cor.pointedBy})`)
          );
          console.log();
        }
      }
    }

    // ── 5. Application en base (mode --fix uniquement) ────────────────────────
    if (DRY_RUN) {
      console.log(sep('═'));
      console.log(c('yellow', '  SIMULATION TERMINÉE — aucune donnée modifiée.'));
      console.log(c('dim',    '  Relancez avec --fix pour appliquer ces corrections.'));
      if (AUSSI_SANS_SORTIE) {
        console.log(c('dim',  '  --aussi-sans-sortie actif : les carry-over seront aussi corrigés.'));
      } else {
        console.log(c('dim',  '  Ajoutez --aussi-sans-sortie pour inclure les carry-over sans exitTime.'));
      }
      console.log(sep('═'));
      console.log();
      return;
    }

    let totalMaj = 0;

    // Groupe 1 : faux incomplets avec sortie
    const idsNormal = corrections.filter(r => r.nouveauStatut === 'normal').map(r => r.id);
    const idsLate   = corrections.filter(r => r.nouveauStatut === 'late').map(r => r.id);

    if (idsNormal.length > 0) {
      const placeholders = idsNormal.map((_, i) => `$${i + 1}`).join(', ');
      const res = await db.query(
        `UPDATE "Pointage" SET status = 'normal', "updatedAt" = NOW() WHERE id IN (${placeholders})`,
        idsNormal
      );
      totalMaj += res.rowCount;
      console.log(c('green', `  ✔  ${res.rowCount} pointage(s) → "normal"`));
    }

    if (idsLate.length > 0) {
      const placeholders = idsLate.map((_, i) => `$${i + 1}`).join(', ');
      const res = await db.query(
        `UPDATE "Pointage" SET status = 'late', "updatedAt" = NOW() WHERE id IN (${placeholders})`,
        idsLate
      );
      totalMaj += res.rowCount;
      console.log(c('yellow', `  ✔  ${res.rowCount} pointage(s) → "late"`));
    }

    // Groupe 2 : carry-over sans sortie
    const idsCarryOver = carryOver.map(r => r.id);
    if (idsCarryOver.length > 0) {
      const placeholders = idsCarryOver.map((_, i) => `$${i + 1}`).join(', ');
      const res = await db.query(
        `UPDATE "Pointage" SET status = 'admin_closed', "updatedAt" = NOW() WHERE id IN (${placeholders})`,
        idsCarryOver
      );
      totalMaj += res.rowCount;
      console.log(c('magenta', `  ✔  ${res.rowCount} pointage(s) → "admin_closed"`));
    }

    console.log();
    console.log(sep('═'));
    console.log(c('bold', c('green', `  ✔  CORRECTION TERMINÉE — ${totalMaj} pointage(s) mis à jour en base`)));
    console.log(sep('═'));
    console.log();

    // ── 6. Vérification post-correction ──────────────────────────────────────
    const { rows: reste } = await db.query(
      `SELECT COUNT(*) AS nb FROM "Pointage"
       WHERE status = 'incomplete'
         AND "entryTime" IS NOT NULL
         AND "exitTime"  IS NOT NULL
         AND "isActive"  = false`
    );
    const nbReste = parseInt(reste[0].nb, 10);
    if (nbReste === 0) {
      console.log(c('green', '  ✔  Vérification : plus aucun pointage complet avec statut "incomplete".'));
    } else {
      console.log(c('red', `  ⚠  Vérification : ${nbReste} pointage(s) complet(s) avec statut "incomplete" subsistent — investigation nécessaire.`));
    }

    if (AUSSI_SANS_SORTIE) {
      const { rows: resteCO } = await db.query(
        `SELECT COUNT(*) AS nb FROM "Pointage"
         WHERE status = 'incomplete'
           AND "entryTime" IS NOT NULL
           AND "exitTime"  IS NULL
           AND "isActive"  = false`
      );
      const nbResteCO = parseInt(resteCO[0].nb, 10);
      if (nbResteCO === 0) {
        console.log(c('green', '  ✔  Vérification : plus aucun carry-over avec statut "incomplete".'));
      } else {
        console.log(c('red', `  ⚠  Vérification : ${nbResteCO} carry-over subsistent — investigation nécessaire.`));
      }
    }
    console.log();

  } finally {
    await db.end();
  }
}

main().catch(err => {
  console.error('\n' + c('red', '[ERREUR]'), err.message || err);
  process.exit(1);
});
