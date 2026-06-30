'use strict';
const { Client } = require('pg');
const DB = 'postgresql://elite_time_user:t4w*8PS@10.0.100.58:5432/elite_time?connect_timeout=60';

function toLocalDateStr(d) {
  const date = d instanceof Date ? d : new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

const JOURS = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];

async function main() {
  const db = new Client({ connectionString: DB });
  await db.connect();

  // ─── 1. Vérifier timezone PG session pg vs Prisma ────────────────────────
  console.log('\n=== 1. SESSION TZ via pg driver (sans SET) ===');
  const pgTz = await db.query("SHOW timezone");
  console.log('PG session TZ:', pgTz.rows[0].TimeZone);

  // Forcer UTC et voir la différence
  await db.query("SET timezone = 'UTC'");
  const testUtc = await db.query("SELECT '2026-05-05 00:00:00'::timestamp as ts");
  console.log('Après SET TZ=UTC, "2026-05-05 00:00:00"::timestamp =>', testUtc.rows[0].ts.toISOString());

  await db.query("SET timezone = 'Europe/Paris'");
  const testParis = await db.query("SELECT '2026-05-05 00:00:00'::timestamp as ts");
  console.log('Après SET TZ=Paris, "2026-05-05 00:00:00"::timestamp =>', testParis.rows[0].ts.toISOString());

  // Remettre default
  await db.query("RESET timezone");

  // ─── 2. Voir exactement ce qui est stocké pour les manager pointages ──────
  console.log('\n=== 2. POINTAGES MANAGER: valeurs brutes avec AT TIME ZONE ===');
  const pts = await db.query(`
    SELECT
      date::text as raw,
      date AT TIME ZONE 'UTC' as date_utc,
      date AT TIME ZONE 'Europe/Paris' as date_paris,
      "userId",
      status,
      source,
      "sessionNumber"
    FROM "Pointage"
    WHERE source = 'MANAGER'
      AND date >= '2026-04-30'
      AND date <= '2026-05-10'
    ORDER BY date ASC, "userId" ASC
  `);
  pts.rows.forEach(r => {
    const raw = r.raw;
    const utc = new Date(r.date_utc);
    const paris = new Date(r.date_paris);
    console.log(`  raw="${raw}" | UTC=${utc.toISOString().slice(0,19)} | Paris=${paris.toISOString().slice(0,19)} | user=${r.userId.slice(0,8)} | status=${r.status}`);
  });

  // ─── 3. Simuler exactement getManagerByDate("2026-05-05") ─────────────────
  // NestJS: const date = new Date("2026-05-05"); start.setHours(0,0,0,0); end.setHours(23,59,59,999)
  console.log('\n=== 3. getManagerByDate("2026-05-05") ===');
  const d5 = new Date("2026-05-05");
  const s5 = new Date(d5); s5.setHours(0,0,0,0);
  const e5 = new Date(d5); e5.setHours(23,59,59,999);
  console.log('  start (param):', s5.toISOString());
  console.log('  end   (param):', e5.toISOString());

  const users = await db.query(`SELECT id FROM "User" WHERE status='active' AND "hiddenFromLists"=false AND "includeInReports"=true`);
  const ids = users.rows.map(u => u.id);
  const ph = ids.map((_, i) => `$${i+1}`).join(',');

  const manView5 = await db.query(`
    SELECT "userId", date::text as raw, status, source, "sessionNumber"
    FROM "Pointage" WHERE "userId" IN (${ph}) AND date >= $${ids.length+1} AND date <= $${ids.length+2}
    ORDER BY "sessionNumber"
  `, [...ids, s5, e5]);
  console.log('  getManagerByDate résultat:', manView5.rowCount, 'pointages');
  manView5.rows.forEach(r => console.log(`    raw="${r.raw}" user=${r.userId.slice(0,8)} status=${r.status}`));

  // ─── 4. Simuler script standalone for May 5 ───────────────────────────────
  console.log('\n=== 4. Script standalone query for May 5 ===');
  const fromScript = new Date('2026-05-05T00:00:00'); // local midnight
  const toScript   = new Date('2026-05-05T23:59:59');
  console.log('  from:', fromScript.toISOString(), '  to:', toScript.toISOString());
  const scriptPts = await db.query(`
    SELECT "userId", date::text as raw, status, source
    FROM "Pointage" WHERE "userId" IN (${ph}) AND date >= $${ids.length+1} AND date <= $${ids.length+2}
    ORDER BY date
  `, [...ids, fromScript, toScript]);
  console.log('  Script résultat:', scriptPts.rowCount, 'pointages');
  scriptPts.rows.forEach(r => console.log(`    raw="${r.raw}" user=${r.userId.slice(0,8)}`));

  // ─── 5. Compter exactement les employés par jour via DIFFÉRENTES méthodes ──
  console.log('\n=== 5. Comptage par jour en mai 2026 selon différentes méthodes ===');

  // Méthode A: date_trunc en UTC (ce que voit vraiment le rapport)
  const cntA = await db.query(`
    SELECT date_trunc('day', date AT TIME ZONE 'UTC') as day_utc, COUNT(DISTINCT "userId") as n
    FROM "Pointage"
    WHERE date >= '2026-04-30' AND date < '2026-05-22'
    GROUP BY 1 ORDER BY 1
  `);
  console.log('\nA) date_trunc UTC:');
  cntA.rows.forEach(r => {
    const d = new Date(r.day_utc);
    console.log(`  ${d.toISOString().slice(0,10)} -> ${r.n} emp`);
  });

  // Méthode B: date_trunc Paris (vrai jour local)
  const cntB = await db.query(`
    SELECT date_trunc('day', date AT TIME ZONE 'Europe/Paris') as day_paris, COUNT(DISTINCT "userId") as n
    FROM "Pointage"
    WHERE date >= '2026-04-30' AND date < '2026-05-22'
    GROUP BY 1 ORDER BY 1
  `);
  console.log('\nB) date_trunc Europe/Paris (vrai jour local):');
  cntB.rows.forEach(r => {
    const d = new Date(r.day_paris);
    // d here is interpreted by pg as UTC+1 local
    const localStr = toLocalDateStr(d);
    console.log(`  ${localStr} (${JOURS[new Date(localStr+'T12:00:00').getDay()]}) -> ${r.n} emp`);
  });

  // ─── 6. Vérifier le 1er mai: quels dates sont vraiment stockées ────────────
  console.log('\n=== 6. Pointages 1er mai et 2 mai EN PARIS TIME ===');
  const may1 = await db.query(`
    SELECT date::text as raw, "userId", status, source,
           date AT TIME ZONE 'Europe/Paris' as date_paris_raw
    FROM "Pointage"
    WHERE date AT TIME ZONE 'Europe/Paris' >= '2026-05-01 00:00:00'
      AND date AT TIME ZONE 'Europe/Paris' < '2026-05-03 00:00:00'
    ORDER BY date ASC, "userId" ASC
  `);
  console.log('Pointages dont date Paris est 1er ou 2 mai:', may1.rowCount);
  may1.rows.forEach(r => {
    const paris = new Date(r.date_paris_raw);
    console.log(`  raw="${r.raw}" | paris=${paris.toISOString().slice(0,19)} | user=${r.userId.slice(0,8)} | status=${r.status} | source=${r.source}`);
  });

  await db.end();
}

main().catch(e => { console.error('ERR:', e.message, '\n', e.stack); process.exit(1); });
