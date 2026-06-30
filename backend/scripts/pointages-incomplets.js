#!/usr/bin/env node
/**
 * Audit des pointages incomplets — EliteTime
 *
 * Usage :
 *   node backend/scripts/pointages-incomplets.js
 *   node backend/scripts/pointages-incomplets.js --json
 *   node backend/scripts/pointages-incomplets.js --depuis 2026-01-01 --jusqua 2026-05-31
 *   node backend/scripts/pointages-incomplets.js --employe <userId>
 *
 * Options :
 *   --json               Sortie brute en JSON (déchiffré)
 *   --depuis YYYY-MM-DD  Filtrer depuis cette date
 *   --jusqua YYYY-MM-DD  Filtrer jusqu'à cette date
 *   --employe <id>       Filtrer sur un seul employé (userId)
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

// ─── Crypto AES-256-GCM (identique à src/lib/crypto.ts) ─────────────────────
const IV_LENGTH       = 12;
const AUTH_TAG_LENGTH = 16;

function decrypt(value) {
  if (!value) return value;
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) return '[ENCRYPTION_KEY manquante]';
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
    return value; // valeur non chiffrée ou clé incorrecte
  }
}

// ─── Parsing des arguments CLI ───────────────────────────────────────────────
const args   = process.argv.slice(2);
const asJson = args.includes('--json');
const idxD   = args.indexOf('--depuis');
const idxJ   = args.indexOf('--jusqua');
const idxE   = args.indexOf('--employe');
const depuis  = idxD !== -1 ? args[idxD + 1] : null;
const jusqua  = idxJ !== -1 ? args[idxJ + 1] : null;
const employe = idxE !== -1 ? args[idxE + 1] : null;

// ─── Couleurs ANSI ───────────────────────────────────────────────────────────
const USE_COLOR = process.stdout.isTTY !== false && !asJson;
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m',
  green: '\x1b[32m', magenta: '\x1b[35m', white: '\x1b[37m',
  bgRed: '\x1b[41m',
};
const c = (color, text) => USE_COLOR ? `${C[color]}${text}${C.reset}` : text;

// ─── Formatage ───────────────────────────────────────────────────────────────
const fmt = {
  date: d => d
    ? new Date(d).toLocaleDateString('fr-FR', { weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit' })
    : '—',
  datetime: d => d ? new Date(d).toLocaleString('fr-FR') : '—',
  duration: min => {
    if (min == null) return '—';
    const h = Math.floor(min / 60), m = min % 60;
    return `${h}h${String(m).padStart(2, '0')}`;
  },
  val: v => (v == null || v === '') ? c('dim', '—') : String(v),
};

function sep(char = '─', len = 110) { return c('dim', char.repeat(len)); }

// ─── Requête SQL ─────────────────────────────────────────────────────────────
async function fetchPointagesIncomplets(db) {
  const conditions = [`p.status = 'incomplete'`];
  const params     = [];
  let   pidx       = 1;

  if (depuis) {
    conditions.push(`p.date >= $${pidx++}`);
    params.push(new Date(depuis));
  }
  if (jusqua) {
    const fin = new Date(jusqua);
    fin.setHours(23, 59, 59, 999);
    conditions.push(`p.date <= $${pidx++}`);
    params.push(fin);
  }
  if (employe) {
    conditions.push(`p."userId" = $${pidx++}`);
    params.push(employe);
  }

  const sql = `
    SELECT
      -- Pointage
      p.id                  AS p_id,
      p."userId"            AS p_user_id,
      p.date                AS p_date,
      p."entryTime"         AS p_entry_time,
      p."exitTime"          AS p_exit_time,
      p.duration            AS p_duration,
      p.status              AS p_status,
      p."isActive"          AS p_is_active,
      p."sessionNumber"     AS p_session_number,
      p.source              AS p_source,
      p."pointedBy"         AS p_pointed_by,
      p."lateReason"        AS p_late_reason,
      p."earlyExitReason"   AS p_early_exit_reason,
      p."createdAt"         AS p_created_at,
      p."updatedAt"         AS p_updated_at,

      -- Utilisateur
      u.id                  AS u_id,
      u.email               AS u_email,
      u.username            AS u_username,
      u.firstname           AS u_firstname,
      u.lastname            AS u_lastname,
      u.department          AS u_department,
      u.position            AS u_position,
      u.role                AS u_role,
      u.status              AS u_status,
      u."teamLeadId"        AS u_team_lead_id,
      u."createdAt"         AS u_created_at,
      u."hiddenFromLists"   AS u_hidden,
      u."includeInReports"  AS u_include_reports

    FROM "Pointage" p
    JOIN "User"     u ON u.id = p."userId"
    WHERE ${conditions.join(' AND ')}
    ORDER BY p.date DESC, u.lastname ASC, p."sessionNumber" ASC
  `;

  const { rows } = await db.query(sql, params);
  return rows;
}

async function fetchCorrections(db, pointageIds) {
  if (!pointageIds.length) return [];
  const placeholders = pointageIds.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `
    SELECT
      cr.id, cr."userId", cr."pointageId", cr."requestDate",
      cr."originalEntry", cr."originalExit",
      cr."newEntry", cr."newExit",
      cr.reason, cr.status, cr."createdAt"
    FROM "CorrectionRequest" cr
    WHERE cr."pointageId" IN (${placeholders})
    ORDER BY cr."createdAt" ASC
  `;
  const { rows } = await db.query(sql, pointageIds);
  return rows;
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
    const rows = await fetchPointagesIncomplets(db);

    // ── Déchiffrement de chaque ligne ────────────────────────────────────────
    const pointages = rows.map(r => ({
      id:             r.p_id,
      userId:         r.p_user_id,
      date:           r.p_date,
      entryTime:      decrypt(r.p_entry_time),
      exitTime:       decrypt(r.p_exit_time),
      duration:       r.p_duration,
      status:         r.p_status,
      isActive:       r.p_is_active,
      sessionNumber:  r.p_session_number,
      source:         r.p_source,
      pointedBy:      r.p_pointed_by,
      lateReason:     decrypt(r.p_late_reason),
      earlyExitReason: decrypt(r.p_early_exit_reason),
      createdAt:      r.p_created_at,
      updatedAt:      r.p_updated_at,
      user: {
        id:             r.u_id,
        email:          decrypt(r.u_email),
        username:       decrypt(r.u_username),
        firstname:      decrypt(r.u_firstname),
        lastname:       decrypt(r.u_lastname),
        department:     decrypt(r.u_department),
        position:       decrypt(r.u_position),
        role:           r.u_role,
        status:         r.u_status,
        teamLeadId:     r.u_team_lead_id,
        createdAt:      r.u_created_at,
        hiddenFromLists: r.u_hidden,
        includeInReports: r.u_include_reports,
      },
    }));

    // Récupérer les corrections
    const corrRaw = await fetchCorrections(db, pointages.map(p => p.id));
    const corrByPointage = {};
    for (const cr of corrRaw) {
      if (!corrByPointage[cr.pointageid]) corrByPointage[cr.pointageid] = [];
      corrByPointage[cr.pointageid].push({
        id:            cr.id,
        userId:        cr.userid,
        pointageId:    cr.pointageid,
        requestDate:   cr.requestdate,
        originalEntry: decrypt(cr.originalentry),
        originalExit:  decrypt(cr.originalexit),
        newEntry:      decrypt(cr.newentry),
        newExit:       decrypt(cr.newexit),
        reason:        decrypt(cr.reason),
        status:        cr.status,
        createdAt:     cr.createdat,
      });
    }

    for (const p of pointages) {
      p.correctionRequests = corrByPointage[p.id] || [];
    }

    // ── Sortie JSON ──────────────────────────────────────────────────────────
    if (asJson) {
      console.log(JSON.stringify(pointages, null, 2));
      return;
    }

    // ── En-tête ──────────────────────────────────────────────────────────────
    console.log();
    console.log(sep('═'));
    console.log(
      c('bold', c('red', '  ● RAPPORT — POINTAGES INCOMPLETS ')) +
      c('dim', `   généré le ${new Date().toLocaleString('fr-FR')}`)
    );
    console.log(sep('═'));

    const filtres = [];
    if (depuis)  filtres.push(`depuis ${depuis}`);
    if (jusqua)  filtres.push(`jusqu'au ${jusqua}`);
    if (employe) filtres.push(`employé ${employe}`);
    if (filtres.length) console.log(c('dim', `  Filtres : ${filtres.join(' | ')}`));
    console.log();

    if (pointages.length === 0) {
      console.log(c('green', '  ✔  Aucun pointage incomplet trouvé.'));
      console.log();
      return;
    }

    console.log(c('yellow', `  ⚠  ${pointages.length} pointage(s) incomplet(s) trouvé(s)`));
    console.log();

    // ── Statistiques ─────────────────────────────────────────────────────────
    const byUser  = {};
    const byMonth = {};
    const activeCount = pointages.filter(p => p.isActive).length;

    for (const p of pointages) {
      byUser[p.userId] = (byUser[p.userId] || 0) + 1;
      const mkey = new Date(p.date).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' });
      byMonth[mkey] = (byMonth[mkey] || 0) + 1;
    }

    console.log(c('bold', '  STATISTIQUES GLOBALES'));
    console.log(sep());
    console.log(`  Total pointages incomplets  : ${c('yellow', pointages.length)}`);
    console.log(`  Employés concernés           : ${c('yellow', Object.keys(byUser).length)}`);
    console.log(`  Sessions encore actives      : ${c('red', activeCount)} ${activeCount > 0 ? c('dim','(session non fermée en base)') : ''}`);
    console.log(`  Avec demande de correction   : ${c('cyan', pointages.filter(p => p.correctionRequests.length > 0).length)}`);
    console.log();
    console.log(c('bold', '  Répartition par mois :'));
    for (const [mois, nb] of Object.entries(byMonth).sort()) {
      const bar = '█'.repeat(Math.min(nb, 40));
      console.log(`    ${mois.padEnd(22)} ${c('yellow', String(nb).padStart(4))}  ${c('dim', bar)}`);
    }
    console.log();

    // ── Détail par pointage ──────────────────────────────────────────────────
    console.log(c('bold', '  DÉTAIL COMPLET DES POINTAGES'));
    console.log(sep('═'));

    for (let i = 0; i < pointages.length; i++) {
      const p = pointages[i];
      const u = p.user;
      const nom = [u.firstname, u.lastname].filter(Boolean).join(' ') || u.username || u.id;
      const idx = c('dim', `[${String(i + 1).padStart(3, '0')}]`);

      console.log();
      console.log(
        `${idx}  ${c('bold', c('bgRed', c('white', ' INCOMPLET ')))}  ` +
        `${c('bold', c('cyan', nom))}  ` +
        c('dim', `(${u.role}) — ${fmt.date(p.date)}`)
      );
      console.log(sep());

      // Employé
      console.log(c('bold', '  EMPLOYÉ'));
      console.log(`    ID              : ${c('dim', u.id)}`);
      console.log(`    Nom complet     : ${fmt.val(nom)}`);
      console.log(`    Email           : ${fmt.val(u.email)}`);
      console.log(`    Username        : ${fmt.val(u.username)}`);
      console.log(`    Rôle            : ${c('magenta', u.role)}`);
      console.log(`    Département     : ${fmt.val(u.department)}`);
      console.log(`    Poste           : ${fmt.val(u.position)}`);
      console.log(`    Statut compte   : ${u.status === 'active' ? c('green', 'actif') : c('red', u.status)}`);
      console.log(`    Caché des listes: ${u.hiddenFromLists ? c('yellow','oui') : 'non'}`);
      console.log(`    Inclus rapports : ${u.includeInReports ? 'oui' : c('dim','non')}`);
      console.log(`    Team Lead ID    : ${fmt.val(u.teamLeadId)}`);

      // Pointage
      console.log();
      console.log(c('bold', '  POINTAGE'));
      console.log(`    ID              : ${c('dim', p.id)}`);
      console.log(`    Date            : ${c('yellow', fmt.date(p.date))}`);
      console.log(`    Session n°      : ${p.sessionNumber}`);
      console.log(`    Statut          : ${c('bgRed', c('white', ` ${(p.status || '').toUpperCase()} `))}`);
      console.log(`    Heure entrée    : ${p.entryTime  ? c('green', p.entryTime)  : c('red', '— MANQUANT')}`);
      console.log(`    Heure sortie    : ${p.exitTime   ? c('yellow', p.exitTime)  : c('red', '— MANQUANT ◄')}`);
      console.log(`    Durée enreg.    : ${p.duration != null ? fmt.duration(p.duration) : c('dim','—')}`);
      console.log(`    Session active  : ${p.isActive ? c('red', 'OUI — session non fermée en BDD') : c('dim','non')}`);
      console.log(`    Source          : ${p.source}`);
      console.log(`    Pointé par      : ${p.pointedBy}`);
      if (p.lateReason)      console.log(`    Raison retard   : ${c('yellow', p.lateReason)}`);
      if (p.earlyExitReason) console.log(`    Raison sortie   : ${c('yellow', p.earlyExitReason)}`);
      console.log(`    Créé le         : ${fmt.datetime(p.createdAt)}`);
      console.log(`    Mis à jour le   : ${fmt.datetime(p.updatedAt)}`);

      // Corrections
      const corrections = p.correctionRequests;
      if (corrections.length > 0) {
        console.log();
        console.log(c('bold', `  DEMANDES DE CORRECTION (${corrections.length})`));
        for (const cr of corrections) {
          const statColor = cr.status === 'approved' ? 'green' : cr.status === 'rejected' ? 'red' : 'yellow';
          console.log(`    ┌─ ID correction : ${c('dim', cr.id)}`);
          console.log(`    │  Statut        : ${c(statColor, cr.status.toUpperCase())}`);
          console.log(`    │  Demandée le   : ${fmt.datetime(cr.requestDate)}`);
          console.log(`    │  Original      : entrée ${fmt.val(cr.originalEntry)}  sortie ${fmt.val(cr.originalExit)}`);
          console.log(`    │  Demandé       : entrée ${fmt.val(cr.newEntry)}  sortie ${fmt.val(cr.newExit)}`);
          console.log(`    └─ Raison        : ${fmt.val(cr.reason)}`);
        }
      }

      console.log(sep('─'));
    }

    // ── Tableau de synthèse par employé ──────────────────────────────────────
    console.log();
    console.log(c('bold', '  SYNTHÈSE PAR EMPLOYÉ'));
    console.log(sep('═'));

    const summaryMap = {};
    for (const p of pointages) {
      if (!summaryMap[p.userId]) {
        summaryMap[p.userId] = {
          nom:        [p.user.firstname, p.user.lastname].filter(Boolean).join(' ') || p.user.username,
          email:      p.user.email,
          role:       p.user.role,
          department: p.user.department,
          count:      0,
          dates:      [],
          hasActive:  false,
        };
      }
      summaryMap[p.userId].count++;
      summaryMap[p.userId].dates.push(new Date(p.date));
      if (p.isActive) summaryMap[p.userId].hasActive = true;
    }

    const summary = Object.values(summaryMap).sort((a, b) => b.count - a.count);
    const wNom  = Math.max(...summary.map(r => (r.nom || '').length), 15);
    const wDep  = Math.max(...summary.map(r => (r.department || '').length), 14);

    const header =
      `  ${'Employé'.padEnd(wNom)}  ${'Rôle'.padEnd(10)}  ${'Département'.padEnd(wDep)}  ${'Total'.padEnd(7)}  Dernière date`;
    console.log(c('bold', header));
    console.log(sep());

    for (const r of summary) {
      const lastDate = r.dates.sort((a, b) => b - a)[0];
      const active   = r.hasActive ? c('red', ' ⬤') : '';
      console.log(
        `  ${(r.nom || '—').padEnd(wNom)}  ` +
        `${(r.role || '').padEnd(10)}  ` +
        `${(r.department || '—').padEnd(wDep)}  ` +
        `${c('yellow', String(r.count).padEnd(7))}  ` +
        `${fmt.date(lastDate)}${active}`
      );
    }

    console.log();
    console.log(sep('═'));
    console.log(c('dim',
      `  Fin du rapport — ${pointages.length} pointage(s) incomplet(s) | ${summary.length} employé(s) concerné(s)`
    ));
    if (activeCount > 0) {
      console.log(c('red', `  ⬤ = session encore active en BDD (isActive = true)`));
    }
    console.log(sep('═'));
    console.log();

  } finally {
    await db.end();
  }
}

main().catch(err => {
  console.error('\n' + c('red', '[ERREUR]'), err.message || err);
  if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
    console.error(c('dim', '  → Impossible de se connecter à PostgreSQL. Vérifiez DATABASE_URL et la connectivité réseau.'));
  }
  process.exit(1);
});
