'use strict';
const { Client } = require('pg');
const DB = 'postgresql://elite_time_user:t4w*8PS@10.0.100.58:5432/elite_time?connect_timeout=60';

function toLocalDateStr(d) {
  const date = d instanceof Date ? d : new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function localDateFromStr(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const JOURS = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];

async function main() {
  const db = new Client({ connectionString: DB });
  await db.connect();

  console.log('\n=== VERIFICATION TIMEZONE ===');
  console.log('Node getTimezoneOffset():', new Date().getTimezoneOffset(), '=> UTC', -new Date().getTimezoneOffset()/60);
  console.log('Node TZ env:', process.env.TZ || '(non defini)');

  // Test: que renvoie pg pour un TIMESTAMP connu ?
  const pgTz = await db.query("SHOW timezone");
  console.log('PG session TZ:', pgTz.rows[0].TimeZone);

  // Test direct: une date connue
  const testDate = await db.query("SELECT '2026-05-02 00:00:00'::timestamp as ts, '2026-05-05 00:00:00'::timestamp as ts2");
  const r = testDate.rows[0];
  console.log('\nTest TIMESTAMP direct:');
  console.log('  PG "2026-05-02 00:00:00"::timestamp');
  console.log('  => pg driver Date.toISOString():', r.ts.toISOString());
  console.log('  => toLocalDateStr():', toLocalDateStr(r.ts));
  console.log('  => getDay():', localDateFromStr(toLocalDateStr(r.ts)).getDay(), JOURS[localDateFromStr(toLocalDateStr(r.ts)).getDay()]);

  console.log('  PG "2026-05-05 00:00:00"::timestamp');
  console.log('  => pg driver Date.toISOString():', r.ts2.toISOString());
  console.log('  => toLocalDateStr():', toLocalDateStr(r.ts2));
  console.log('  => getDay():', localDateFromStr(toLocalDateStr(r.ts2)).getDay(), JOURS[localDateFromStr(toLocalDateStr(r.ts2)).getDay()]);

  // Test: comment Prisma stocke new Date("2026-05-05") ?
  // Prisma insère l'UTC midnight. On vérifie avec une requête SQL directe.
  const storedDates = await db.query(`
    SELECT DISTINCT date, date::text as raw_text
    FROM "Pointage"
    WHERE date >= '2026-04-30 00:00:00' AND date < '2026-05-10 00:00:00'
    ORDER BY date
  `);
  console.log('\n=== TIMESTAMPS BRUTS dans Pointage (30/04 - 09/05) ===');
  storedDates.rows.forEach(r => {
    const jsDate = r.date;
    const local = toLocalDateStr(jsDate);
    const ld = localDateFromStr(local);
    const dow = JOURS[ld.getDay()];
    console.log(`  raw="${r.raw_text}" | js.ISO="${jsDate.toISOString()}" | toLocalDateStr="${local}" (${dow})`);
  });

  // Les 8 users actifs : qui est qui ?
  const users = await db.query(`
    SELECT id, role, status, "hiddenFromLists", "includeInReports"
    FROM "User"
    WHERE status='active' AND "hiddenFromLists"=false AND "includeInReports"=true
    ORDER BY lastname, firstname
  `);
  const userIds = users.rows.map(u => u.id);
  console.log('\n=== 8 USERS actifs incl. reports ===');
  console.log('IDs (anonymisés):', userIds.map(id => id.slice(0,8)));

  // Pointages du 5 mai (Mardi) — que voit le rapport ?
  console.log('\n=== SIMULATION groupByDay pour Mardi 5 mai ===');
  const placeholders = userIds.map((_, i) => `$${i+1}`).join(',');
  const fromMay5 = new Date('2026-05-05T00:00:00'); // local midnight
  const toMay5   = new Date('2026-05-05T23:59:59');
  console.log('Script from/to:', fromMay5.toISOString(), '/', toMay5.toISOString());

  const pts5 = await db.query(`
    SELECT id, "userId", date, status, "sessionNumber", source
    FROM "Pointage"
    WHERE "userId" IN (${placeholders})
      AND date >= $${userIds.length+1}
      AND date <= $${userIds.length+2}
    ORDER BY date ASC
  `, [...userIds, fromMay5, toMay5]);
  console.log('Script query pour 5 mai:', pts5.rowCount, 'pointages');
  pts5.rows.forEach(r => {
    console.log('  date.ISO=', r.date.toISOString(), '| toLocalDateStr=', toLocalDateStr(r.date), '| userId=', r.userId.slice(0,8), '| source=', r.source);
  });

  // Simuler la requête NestJS fetchData (setHours version)
  const fromNest = new Date('2026-05-05'); // UTC midnight
  fromNest.setHours(0,0,0,0);             // local midnight
  const toNest   = new Date('2026-05-05');
  toNest.setHours(23,59,59,999);
  console.log('\nNestJS from/to:', fromNest.toISOString(), '/', toNest.toISOString());

  const ptsNest = await db.query(`
    SELECT id, "userId", date, status, "sessionNumber", source
    FROM "Pointage"
    WHERE "userId" IN (${placeholders})
      AND date >= $${userIds.length+1}
      AND date <= $${userIds.length+2}
    ORDER BY date ASC
  `, [...userIds, fromNest, toNest]);
  console.log('NestJS query pour 5 mai:', ptsNest.rowCount, 'pointages');
  ptsNest.rows.forEach(r => {
    console.log('  date.ISO=', r.date.toISOString(), '| toLocalDateStr=', toLocalDateStr(r.date), '| userId=', r.userId.slice(0,8), '| source=', r.source);
  });

  // Vérifier les 7 pointages du 2 mai dans la vue manager
  console.log('\n=== SIMULATION getManagerByDate("2026-05-02") ===');
  const dm = new Date('2026-05-02');
  const startM = new Date(dm); startM.setHours(0,0,0,0);
  const endM   = new Date(dm); endM.setHours(23,59,59,999);
  console.log('getManagerByDate from/to:', startM.toISOString(), '/', endM.toISOString());
  const ptsManager2 = await db.query(`
    SELECT id, "userId", date, status, "sessionNumber", source
    FROM "Pointage"
    WHERE "userId" IN (${placeholders})
      AND date >= $${userIds.length+1}
      AND date <= $${userIds.length+2}
    ORDER BY "sessionNumber" ASC
  `, [...userIds, startM, endM]);
  console.log('getManagerByDate("2026-05-02"):', ptsManager2.rowCount, 'pointages');
  ptsManager2.rows.forEach(r => {
    console.log('  date.ISO=', r.date.toISOString(), '| toLocalDateStr=', toLocalDateStr(r.date), '| userId=', r.userId.slice(0,8));
  });

  // Maintenant simuler groupByDay complet pour semaine 5-9 mai
  console.log('\n=== SIMULATION groupByDay : semaine 5-8 mai ===');
  const fromWeek = new Date('2026-05-05T00:00:00');
  const toWeek   = new Date('2026-05-08T23:59:59');
  const ptsWeek = await db.query(`
    SELECT id, "userId", date, status, "sessionNumber", source, "isActive"
    FROM "Pointage"
    WHERE "userId" IN (${placeholders})
      AND date >= $${userIds.length+1}
      AND date <= $${userIds.length+2}
    ORDER BY date ASC
  `, [...userIds, fromWeek, toWeek]);
  console.log('Pointages semaine 5-8 mai (query):', ptsWeek.rowCount);

  // Grouper par jour comme le script
  const allDates = new Set();
  ptsWeek.rows.forEach(p => allDates.add(toLocalDateStr(p.date)));
  console.log('Dates uniques trouvées par toLocalDateStr:', Array.from(allDates).sort());

  for (const dayStr of Array.from(allDates).sort()) {
    const date = localDateFromStr(dayStr);
    const dow = date.getDay();
    if (dow === 0) { console.log(`  ${dayStr} (${JOURS[dow]}) -> FILTRÉ (dimanche)`); continue; }
    const employes = ptsWeek.rows.filter(p => toLocalDateStr(p.date) === dayStr);
    const usersDay = new Set(employes.map(p => p.userId));
    console.log(`  ${dayStr} (${JOURS[dow]}) -> ${usersDay.size} employés, ${employes.length} pointages`);
  }

  await db.end();
}

main().catch(e => { console.error('ERR:', e.message, e.stack); process.exit(1); });
