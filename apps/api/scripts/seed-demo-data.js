/**
 * Jeu de données FICTIF pour la base de démo (collaborateurs, pointages, absences),
 * afin que tous les écrans (tableaux de bord, rapports, congés) soient peuplés.
 * À lancer APRÈS seed-demo-users.js, avec ELITETIME_ENV_FILE=.env.demo :
 *   ELITETIME_ENV_FILE=.env.demo node scripts/seed-demo-data.js
 * Mêmes garde-fous que seed-demo-users.js (base *_demo/_dev/_local uniquement).
 */
const path = require('node:path');
require('dotenv').config({
  path: [path.join(__dirname, '..', '.env.demo'), path.join(__dirname, '..', '.env')],
  quiet: true,
});
const bcrypt = require('bcryptjs');
const { Client } = require('pg');
const { encrypt } = require('@elitetime/shared');

const dbUrl = process.env.DATABASE_URL;
const dbName = new URL(dbUrl).pathname.replace('/', '');
if (process.env.NODE_ENV === 'production' || !/_(demo|dev|local)$/.test(dbName)) {
  console.error(`Refus : base "${dbName}" non autorisée.`);
  process.exit(1);
}

const PEOPLE = [
  ['sophie.martin', 'Sophie', 'Martin', 'Exploitation', 'Agent'],
  ['karim.benali', 'Karim', 'Benali', 'Exploitation', 'Agent'],
  ['julie.durand', 'Julie', 'Durand', 'Support', 'Conseillère'],
  ['lucas.petit', 'Lucas', 'Petit', 'Support', 'Conseiller'],
  ['amina.diallo', 'Amina', 'Diallo', 'Comptabilité', 'Comptable'],
  ['thomas.roux', 'Thomas', 'Roux', 'Comptabilité', 'Assistant'],
  ['nadia.haddad', 'Nadia', 'Haddad', 'RH', 'Chargée RH'],
  ['paul.girard', 'Paul', 'Girard', 'Informatique', 'Technicien'],
];

const day = (offset) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
};
const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;
const hm = (mins) =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

(async () => {
  const db = new Client({ connectionString: dbUrl });
  await db.connect();
  const hash = await bcrypt.hash('Demo#Elite2026', 10);

  const ids = ['demo_employee'];
  for (const [i, [u, first, last, dept, pos]] of PEOPLE.entries()) {
    const id = `demo_emp_${i + 1}`;
    ids.push(id);
    await db.query(
      `insert into "User"(id,username,email,firstname,lastname,department,position,role,status,"isLocal",password,"teamLeadId","createdAt","updatedAt")
       values($1,$2,$3,$4,$5,$6,$7,'employee','active',true,$8,$9,now(),now()) on conflict (id) do nothing`,
      [id, encrypt(u), encrypt(`${u}@demo.local`), encrypt(first), encrypt(last), encrypt(dept), encrypt(pos), hash,
       i % 2 === 0 ? 'demo_team_lead' : null],
    );
    await db.query(
      'insert into "HiddenUsername"(id,username,"userId",hidden,"updatedAt") values($1,$2,$3,false,now()) on conflict (username) do nothing',
      [`hu_emp_${i + 1}`, u, id],
    );
  }

  // 10 derniers jours ouvrés : mix normal / retard / incomplet ; aujourd'hui = présents en cours
  let n = 0;
  for (const [ui, uid] of ids.entries()) {
    for (let off = -10; off <= 0; off++) {
      const d = day(off);
      if (isWeekend(d)) continue;
      if ((ui + off) % 7 === 0 && off !== 0) continue; // quelques absences de pointage
      const late = (ui * 3 + off) % 5 === 0;
      const entry = 8 * 60 + 45 + (late ? 15 + ((ui * 7) % 30) : (ui * 2) % 10);
      const today = off === 0;
      const incomplete = !today && (ui + off) % 9 === 0;
      const exit = 17 * 60 + 30 + ((ui * 5) % 20);
      const active = today && ui % 3 !== 2;
      const status = incomplete ? 'incomplete' : late ? 'late' : 'normal';
      const duration = active || incomplete ? 0 : exit - entry - 60;
      const id = `dp_${uid}_${off + 10}`;
      await db.query(
        `insert into "Pointage"(id,"userId",date,"entryTime","exitTime",duration,status,"isActive","lateReason","updatedAt")
         values($1,$2,$3,$4,$5,$6,$7::"PointageStatus",$8,$9,now()) on conflict (id) do nothing`,
        [id, uid, d, encrypt(hm(entry)), active || incomplete ? null : encrypt(hm(exit)), duration, status, active,
         late ? encrypt('Transports en commun') : null],
      );
      n++;
    }
  }

  // Absences : en attente, approuvées, refusées
  const abs = [
    ['demo_emp_1', 'conge', 3, 7, 'pending', 'Vacances en famille'],
    ['demo_emp_2', 'maladie', -3, -2, 'approved', 'Grippe'],
    ['demo_emp_3', 'conge', 14, 18, 'approved', 'Congés annuels'],
    ['demo_emp_4', 'autre', 5, 5, 'pending', 'Rendez-vous administratif'],
    ['demo_employee', 'conge', 20, 24, 'pending', 'Congés d\'été'],
    ['demo_emp_5', 'conge', -8, -6, 'rejected', 'Déplacement personnel'],
  ];
  for (const [i, [uid, type, from, to, status, reason]] of abs.entries()) {
    await db.query(
      `insert into "Absence"(id,"userId",type,"startDate","endDate",reason,status,"updatedAt")
       values($1,$2,$3::"AbsenceType",$4,$5,$6,$7::"AbsenceStatus",now()) on conflict (id) do nothing`,
      [`da_${i}`, uid, type, day(from), day(to), encrypt(reason), status],
    );
  }

  await db.end();
  console.log(`OK : ${ids.length} collaborateurs, ${n} pointages, ${abs.length} absences`);
})().catch((e) => { console.error(e.message); process.exit(1); });
