'use strict';
const { Client } = require('pg');

const DB = 'postgresql://elite_time_user:t4w*8PS@10.0.100.58:5432/elite_time?connect_timeout=60';
const db = new Client({ connectionString: DB });

db.connect().then(async () => {
  console.log('\n=== TIMEZONE CHECK ===');

  const tz = await db.query('SHOW timezone');
  console.log('PG timezone:', tz.rows[0]);

  const pgNow = await db.query('SELECT NOW() as pg_now, NOW() AT TIME ZONE \'Europe/Paris\' as paris_now');
  console.log('PG NOW():', pgNow.rows[0].pg_now);
  console.log('PG Paris:', pgNow.rows[0].paris_now);

  console.log('\nNode TZ env:', process.env.TZ || '(non defini)');
  console.log('Node offset min:', new Date().getTimezoneOffset(), '(UTC', -new Date().getTimezoneOffset()/60, ')');
  console.log('Node NOW ISO:', new Date().toISOString());
  console.log('Node NOW local:', new Date().toLocaleString('fr-FR'));

  console.log('\n=== USERS actifs includeInReports=true ===');
  const users = await db.query(`
    SELECT id, firstname, lastname, role, status, "hiddenFromLists", "includeInReports"
    FROM "User"
    WHERE status = 'active' AND "hiddenFromLists" = false AND "includeInReports" = true
    ORDER BY lastname, firstname
  `);
  console.log('NestJS fetchData users (sans filtre role):', users.rowCount);
  users.rows.forEach(u => {
    console.log('  role=' + u.role + ' id=' + u.id.slice(0,8) + '...');
  });

  const usersEmployee = await db.query(`
    SELECT id, role
    FROM "User"
    WHERE status = 'active' AND "hiddenFromLists" = false AND "includeInReports" = true AND role = 'employee'
    ORDER BY lastname, firstname
  `);
  console.log('Script standalone users (role=employee only):', usersEmployee.rowCount);

  console.log('\n=== POINTAGES RAW : 1-2 mai 2026 ===');
  const pts = await db.query(`
    SELECT p.id, p."userId", p.date, p.status, p."sessionNumber", p."isActive",
           p.source, p."pointedBy",
           LEFT(p."entryTime", 20) as "entryTime_enc",
           LEFT(p."exitTime", 20) as "exitTime_enc"
    FROM "Pointage" p
    WHERE p.date >= '2026-04-30 22:00:00' AND p.date < '2026-05-03 00:00:00'
    ORDER BY p.date ASC, p."userId" ASC, p."sessionNumber" ASC
  `);
  console.log('Pointages 1-2 mai (UTC range 30/04 22:00 -> 03/05 00:00):', pts.rowCount);
  pts.rows.forEach(r => {
    console.log('  date=' + r.date.toISOString() + ' user=' + r.userId.slice(0,8) + ' sess=' + r.sessionNumber + ' status=' + r.status + ' source=' + r.source);
  });

  console.log('\n=== POINTAGES RAW : 5, 6, 8 mai 2026 ===');
  const pts2 = await db.query(`
    SELECT p.id, p."userId", p.date, p.status, p."sessionNumber", p."isActive",
           p.source
    FROM "Pointage" p
    WHERE p.date >= '2026-05-04 22:00:00' AND p.date <= '2026-05-08 23:59:59'
    ORDER BY p.date ASC, p."userId" ASC, p."sessionNumber" ASC
  `);
  console.log('Pointages 5-8 mai:', pts2.rowCount);
  pts2.rows.forEach(r => {
    console.log('  date_utc=' + r.date.toISOString() + ' userId=' + r.userId.slice(0,8) + ' sess=' + r.sessionNumber + ' status=' + r.status);
  });

  console.log('\n=== COUNT PAR JOUR (toutes les dates en mai 2026) ===');
  const cnt = await db.query(`
    SELECT date_trunc('day', date) as day_utc,
           COUNT(DISTINCT "userId") as nb_employes,
           COUNT(*) as nb_pointages
    FROM "Pointage"
    WHERE date >= '2026-04-30 22:00:00' AND date <= '2026-05-21 22:00:00'
    GROUP BY 1
    ORDER BY 1
  `);
  console.log('Jours en mai:');
  cnt.rows.forEach(r => {
    console.log('  ' + r.day_utc.toISOString().slice(0,10) + ' -> ' + r.nb_employes + ' employes, ' + r.nb_pointages + ' pointages');
  });

  await db.end();
}).catch(e => {
  console.error('ERR:', e.message);
  process.exit(1);
});
