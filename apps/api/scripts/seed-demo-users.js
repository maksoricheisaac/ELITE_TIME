/**
 * Crée 4 comptes de DÉMONSTRATION (un par rôle) dans une base LOCALE.
 *
 *   node scripts/seed-demo-users.js
 *
 * Garde-fous : refuse de s'exécuter si NODE_ENV=production ou si le nom de la
 * base ne se termine pas par "_demo" ou "_dev" ou "_local". Les mots de passe
 * ci-dessous sont publics (démo uniquement).
 */
require('dotenv').config({ quiet: true });
const bcrypt = require('bcryptjs');
const { Client } = require('pg');
const { encrypt } = require('@elitetime/shared');

const PASSWORD = 'Demo#Elite2026';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error('DATABASE_URL manquante');
const dbName = new URL(dbUrl).pathname.replace('/', '');
if (process.env.NODE_ENV === 'production' || !/_(demo|dev|local)$/.test(dbName)) {
  console.error(`Refus : base "${dbName}" non autorisée pour les comptes de démo.`);
  process.exit(1);
}

const USERS = [
  { username: 'demo.admin', role: 'admin', firstname: 'Alice', lastname: 'Admin', department: 'Direction', position: 'Administratrice' },
  { username: 'demo.manager', role: 'manager', firstname: 'Marc', lastname: 'Manager', department: 'Exploitation', position: 'Responsable' },
  { username: 'demo.teamlead', role: 'team_lead', firstname: 'Tina', lastname: 'TeamLead', department: 'Exploitation', position: 'Chef d\'équipe' },
  { username: 'demo.employee', role: 'employee', firstname: 'Eric', lastname: 'Employé', department: 'Exploitation', position: 'Agent' },
];

(async () => {
  const db = new Client({ connectionString: dbUrl });
  await db.connect();
  const hash = await bcrypt.hash(PASSWORD, 10);
  const ids = {};

  for (const u of USERS) {
    const id = 'demo_' + u.role;
    await db.query(
      `insert into "User"(id,username,email,firstname,lastname,department,position,role,status,"isLocal",password,"createdAt","updatedAt")
       values($1,$2,$3,$4,$5,$6,$7,$8::"UserRole",'active',true,$9,now(),now())
       on conflict (id) do nothing`,
      [id, encrypt(u.username), encrypt(`${u.username}@demo.local`), encrypt(u.firstname), encrypt(u.lastname),
       encrypt(u.department), encrypt(u.position), u.role, hash],
    );
    await db.query('insert into "HiddenUsername"(id,username,"userId",hidden,"updatedAt") values($1,$2,$3,false,now()) on conflict (username) do nothing', ['hu_' + u.role, u.username, id]);
    ids[u.role] = id;
    console.log(`+ ${u.username} (${u.role})`);
  }
  await db.query('update "User" set "teamLeadId"=$1 where id=$2', [ids.team_lead, ids.employee]);
  await db.end();
  console.log(`\nMot de passe de tous les comptes : ${PASSWORD}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
