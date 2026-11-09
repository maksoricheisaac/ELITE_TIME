'use strict';
const { Client } = require('pg');
const DB = 'postgresql://elite_time_user:t4w*8PS@10.0.100.58:5432/elite_time?connect_timeout=60';

async function main() {
  const db = new Client({ connectionString: DB });
  await db.connect();

  // ─── 1. Comment Node.js parse les dateStr ─────────────────────────────────
  console.log('\n=== 1. new Date() parsing tests sur CE serveur ===');
  const cases = [
    'new Date("2026-05-05")',
    'new Date("2026-05-05T00:00:00")',
    'new Date("2026-05-05T00:00:00Z")',
    'new Date("2026-05-05T00:00:00.000Z")',
  ];
  const vals = [
    new Date("2026-05-05"),
    new Date("2026-05-05T00:00:00"),
    new Date("2026-05-05T00:00:00Z"),
    new Date("2026-05-05T00:00:00.000Z"),
  ];
  cases.forEach((c, i) => {
    const v = vals[i];
    console.log(`  ${c}`);
    console.log(`    .toISOString()  = ${v.toISOString()}`);
    console.log(`    .getDate()      = ${v.getDate()}  (local UTC+1)`);
    console.log(`    .getUTCDate()   = ${v.getUTCDate()} (UTC)`);
  });

  // ─── 2. Ce que pg envoie à PostgreSQL pour chaque date ────────────────────
  console.log('\n=== 2. Ce que pg envoie à PG pour new Date("2026-05-05") ===');
  // On insère dans une table temp et on lit le raw
  await db.query('CREATE TEMP TABLE _test_dates (d TIMESTAMP, lbl TEXT)');
  const testDates = [
    { lbl: 'new Date("2026-05-05")',           v: new Date("2026-05-05") },
    { lbl: 'new Date("2026-05-05T00:00:00")', v: new Date("2026-05-05T00:00:00") },
    { lbl: 'new Date("2026-05-05T00:00:00Z")',v: new Date("2026-05-05T00:00:00Z") },
    { lbl: 'new Date(y,m-1,d) UTC+1 midnight', v: new Date(2026, 4, 5) },  // local midnight
  ];
  for (const t of testDates) {
    await db.query('INSERT INTO _test_dates VALUES ($1, $2)', [t.v, t.lbl]);
  }
  const res = await db.query('SELECT d::text as raw, lbl FROM _test_dates ORDER BY d');
  console.log('  Résultats:');
  res.rows.forEach(r => console.log(`    lbl="${r.lbl}" -> raw_stored="${r.raw}"`));

  // ─── 3. Quel raw est stocké pour un manager pointage "2026-05-05"? ─────────
  console.log('\n=== 3. Vérification raw exact des manager pointages mai 2026 ===');
  // Avec SET TZ=UTC pour éliminer l'interférence timezone
  await db.query("SET timezone = 'UTC'");
  const ptsMgr = await db.query(`
    SELECT
      date::text as raw_text,
      to_char(date, 'YYYY-MM-DD HH24:MI:SS') as formatted,
      extract(epoch from date) as epoch,
      "userId",
      status
    FROM "Pointage"
    WHERE source = 'MANAGER'
      AND date >= '2026-05-01'
      AND date < '2026-05-10'
    ORDER BY date ASC, "userId" ASC
    LIMIT 20
  `);
  console.log('  Manager pointages (session TZ=UTC):');
  ptsMgr.rows.forEach(r => {
    const epochDate = new Date(parseFloat(r.epoch) * 1000);
    console.log(`    raw="${r.raw_text}" | formatted="${r.formatted}" | epoch_utc=${epochDate.toISOString().slice(0,19)} | user=${r.userId.slice(0,8)}`);
  });

  // ─── 4. Comprendre: où est la vraie date Paris pour ces pointages ──────────
  console.log('\n=== 4. Vrai jour Paris des manager pointages ===');
  const ptsMgr2 = await db.query(`
    SELECT
      date::text as raw_text,
      to_char(date AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') as paris_day,
      to_char(date, 'YYYY-MM-DD') as utc_day,
      "userId",
      status
    FROM "Pointage"
    WHERE source = 'MANAGER'
      AND date >= '2026-05-01'
      AND date < '2026-05-10'
    GROUP BY date, "userId", status, raw_text
    ORDER BY date ASC
    LIMIT 30
  `);
  console.log('  raw vs utc_day vs paris_day:');
  ptsMgr2.rows.forEach(r => {
    console.log(`    raw="${r.raw_text}" | utc_day="${r.utc_day}" | paris_day="${r.paris_day}" | user=${r.userId.slice(0,8)}`);
  });

  // ─── 5. Manager view: ce que voit réellement le manager pour le 5 mai ──────
  console.log('\n=== 5. Ce que voit getManagerByDate pour chaque jour de la semaine ===');
  await db.query("RESET timezone");
  const users = await db.query(`SELECT id FROM "User" WHERE status='active' AND "hiddenFromLists"=false AND "includeInReports"=true`);
  const ids = users.rows.map(u => u.id);
  const ph = ids.map((_, i) => `$${i+1}`).join(',');

  for (const dateStr of ['2026-05-01','2026-05-02','2026-05-05','2026-05-06','2026-05-07','2026-05-08']) {
    const d = new Date(dateStr);
    const start = new Date(d); start.setHours(0,0,0,0);
    const end   = new Date(d); end.setHours(23,59,59,999);
    const r = await db.query(`
      SELECT COUNT(DISTINCT "userId") as n
      FROM "Pointage" WHERE "userId" IN (${ph}) AND date >= $${ids.length+1} AND date <= $${ids.length+2}
    `, [...ids, start, end]);
    console.log(`  getManagerByDate("${dateStr}"): ${r.rows[0].n} employes (from=${start.toISOString()} to=${end.toISOString()})`);
  }

  // ─── 6. Ce que voit le rapport NestJS (fetchData) pour la même période ─────
  console.log('\n=== 6. fetchData NestJS pour 1-21 mai 2026 ===');
  const fromF = new Date("2026-05-01"); fromF.setHours(0,0,0,0);
  const toF   = new Date("2026-05-21"); toF.setHours(23,59,59,999);
  console.log('  from:', fromF.toISOString(), '  to:', toF.toISOString());
  const ptsFetch = await db.query(`
    SELECT date::text as raw, "userId", status, source
    FROM "Pointage"
    WHERE "userId" IN (${ph}) AND date >= $${ids.length+1} AND date <= $${ids.length+2}
    ORDER BY date ASC
  `, [...ids, fromF, toF]);
  console.log('  Total pointages:', ptsFetch.rowCount);

  // Grouper par toLocalDateStr
  function toLocalDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  const grouped = {};
  ptsFetch.rows.forEach(r => {
    const key = toLocalDateStr(r.date);
    if (!grouped[key]) grouped[key] = new Set();
    grouped[key].add(r.userId);
  });
  const jours = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  Object.keys(grouped).sort().forEach(k => {
    const d = new Date(k + 'T12:00:00');
    console.log(`  ${k} (${jours[d.getDay()]}) -> ${grouped[k].size} employes`);
  });

  await db.end();
}

main().catch(e => { console.error('ERR:', e.message, '\n', e.stack); process.exit(1); });
