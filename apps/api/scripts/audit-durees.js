/**
 * AUDIT EN LECTURE SEULE des durées et statuts de pointage déjà stockés.
 *
 *   node scripts/audit-durees.js [--from AAAA-MM-JJ] [--to AAAA-MM-JJ] [--csv chemin.csv] [--limit 20]
 *
 * Pour chaque employé et chaque jour (fuseau métier), recalcule avec le moteur `@elitetime/time` :
 *   - la durée nette attendue de chaque session (sessions valides − pauses incluses),
 *   - le statut attendu (late / normal) de la première session,
 * puis compare avec ce qui est stocké (Pointage.duration / Pointage.status).
 *
 * GARANTIES : n'exécute que des SELECT. Aucune écriture, aucune migration, aucune suppression. Peut donc être
 * lancé sur une copie de la production. Il n'y a volontairement PAS d'option « corriger » : une correction de
 * l'historique doit être décidée après lecture de ce rapport (voir docs/calculs-temporels.md, § Migration).
 *
 * Catégories d'écarts :
 *   LEGACY_FLAT_BREAK   stocké = brut − forfait de pause (ancienne règle), alors que le moteur déduit les pauses enregistrées
 *   STALE_DURATION      durée stockée différente sans explication connue (donnée modifiée à la main, pause ajoutée après coup…)
 *   NEGATIVE_OR_INVALID durée négative, sortie ≤ entrée, heure illisible
 *   OPEN_WITH_DURATION  session sans sortie mais durée > 0
 *   STATUS_MISMATCH     statut late/normal différent de la règle (première entrée vs heure de début, jour ouvré)
 *   MULTI_SESSION_FLAT  jour à plusieurs sessions : le forfait de pause a été déduit plusieurs fois (ancien end())
 */
const path = require('path');
const fs = require('fs');
const profileFiles = (process.env.ELITETIME_ENV_FILE ?? '')
  .split(',')
  .map((f) => f.trim())
  .filter(Boolean);
if (profileFiles.length) require('dotenv').config({ path: profileFiles, quiet: true });
require('dotenv').config({ quiet: true });

const { Client } = require('pg');
const { decrypt } = require('@elitetime/shared');
const T = require('@elitetime/time');

const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const TZ = process.env.BUSINESS_TIMEZONE || T.BUSINESS_TIME_ZONE;
const from = arg('--from', null);
const to = arg('--to', null);
const csvPath = arg('--csv', null);
const limit = Number(arg('--limit', '20'));

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error('DATABASE_URL manquante');

const safeDecrypt = (v) => {
  if (v == null) return null;
  try {
    return decrypt(v);
  } catch {
    return null;
  }
};

(async () => {
  const db = new Client({ connectionString: dbUrl });
  await db.connect();
  // Session en lecture seule : le serveur refuse toute écriture, même par erreur.
  await db.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');

  const settingsRow = (await db.query('select * from "SystemSettings" limit 1')).rows[0] || {};
  const settings = {
    workStartTime: settingsRow.workStartTime || '08:45',
    workEndTime: settingsRow.workEndTime || '17:30',
    breakDuration: settingsRow.breakDuration ?? 60,
  };
  const holidays = T.normalizeHolidays(settingsRow.holidays);

  const where = [];
  const params = [];
  if (from) {
    params.push(T.dayStart(from, TZ));
    where.push(`date >= $${params.length}`);
  }
  if (to) {
    params.push(T.dayEnd(to, TZ));
    where.push(`date <= $${params.length}`);
  }
  const w = where.length ? 'where ' + where.join(' and ') : '';
  const pointages = (await db.query(`select * from "Pointage" ${w} order by "userId", date, "sessionNumber"`, params)).rows;
  const breaks = (await db.query(`select * from "Break" ${w}`, params)).rows;

  const byKey = new Map();
  const add = (map, key, v) => (map.has(key) ? map.get(key).push(v) : map.set(key, [v]));
  const brkByKey = new Map();
  for (const p of pointages) add(byKey, `${p.userId}|${T.dayKeyOf(p.date, TZ)}`, p);
  for (const b of breaks) add(brkByKey, `${b.userId}|${T.dayKeyOf(b.date, TZ)}`, b);

  const counts = {};
  const samples = {};
  const rows = [];
  let days = 0;
  let sessions = 0;
  const note = (cat, info) => {
    counts[cat] = (counts[cat] || 0) + 1;
    (samples[cat] ||= []).length < limit && samples[cat].push(info);
    rows.push({ category: cat, ...info });
  };

  for (const [key, list] of byKey) {
    const [userId, day] = key.split('|');
    days++;
    const sess = list.map((p) => ({
      sessionNumber: p.sessionNumber,
      entryTime: safeDecrypt(p.entryTime),
      exitTime: safeDecrypt(p.exitTime),
    }));
    const brk = (brkByKey.get(key) || []).map((b) => ({ day, startTime: safeDecrypt(b.startTime), endTime: safeDecrypt(b.endTime) }));
    const base = { workStartTime: settings.workStartTime, workEndTime: settings.workEndTime };
    const ctx = { tz: TZ, holidays, now: new Date() };
    const recorded = T.computeDayMetrics(day, sess, brk, { ...base, breakDeductionMode: 'recorded' }, ctx);
    const flat = T.computeDayMetrics(day, sess, brk, { ...base, breakDeductionMode: 'recorded_or_flat', flatBreakMinutes: settings.breakDuration }, ctx);

    // Ancienne règle de end() : durée = brut − forfait SI brut > forfait (par session)
    const legacyEnd = (s) => {
      const m = recorded.sessions.find((x) => x.sessionNumber === s.sessionNumber);
      if (!m || !m.interval) return 0;
      return m.grossMinutes > settings.breakDuration ? m.grossMinutes - settings.breakDuration : m.grossMinutes;
    };

    for (const p of list) {
      sessions++;
      const s = sess.find((x) => x.sessionNumber === p.sessionNumber);
      const m = recorded.sessions.find((x) => x.sessionNumber === p.sessionNumber);
      const info = { userId, day, sessionNumber: p.sessionNumber, stored: p.duration, expected: m ? m.netMinutes : 0, entry: s.entryTime, exit: s.exitTime, status: p.status };

      if (p.duration < 0 || (s.entryTime && s.exitTime && T.parseHM(s.entryTime) !== null && T.parseHM(s.exitTime) !== null && T.parseHM(s.exitTime) <= T.parseHM(s.entryTime))) {
        note('NEGATIVE_OR_INVALID', info);
        continue;
      }
      if (s.entryTime && !s.exitTime && p.duration > 0 && !p.isActive) {
        note('OPEN_WITH_DURATION', info);
        continue;
      }
      if (s.exitTime && p.duration !== info.expected) {
        const legacy = legacyEnd(s);
        if (list.length > 1 && p.duration === legacy && legacy !== info.expected) note('MULTI_SESSION_FLAT', info);
        else if (p.duration === legacy || p.duration === Math.max(0, (m?.grossMinutes ?? 0) - settings.breakDuration)) note('LEGACY_FLAT_BREAK', { ...info, delta: p.duration - info.expected });
        else note('STALE_DURATION', { ...info, delta: p.duration - info.expected });
      }
      // Statut : seule la 1re session peut être « late », jour ouvré uniquement
      if (p.sessionNumber === 1 && s.entryTime && s.exitTime && ['late', 'normal'].includes(p.status)) {
        const shouldBeLate = T.lateMinutesFor(day, s.entryTime, settings.workStartTime, holidays) > 0;
        if (shouldBeLate !== (p.status === 'late')) note('STATUS_MISMATCH', { ...info, shouldBeLate });
      }
    }
    void flat;
  }

  console.log(`Fuseau métier : ${TZ} | période : ${from || 'début'} → ${to || 'fin'}`);
  console.log(`Réglages : début ${settings.workStartTime}, fin ${settings.workEndTime}, forfait pause historique ${settings.breakDuration} min, fériés ${holidays.size}`);
  console.log(`Analysé : ${days} journées-employé, ${sessions} sessions\n`);
  if (!Object.keys(counts).length) console.log('Aucun écart : toutes les durées/statuts stockés sont conformes au moteur.');
  for (const [cat, n] of Object.entries(counts)) {
    console.log(`■ ${cat} : ${n}`);
    for (const s of samples[cat]) console.log('   ', JSON.stringify(s));
  }
  if (csvPath) {
    const cols = ['category', 'userId', 'day', 'sessionNumber', 'entry', 'exit', 'status', 'stored', 'expected', 'delta', 'shouldBeLate'];
    const csv = [cols.join(';'), ...rows.map((r) => cols.map((c) => r[c] ?? '').join(';'))].join('\n');
    fs.writeFileSync(path.resolve(csvPath), csv, 'utf8');
    console.log(`\nDétail écrit dans ${csvPath} (${rows.length} lignes)`);
  }
  console.log('\nAucune donnée n\'a été modifiée (session PostgreSQL en lecture seule).');
  await db.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
