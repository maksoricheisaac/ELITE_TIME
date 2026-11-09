#!/usr/bin/env node
/**
 * Rattrapage : insert des permissions manquantes en BDD — EliteTime
 *
 * Corrige le problème d'accès aux pages Employés / Départements / Postes
 * pour les utilisateurs à qui on a attribué ces permissions depuis /permissions
 * mais qui ne les trouvaient pas car elles n'étaient pas encore en table Permission.
 *
 * Idempotent : ON CONFLICT (name) DO UPDATE — safe à relancer.
 *
 * Usage :
 *   node backend/scripts/seed-permissions-manquantes.js          ← dry-run
 *   node backend/scripts/seed-permissions-manquantes.js --fix    ← applique
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const { Client } = require('pg');
const { randomUUID } = require('crypto');

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

const args    = process.argv.slice(2);
const DRY_RUN = !args.includes('--fix');

const PERMISSIONS = [
  // Départements
  { name: 'departments.view',   description: 'Voir les départements',           category: 'departements', riskLevel: 'LOW'    },
  { name: 'departments.create', description: 'Créer un département',            category: 'departements', riskLevel: 'MEDIUM' },
  { name: 'departments.edit',   description: 'Modifier un département',         category: 'departements', riskLevel: 'MEDIUM' },
  { name: 'departments.delete', description: 'Supprimer un département',        category: 'departements', riskLevel: 'MEDIUM' },
  // Postes
  { name: 'positions.view',     description: 'Voir les postes',                 category: 'postes',       riskLevel: 'LOW'    },
  { name: 'positions.create',   description: 'Créer un poste',                  category: 'postes',       riskLevel: 'MEDIUM' },
  { name: 'positions.edit',     description: 'Modifier un poste',               category: 'postes',       riskLevel: 'MEDIUM' },
  { name: 'positions.delete',   description: 'Supprimer un poste',              category: 'postes',       riskLevel: 'MEDIUM' },
  // Employés
  { name: 'employees.view_all',  description: 'Voir tous les employés',         category: 'employes',     riskLevel: 'MEDIUM' },
  { name: 'employees.view_team', description: "Voir les employés de son équipe",category: 'employes',     riskLevel: 'LOW'    },
  { name: 'employees.view_self', description: 'Voir son propre profil employé', category: 'employes',     riskLevel: 'LOW'    },
  { name: 'employees.create',    description: 'Créer un employé',               category: 'employes',     riskLevel: 'HIGH'   },
  { name: 'employees.edit',      description: 'Modifier un employé',            category: 'employes',     riskLevel: 'HIGH'   },
  { name: 'employees.export',    description: 'Exporter la liste des employés', category: 'employes',     riskLevel: 'HIGH'   },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[ERREUR] DATABASE_URL non défini.');
    process.exit(1);
  }

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  try {
    // Vérifier lesquelles manquent
    const { rows: existing } = await db.query(
      `SELECT name FROM "Permission" WHERE name = ANY($1)`,
      [PERMISSIONS.map(p => p.name)]
    );
    const existingNames = new Set(existing.map(r => r.name));
    const missing = PERMISSIONS.filter(p => !existingNames.has(p.name));
    const present = PERMISSIONS.filter(p => existingNames.has(p.name));

    console.log(`\n  Permissions vérifiées    : ${PERMISSIONS.length}`);
    console.log(`  Déjà présentes en BDD    : ${present.length}`);
    console.log(`  Manquantes (à insérer)   : ${missing.length}`);

    if (missing.length > 0) {
      console.log('\n  Permissions manquantes :');
      for (const p of missing) {
        console.log(`    ✗  ${p.name.padEnd(30)} [${p.riskLevel}]`);
      }
    }

    if (missing.length === 0) {
      console.log('\n  ✔  Toutes les permissions sont présentes en BDD.\n');
      return;
    }

    if (DRY_RUN) {
      console.log('\n  MODE DRY-RUN — aucune modification.');
      console.log('  Relancez avec --fix pour insérer les permissions manquantes.\n');
      return;
    }

    // Insertion
    let inserted = 0;
    for (const p of missing) {
      const dot = p.name.indexOf('.');
      const module = dot >= 0 ? p.name.slice(0, dot) : p.name;
      const action = dot >= 0 ? p.name.slice(dot + 1) : '';

      await db.query(
        `INSERT INTO "Permission" (id, name, description, category, module, action, "riskLevel", "isSystem", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7::text::"PermissionRisk", true, NOW(), NOW())
         ON CONFLICT (name) DO UPDATE
           SET description = EXCLUDED.description,
               module      = EXCLUDED.module,
               action      = EXCLUDED.action,
               "riskLevel" = EXCLUDED."riskLevel",
               "isSystem"  = true,
               "updatedAt" = NOW()`,
        [randomUUID(), p.name, p.description, p.category, module, action, p.riskLevel]
      );
      console.log(`  ✔  Insérée : ${p.name}`);
      inserted++;
    }

    console.log(`\n  ✔  ${inserted} permission(s) insérée(s) en BDD.\n`);
    console.log('  Les utilisateurs à qui ces permissions ont été attribuées');
    console.log('  peuvent maintenant accéder aux pages correspondantes.\n');

  } finally {
    await db.end();
  }
}

main().catch(err => {
  console.error('\n[ERREUR]', err.message || err);
  process.exit(1);
});
