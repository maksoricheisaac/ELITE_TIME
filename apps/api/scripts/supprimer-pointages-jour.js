'use strict';

/**
 * Suppression de tous les pointages d'une journée — EliteTime
 *
 * Usage :
 *   node backend/scripts/supprimer-pointages-jour.js --date 2026-05-14
 *   node backend/scripts/supprimer-pointages-jour.js --date 2026-05-14 --supprimer
 *
 * Sans --supprimer : affiche seulement ce qui serait supprimé (mode preview).
 * Avec --supprimer : supprime définitivement les pointages ET les pauses associées.
 */

const path = require('path');
const fs   = require('fs');
const { createDecipheriv } = require('crypto');
const { Client, types: pgTypes } = require('pg');

// Même comportement que le rapport — TIMESTAMP interprété en UTC
pgTypes.setTypeParser(1114, (val) => new Date(val.replace(' ', 'T') + 'Z'));

// ─── .env ─────────────────────────────────────────────────────────────────────
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

// ─── Crypto ───────────────────────────────────────────────────────────────────
const IV_LEN = 12, TAG_LEN = 16;
function decrypt(value) {
  if (!value) return null;
  const key = process.env.ENCRYPTION_KEY;
  if (!key) return '(clé manquante)';
  try {
    const buf = Buffer.from(value, 'base64');
    if (buf.length < IV_LEN + TAG_LEN + 1) return value;
    const iv  = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ct  = buf.subarray(IV_LEN + TAG_LEN);
    const d   = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
  } catch { return '(déchiffrement échoué)'; }
}

// ─── Console ──────────────────────────────────────────────────────────────────
const C = {
  reset:'\x1b[0m', bold:'\x1b[1m', dim:'\x1b[2m',
  red:'\x1b[31m', green:'\x1b[32m', yellow:'\x1b[33m', cyan:'\x1b[36m',
};
const c = (col, t) => `${C[col]}${t}${C.reset}`;

// ─── Args ─────────────────────────────────────────────────────────────────────
const args       = process.argv.slice(2);
const dateIdx    = args.indexOf('--date');
const targetDate = dateIdx !== -1 && args[dateIdx + 1] ? args[dateIdx + 1] : '2026-05-14';
const DRY_RUN    = !args.includes('--supprimer');

if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
  console.error(c('red', `[ERREUR] Format de date invalide : "${targetDate}". Attendu : YYYY-MM-DD`));
  process.exit(1);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error(c('red', '[ERREUR] DATABASE_URL manquant dans .env'));
    process.exit(1);
  }

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  await db.query("SET timezone = 'UTC'");

  const fromTs = new Date(targetDate + 'T00:00:00');
  fromTs.setHours(0, 0, 0, 0);
  const toTs = new Date(targetDate + 'T00:00:00');
  toTs.setHours(23, 59, 59, 999);

  console.log();
  console.log(c('bold', '═'.repeat(80)));
  console.log(c('bold', c('cyan', `  SUPPRESSION POINTAGES — ${targetDate}`)));
  if (DRY_RUN) {
    console.log(c('yellow', '  ⚠  MODE PREVIEW — aucune suppression ne sera effectuée'));
    console.log(c('dim',    '  Pour supprimer : node backend/scripts/supprimer-pointages-jour.js --date ' + targetDate + ' --supprimer'));
  } else {
    console.log(c('red', '  ⚠⚠  MODE SUPPRESSION RÉELLE — opération irréversible ⚠⚠'));
  }
  console.log(c('bold', '═'.repeat(80)));
  console.log();

  try {
    // ── Récupérer les pointages du jour ────────────────────────────────────────
    const { rows: pointages } = await db.query(`
      SELECT
        p.id, p."userId", p.date, p."entryTime", p."exitTime",
        p.status, p."isActive", p."sessionNumber", p.source, p.duration,
        u.firstname, u.lastname, u.username
      FROM "Pointage" p
      JOIN "User" u ON u.id = p."userId"
      WHERE p.date >= $1 AND p.date <= $2
      ORDER BY u.lastname ASC, u.firstname ASC, p."sessionNumber" ASC
    `, [fromTs, toTs]);

    // ── Récupérer les pauses du jour ───────────────────────────────────────────
    const { rows: breaks } = await db.query(`
      SELECT b.id, b."userId", b.date, b."startTime", b."endTime", b.duration
      FROM "Break" b
      WHERE b.date >= $1 AND b.date <= $2
    `, [fromTs, toTs]);

    const pointageIds = pointages.map(p => p.id);
    const breakIds    = breaks.map(b => b.id);

    console.log(`  Date ciblée    : ${c('cyan', targetDate)}`);
    console.log(`  Plage UTC      : ${c('dim', fromTs.toISOString())} → ${c('dim', toTs.toISOString())}`);
    console.log(`  Pointages      : ${c('bold', pointages.length)}`);
    console.log(`  Pauses liées   : ${c('bold', breaks.length)}`);
    console.log();

    if (pointages.length === 0) {
      console.log(c('yellow', '  Aucun pointage trouvé pour cette date. Rien à supprimer.'));
      console.log();
      return;
    }

    // ── Affichage du détail ────────────────────────────────────────────────────
    console.log(c('bold', '  Pointages concernés :'));
    console.log(c('dim', '  ' + '─'.repeat(78)));

    for (const p of pointages) {
      const nom     = [decrypt(p.firstname), decrypt(p.lastname)].filter(Boolean).join(' ') || decrypt(p.username) || p.userId;
      const entry   = decrypt(p.entryTime)  || '—';
      const exit    = decrypt(p.exitTime)   || '—';
      const statCol = p.status === 'incomplete' ? 'yellow' : p.isActive ? 'green' : 'cyan';
      console.log(
        `  ${c('bold', nom.padEnd(36))}  S${p.sessionNumber}  ` +
        `${c('dim', `${entry} → ${exit}`).padEnd(28)}  ` +
        `${c(statCol, (p.status || '').padEnd(12))}  ` +
        `${c('dim', p.source || '')}`
      );
    }

    if (breaks.length > 0) {
      console.log();
      console.log(c('bold', `  Pauses concernées (${breaks.length}) :`));
      console.log(c('dim', '  ' + '─'.repeat(78)));
      for (const b of breaks) {
        console.log(`  ${c('dim', `ID: ${b.id}  userId: ${b.userId}  durée: ${b.duration ?? '?'} min`)}`);
      }
    }

    console.log();
    console.log(c('dim', '  ' + '─'.repeat(78)));
    console.log(`  Total à supprimer : ${c('red', `${pointageIds.length} pointage(s)`)} + ${c('red', `${breakIds.length} pause(s)`)}`);
    console.log();

    if (DRY_RUN) {
      console.log(c('yellow', '  [PREVIEW] Aucune modification effectuée.'));
      console.log(c('dim',    `  Relancez avec --supprimer pour confirmer la suppression.`));
      console.log();
      return;
    }

    // ── Suppression dans une transaction ──────────────────────────────────────
    await db.query('BEGIN');
    try {
      let deletedBreaks = 0;
      if (breakIds.length > 0) {
        const bkPh = breakIds.map((_, i) => `$${i + 1}`).join(', ');
        const { rowCount } = await db.query(
          `DELETE FROM "Break" WHERE id IN (${bkPh})`,
          breakIds
        );
        deletedBreaks = rowCount ?? 0;
      }

      const ptPh = pointageIds.map((_, i) => `$${i + 1}`).join(', ');
      const { rowCount } = await db.query(
        `DELETE FROM "Pointage" WHERE id IN (${ptPh})`,
        pointageIds
      );
      const deletedPt = rowCount ?? 0;

      await db.query('COMMIT');

      console.log(c('green', `  ✔  ${deletedPt} pointage(s) supprimé(s)`));
      if (deletedBreaks > 0) console.log(c('green', `  ✔  ${deletedBreaks} pause(s) supprimée(s)`));
      console.log();
      console.log(c('bold', '  Suppression terminée.'));
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }

  } finally {
    await db.end();
    console.log();
    console.log(c('bold', '═'.repeat(80)));
    console.log();
  }
}

main().catch(err => {
  console.error('\n' + c('red', '[ERREUR FATALE]'), err.message || err);
  process.exit(1);
});
