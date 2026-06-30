#!/usr/bin/env node
/**
 * Diagnostic des pointages du jour — EliteTime
 *
 * Affiche TOUS les pointages du jour (ou d'une date donnée)
 * avec leur état exact (isActive, entryTime, exitTime, status, source).
 *
 * Usage :
 *   node backend/scripts/diagnostic-pointages-jour.js
 *   node backend/scripts/diagnostic-pointages-jour.js --date 2026-05-26
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const { createDecipheriv } = require('crypto');
const { Client }           = require('pg');

const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
    const m = line.match(/^([^#=\s][^=]*?)=(.*)$/);
    if (m && !process.env[m[1]]) {
      let val = m[2].trim();
      if (/^["'].*["']$/.test(val)) val = val.slice(1, -1);
      process.env[m[1]] = val;
    }
  });
}

const IV_LENGTH = 12, AUTH_TAG_LENGTH = 16;
function decrypt(value) {
  if (!value) return null;
  const key = process.env.ENCRYPTION_KEY;
  if (!key) return '(clé manquante)';
  try {
    const buf = Buffer.from(value, 'base64');
    if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) return value;
    const iv = buf.subarray(0, IV_LENGTH);
    const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ct = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const d = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
    d.setAuthTag(authTag);
    return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
  } catch { return '(déchiffrement échoué)'; }
}

const USE_COLOR = process.stdout.isTTY !== false;
const C = { reset:'\x1b[0m', bold:'\x1b[1m', dim:'\x1b[2m', red:'\x1b[31m',
  yellow:'\x1b[33m', cyan:'\x1b[36m', green:'\x1b[32m', magenta:'\x1b[35m' };
const c = (col, txt) => USE_COLOR ? `${C[col]}${txt}${C.reset}` : txt;
function sep(ch='─', n=100) { return c('dim', ch.repeat(n)); }

const args = process.argv.slice(2);
const dateArgIdx = args.indexOf('--date');
const targetDate = dateArgIdx !== -1 && args[dateArgIdx+1]
  ? args[dateArgIdx+1]
  : new Date().toISOString().slice(0, 10);

async function main() {
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL manquant'); process.exit(1); }

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  try {
    const dayStart = new Date(targetDate + 'T00:00:00');
    const dayEnd   = new Date(targetDate + 'T23:59:59.999');

    const { rows } = await db.query(`
      SELECT
        p.id, p."userId", p.date, p."entryTime", p."exitTime",
        p.status, p."isActive", p."sessionNumber", p.source,
        p."pointedBy", p.duration, p."createdAt",
        u.firstname, u.lastname, u.username
      FROM "Pointage" p
      JOIN "User" u ON u.id = p."userId"
      WHERE p.date >= $1 AND p.date <= $2
      ORDER BY u.lastname ASC, p."sessionNumber" ASC
    `, [dayStart, dayEnd]);

    console.log();
    console.log(sep('═'));
    console.log(c('bold', `  DIAGNOSTIC POINTAGES — ${targetDate}`));
    console.log(sep('═'));
    console.log(`\n  Requête: ${c('dim', `date >= ${dayStart.toISOString()} AND date <= ${dayEnd.toISOString()}`)}`);
    console.log(`  Pointages trouvés : ${c('bold', rows.length)}\n`);

    if (rows.length === 0) {
      console.log(c('yellow', '  ⚠  Aucun pointage en base pour cette date/plage.'));
      console.log(c('dim',    '  Vérifiez que la date correspond au fuseau horaire du serveur.'));
      console.log();

      // Afficher quelques pointages récents pour vérification
      const { rows: recent } = await db.query(`
        SELECT p.id, p.date, p."isActive", p.status, u.firstname, u.lastname
        FROM "Pointage" p JOIN "User" u ON u.id = p."userId"
        ORDER BY p.date DESC LIMIT 10
      `);
      if (recent.length > 0) {
        console.log(c('cyan', '  10 derniers pointages en base (toutes dates) :'));
        console.log(sep());
        for (const r of recent) {
          const nom = [decrypt(r.firstname), decrypt(r.lastname)].filter(Boolean).join(' ') || decrypt(r.username);
          console.log(
            `  ${c('bold', nom.padEnd(30))}  date=${c('cyan', new Date(r.date).toISOString())}  ` +
            `isActive=${r.isActive ? c('green','true') : c('red','false')}  status=${c('yellow', r.status)}`
          );
        }
        console.log();
      }
      return;
    }

    console.log(sep());

    for (const row of rows) {
      const nom = [decrypt(row.firstname), decrypt(row.lastname)].filter(Boolean).join(' ') || decrypt(row.username) || row.userId;
      const entry   = decrypt(row.entryTime);
      const exit    = decrypt(row.exitTime);
      const active  = row.isActive;
      const hasBoth = !!entry && !!exit;
      const hasOnly = !!entry && !exit;

      // Calcul du prochain CTA attendu
      let cta, ctaColor;
      if (active) {
        cta = '→ CTA: "Pointer ma sortie"'; ctaColor = 'green';
      } else if (hasOnly) {
        cta = '→ CTA: "Pointer ma sortie" (session incomplète/inactive)'; ctaColor = 'yellow';
      } else if (hasBoth) {
        cta = '→ CTA: "Pointer mon retour"'; ctaColor = 'cyan';
      } else {
        cta = '→ CTA: "Pointer mon arrivée" (pas d\'entrée?)'; ctaColor = 'red';
      }

      console.log(
        `  ${c('bold', nom.padEnd(36))}  ` +
        `session n°${row.sessionNumber}  ` +
        `isActive=${active ? c('green','true ') : c('red','false')}  ` +
        `status=${c('yellow', (row.status||'').padEnd(10))}  ` +
        `source=${c('dim', row.pointedBy)}`
      );
      console.log(
        `  ${' '.repeat(36)}  ` +
        `entrée=${c('cyan', (entry||'—').padEnd(8))}  ` +
        `sortie=${c('cyan', (exit||'—').padEnd(8))}  ` +
        `durée=${row.duration != null ? row.duration+'min' : '—'}`
      );
      console.log(
        `  ${' '.repeat(36)}  ` +
        `date_db=${c('dim', new Date(row.date).toISOString())}  ` +
        c(ctaColor, cta)
      );
      console.log();
    }

    // Résumé
    const nbActive    = rows.filter(r => r.isActive).length;
    const nbIncomp    = rows.filter(r => !r.isActive && !r.exitTime && r.entryTime).length;
    const nbComplet   = rows.filter(r => !r.isActive && r.exitTime).length;
    const nbSansEntr  = rows.filter(r => !r.entryTime).length;

    console.log(sep());
    console.log(`  RÉSUMÉ:`);
    console.log(`  ${c('green',  `${nbActive} active(s)`)} → "Pointer ma sortie"`);
    console.log(`  ${c('yellow', `${nbIncomp} incomplète(s) sans sortie (isActive=false)`)} → devrait être réactivé`);
    console.log(`  ${c('cyan',   `${nbComplet} complète(s)`)} → "Pointer mon retour"`);
    if (nbSansEntr > 0) console.log(`  ${c('red', `${nbSansEntr} sans entryTime (!)`)} → problème de données`);
    console.log(sep('═'));
    console.log();

  } finally {
    await db.end();
  }
}

main().catch(err => {
  console.error('\n[ERREUR]', err.message || err);
  process.exit(1);
});
