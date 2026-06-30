/**
 * encrypt-import.js - Importer les donnees en local avec rechiffrement
 * Usage : node encrypt-import.js
 *
 * Variables requises :
 *   ENCRYPTION_KEY_DEV   : nouvelle cle AES-256 generee pour le local (64 chars hex)
 *   ENCRYPTION_KEY_PROD  : cle de prod (pour verifier qu'elle est differente)
 *   DATABASE_URL         : URL PostgreSQL locale (elitetime_dev)
 */

const { createCipheriv, randomBytes } = require('crypto');
const { Client } = require('pg');
const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

const ALGORITHM       = 'aes-256-gcm';
const IV_LENGTH       = 12;
const AUTH_TAG_LENGTH = 16;

const log = (msg) => console.log(msg);

// ── Verifications de securite AVANT toute operation ──────────────────────────

const rawDev  = process.env.ENCRYPTION_KEY_DEV;
const rawProd = process.env.ENCRYPTION_KEY_PROD;

if (!rawDev) {
  log('[ERREUR] ENCRYPTION_KEY_DEV absente.');
  log('Generer : node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  log('Puis : $env:ENCRYPTION_KEY_DEV = "la_cle_generee"');
  process.exit(1);
}

if (!rawProd) {
  log('[ERREUR] ENCRYPTION_KEY_PROD absente (necessaire pour la verification de securite).');
  process.exit(1);
}

if (rawDev === rawProd) {
  log('');
  log('[ERREUR CRITIQUE] ENCRYPTION_KEY_DEV identique a ENCRYPTION_KEY_PROD.');
  log('Operation annulee. Generer une nouvelle cle DEV :');
  log('node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  log('');
  process.exit(1);
}

if (rawDev.length !== 64) {
  log('[ERREUR] ENCRYPTION_KEY_DEV doit faire 64 chars. Actuelle : ' + rawDev.length);
  process.exit(1);
}

const keyDev = Buffer.from(rawDev, 'hex');
log('[OK] Cles verifiees — DEV != PROD.');

// ── Verifier que le fichier JSON existe ──────────────────────────────────────

const inputPath = path.resolve(process.cwd(), 'elitetime-data-plain.json');

if (!fs.existsSync(inputPath)) {
  log('[ERREUR] Fichier introuvable : ' + inputPath);
  log('Placer elitetime-data-plain.json dans le meme dossier que ce script.');
  process.exit(1);
}

log('[OK] Fichier elitetime-data-plain.json trouve.');

// ── Chiffrement AES-256-GCM ───────────────────────────────────────────────────
// Format identique a backend/src/lib/crypto.ts
// Nouveau IV aleatoire pour chaque valeur chiffree
function encrypt(value, key) {
  if (!value) return value;
  const iv      = randomBytes(IV_LENGTH);
  const cipher  = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format : [ IV (12) | AuthTag (16) | Ciphertext ] en base64
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

// ── Prompt confirmation ───────────────────────────────────────────────────────
function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => { rl.close(); resolve(answer.trim().toLowerCase()); });
  });
}

async function main() {
  // Connexion PostgreSQL locale
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    log('[ERREUR] DATABASE_URL absente.');
    process.exit(1);
  }

  const client = new Client({ connectionString: dbUrl });

  log('[INFO] Connexion a PostgreSQL local...');
  try {
    await client.connect();
  } catch (e) {
    log('[ERREUR] Connexion echouee : ' + e.message);
    log('Verifier que PostgreSQL est demarre et que DATABASE_URL est correcte.');
    process.exit(1);
  }
  log('[OK] Connecte a PostgreSQL local.');
  log('');

  // Lire le fichier JSON
  const data   = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const tables = data.tables;

  const report    = {};
  const startTime = Date.now();
  let totalErrors = 0;

  // ── User ──────────────────────────────────────────────────────────────────
  if (tables['User'] && tables['User'].length > 0) {
    log('[User] Import de ' + tables['User'].length + ' enregistrements...');
    let imported = 0, errors = 0;
    for (const row of tables['User']) {
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO "User" (id, email, username, firstname, lastname, department, position,
            role, avatar, status, "createdAt", "updatedAt", "teamLeadId", "hiddenFromLists",
            password, "isLocal", "includeInReports")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
           ON CONFLICT (id) DO UPDATE SET
             email=$2, username=$3, firstname=$4, lastname=$5, department=$6, position=$7,
             role=$8, avatar=$9, status=$10, "updatedAt"=$12, "teamLeadId"=$13,
             "hiddenFromLists"=$14, password=$15, "isLocal"=$16, "includeInReports"=$17`,
          [
            row.id,
            row.email      ? encrypt(row.email, keyDev)      : null,
            row.username   ? encrypt(row.username, keyDev)   : null,
            row.firstname  ? encrypt(row.firstname, keyDev)  : null,
            row.lastname   ? encrypt(row.lastname, keyDev)   : null,
            row.department ? encrypt(row.department, keyDev) : null,
            row.position   ? encrypt(row.position, keyDev)   : null,
            row.role, row.avatar, row.status,
            row.createdAt, row.updatedAt, row.teamLeadId,
            row.hiddenFromLists, row.password, row.isLocal, row.includeInReports,
          ]
        );
        await client.query('COMMIT');
        imported++;
      } catch (e) {
        await client.query('ROLLBACK');
        errors++; totalErrors++;
        log('[User] ERREUR id=' + row.id + ' : ' + e.message);
      }
    }
    report['User'] = { imported, errors };
    log('[User] ' + imported + ' importes, ' + errors + ' erreurs.');
  }

  // ── HiddenUsername ────────────────────────────────────────────────────────
  if (tables['HiddenUsername'] && tables['HiddenUsername'].length > 0) {
    log('[HiddenUsername] Import de ' + tables['HiddenUsername'].length + ' enregistrements...');
    let imported = 0, errors = 0;
    for (const row of tables['HiddenUsername']) {
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO "HiddenUsername" (id, username, hidden, "userId", "createdAt", "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (id) DO UPDATE SET username=$2, hidden=$3, "userId"=$4, "updatedAt"=$6`,
          [row.id, row.username ? encrypt(row.username, keyDev) : null, row.hidden, row.userId, row.createdAt, row.updatedAt]
        );
        await client.query('COMMIT');
        imported++;
      } catch (e) {
        await client.query('ROLLBACK');
        errors++; totalErrors++;
        log('[HiddenUsername] ERREUR id=' + row.id + ' : ' + e.message);
      }
    }
    report['HiddenUsername'] = { imported, errors };
    log('[HiddenUsername] ' + imported + ' importes, ' + errors + ' erreurs.');
  }

  // ── Pointage ──────────────────────────────────────────────────────────────
  if (tables['Pointage'] && tables['Pointage'].length > 0) {
    log('[Pointage] Import de ' + tables['Pointage'].length + ' enregistrements...');
    let imported = 0, errors = 0;
    for (const row of tables['Pointage']) {
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO "Pointage" (id, "userId", date, "entryTime", "exitTime", duration, status,
             "isActive", "createdAt", "updatedAt", "lateReason", source, "sessionNumber",
             "earlyExitReason", "pointedBy")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT (id) DO UPDATE SET
             "entryTime"=$4, "exitTime"=$5, duration=$6, status=$7, "isActive"=$8,
             "updatedAt"=$10, "lateReason"=$11, source=$12, "earlyExitReason"=$14`,
          [
            row.id, row.userId, row.date,
            row.entryTime       ? encrypt(row.entryTime, keyDev)       : null,
            row.exitTime        ? encrypt(row.exitTime, keyDev)        : null,
            row.duration, row.status, row.isActive,
            row.createdAt, row.updatedAt,
            row.lateReason      ? encrypt(row.lateReason, keyDev)      : null,
            row.source, row.sessionNumber,
            row.earlyExitReason ? encrypt(row.earlyExitReason, keyDev) : null,
            row.pointedBy,
          ]
        );
        await client.query('COMMIT');
        imported++;
      } catch (e) {
        await client.query('ROLLBACK');
        errors++; totalErrors++;
        log('[Pointage] ERREUR id=' + row.id + ' : ' + e.message);
      }
    }
    report['Pointage'] = { imported, errors };
    log('[Pointage] ' + imported + ' importes, ' + errors + ' erreurs.');
  }

  // ── Break ─────────────────────────────────────────────────────────────────
  if (tables['Break'] && tables['Break'].length > 0) {
    log('[Break] Import de ' + tables['Break'].length + ' enregistrements...');
    let imported = 0, errors = 0;
    for (const row of tables['Break']) {
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO "Break" (id, "userId", date, "startTime", "endTime", duration, "createdAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (id) DO UPDATE SET "startTime"=$4, "endTime"=$5, duration=$6`,
          [
            row.id, row.userId, row.date,
            row.startTime ? encrypt(row.startTime, keyDev) : null,
            row.endTime   ? encrypt(row.endTime, keyDev)   : null,
            row.duration, row.createdAt,
          ]
        );
        await client.query('COMMIT');
        imported++;
      } catch (e) {
        await client.query('ROLLBACK');
        errors++; totalErrors++;
        log('[Break] ERREUR id=' + row.id + ' : ' + e.message);
      }
    }
    report['Break'] = { imported, errors };
    log('[Break] ' + imported + ' importes, ' + errors + ' erreurs.');
  }

  // ── Absence ───────────────────────────────────────────────────────────────
  if (tables['Absence'] && tables['Absence'].length > 0) {
    log('[Absence] Import de ' + tables['Absence'].length + ' enregistrements...');
    let imported = 0, errors = 0;
    for (const row of tables['Absence']) {
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO "Absence" (id, "userId", type, "startDate", "endDate", reason, status, comment, "createdAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (id) DO UPDATE SET reason=$6, status=$7, comment=$8`,
          [
            row.id, row.userId, row.type, row.startDate, row.endDate,
            row.reason  ? encrypt(row.reason, keyDev)  : null,
            row.status,
            row.comment ? encrypt(row.comment, keyDev) : null,
            row.createdAt,
          ]
        );
        await client.query('COMMIT');
        imported++;
      } catch (e) {
        await client.query('ROLLBACK');
        errors++; totalErrors++;
        log('[Absence] ERREUR id=' + row.id + ' : ' + e.message);
      }
    }
    report['Absence'] = { imported, errors };
    log('[Absence] ' + imported + ' importes, ' + errors + ' erreurs.');
  }

  // ── CorrectionRequest ─────────────────────────────────────────────────────
  if (tables['CorrectionRequest'] && tables['CorrectionRequest'].length > 0) {
    log('[CorrectionRequest] Import de ' + tables['CorrectionRequest'].length + ' enregistrements...');
    let imported = 0, errors = 0;
    for (const row of tables['CorrectionRequest']) {
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO "CorrectionRequest" (id, "userId", "pointageId", "requestDate",
             "originalEntry", "originalExit", "newEntry", "newExit", reason, status, "createdAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (id) DO UPDATE SET
             "originalEntry"=$5, "originalExit"=$6, "newEntry"=$7, "newExit"=$8, reason=$9, status=$10`,
          [
            row.id, row.userId, row.pointageId, row.requestDate,
            row.originalEntry ? encrypt(row.originalEntry, keyDev) : null,
            row.originalExit  ? encrypt(row.originalExit, keyDev)  : null,
            row.newEntry      ? encrypt(row.newEntry, keyDev)      : null,
            row.newExit       ? encrypt(row.newExit, keyDev)       : null,
            row.reason        ? encrypt(row.reason, keyDev)        : null,
            row.status, row.createdAt,
          ]
        );
        await client.query('COMMIT');
        imported++;
      } catch (e) {
        await client.query('ROLLBACK');
        errors++; totalErrors++;
        log('[CorrectionRequest] ERREUR id=' + row.id + ' : ' + e.message);
      }
    }
    report['CorrectionRequest'] = { imported, errors };
    log('[CorrectionRequest] ' + imported + ' importes, ' + errors + ' erreurs.');
  }

  // ── ActivityLog ───────────────────────────────────────────────────────────
  if (tables['ActivityLog'] && tables['ActivityLog'].length > 0) {
    log('[ActivityLog] Import de ' + tables['ActivityLog'].length + ' enregistrements...');
    let imported = 0, errors = 0;
    for (const row of tables['ActivityLog']) {
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO "ActivityLog" (id, "userId", action, details, timestamp, type)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (id) DO UPDATE SET action=$3, details=$4`,
          [
            row.id, row.userId,
            row.action  ? encrypt(row.action, keyDev)  : null,
            row.details ? encrypt(row.details, keyDev) : null,
            row.timestamp, row.type,
          ]
        );
        await client.query('COMMIT');
        imported++;
      } catch (e) {
        await client.query('ROLLBACK');
        errors++; totalErrors++;
        log('[ActivityLog] ERREUR id=' + row.id + ' : ' + e.message);
      }
    }
    report['ActivityLog'] = { imported, errors };
    log('[ActivityLog] ' + imported + ' importes, ' + errors + ' erreurs.');
  }

  // ── Session ───────────────────────────────────────────────────────────────
  if (tables['Session'] && tables['Session'].length > 0) {
    log('[Session] Import de ' + tables['Session'].length + ' enregistrements...');
    let imported = 0, errors = 0;
    for (const row of tables['Session']) {
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO "Session" (id, "userId", "sessionToken", "ipAddress", "userAgent", "expiresAt", "createdAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (id) DO UPDATE SET "sessionToken"=$3, "ipAddress"=$4, "userAgent"=$5`,
          [
            row.id, row.userId,
            row.sessionToken ? encrypt(row.sessionToken, keyDev) : null,
            row.ipAddress    ? encrypt(row.ipAddress, keyDev)    : null,
            row.userAgent    ? encrypt(row.userAgent, keyDev)    : null,
            row.expiresAt, row.createdAt,
          ]
        );
        await client.query('COMMIT');
        imported++;
      } catch (e) {
        await client.query('ROLLBACK');
        errors++; totalErrors++;
        log('[Session] ERREUR id=' + row.id + ' : ' + e.message);
      }
    }
    report['Session'] = { imported, errors };
    log('[Session] ' + imported + ' importes, ' + errors + ' erreurs.');
  }

  // ── ScheduledEmailJobRecipient ────────────────────────────────────────────
  if (tables['ScheduledEmailJobRecipient'] && tables['ScheduledEmailJobRecipient'].length > 0) {
    log('[ScheduledEmailJobRecipient] Import...');
    let imported = 0, errors = 0;
    for (const row of tables['ScheduledEmailJobRecipient']) {
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO "ScheduledEmailJobRecipient" (id, "jobId", "userId", email)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (id) DO UPDATE SET email=$4`,
          [row.id, row.jobId, row.userId, row.email ? encrypt(row.email, keyDev) : null]
        );
        await client.query('COMMIT');
        imported++;
      } catch (e) {
        await client.query('ROLLBACK');
        errors++; totalErrors++;
        log('[ScheduledEmailJobRecipient] ERREUR id=' + row.id + ' : ' + e.message);
      }
    }
    report['ScheduledEmailJobRecipient'] = { imported, errors };
    log('[ScheduledEmailJobRecipient] ' + imported + ' importes, ' + errors + ' erreurs.');
  }

  await client.end();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  log('');
  log('=== RAPPORT IMPORT ===');
  Object.entries(report).forEach(([table, r]) => {
    log('  ' + table + ' : ' + r.imported + ' importes, ' + r.errors + ' erreurs');
  });
  log('Duree : ' + elapsed + 's | Erreurs totales : ' + totalErrors);
  log('');
  log('Import termine avec succes.');
  log('');

  // Proposer de supprimer le fichier en clair
  const answer = await ask('Supprimer elitetime-data-plain.json maintenant ? (recommande) [o/N] : ');
  if (answer === 'o' || answer === 'oui' || answer === 'y') {
    fs.unlinkSync(inputPath);
    log('[OK] elitetime-data-plain.json supprime.');
  } else {
    log('[ATTENTION] Fichier conserve. Pensez a le supprimer manuellement.');
  }
}

main().catch(e => {
  console.log('[FATAL] ' + e.message);
  process.exit(1);
});
