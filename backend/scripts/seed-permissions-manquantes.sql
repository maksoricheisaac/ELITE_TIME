-- ============================================================
-- Rattrapage : insert des permissions manquantes en BDD
-- Idempotent : utilise ON CONFLICT DO UPDATE
-- Exécuter depuis psql ou pgAdmin sur la base EliteTime
-- ============================================================

INSERT INTO "Permission" (id, name, description, category, module, action, "riskLevel", "isSystem", "createdAt", "updatedAt")
VALUES
  -- departments
  (gen_random_uuid(), 'departments.view',   'Voir les départements',          'departements', 'departments', 'view',   'LOW'::"PermissionRisk",    true, NOW(), NOW()),
  (gen_random_uuid(), 'departments.create', 'Créer un département',           'departements', 'departments', 'create', 'MEDIUM'::"PermissionRisk", true, NOW(), NOW()),
  (gen_random_uuid(), 'departments.edit',   'Modifier un département',         'departements', 'departments', 'edit',   'MEDIUM'::"PermissionRisk", true, NOW(), NOW()),
  (gen_random_uuid(), 'departments.delete', 'Supprimer un département',        'departements', 'departments', 'delete', 'MEDIUM'::"PermissionRisk", true, NOW(), NOW()),
  -- positions
  (gen_random_uuid(), 'positions.view',     'Voir les postes',                 'postes',        'positions',  'view',   'LOW'::"PermissionRisk",    true, NOW(), NOW()),
  (gen_random_uuid(), 'positions.create',   'Créer un poste',                  'postes',        'positions',  'create', 'MEDIUM'::"PermissionRisk", true, NOW(), NOW()),
  (gen_random_uuid(), 'positions.edit',     'Modifier un poste',               'postes',        'positions',  'edit',   'MEDIUM'::"PermissionRisk", true, NOW(), NOW()),
  (gen_random_uuid(), 'positions.delete',   'Supprimer un poste',              'postes',        'positions',  'delete', 'MEDIUM'::"PermissionRisk", true, NOW(), NOW()),
  -- employees.view_all (pour être complet)
  (gen_random_uuid(), 'employees.view_all',  'Voir tous les employés',         'employes',      'employees',  'view_all','MEDIUM'::"PermissionRisk", true, NOW(), NOW()),
  (gen_random_uuid(), 'employees.view_team', 'Voir les employés de son équipe','employes',      'employees',  'view_team','LOW'::"PermissionRisk",  true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE
  SET
    description = EXCLUDED.description,
    category    = EXCLUDED.category,
    module      = EXCLUDED.module,
    action      = EXCLUDED.action,
    "riskLevel" = EXCLUDED."riskLevel",
    "isSystem"  = EXCLUDED."isSystem",
    "updatedAt" = NOW();

-- Vérification
SELECT name, description, "riskLevel" FROM "Permission"
WHERE name IN (
  'departments.view', 'departments.create', 'departments.edit', 'departments.delete',
  'positions.view', 'positions.create', 'positions.edit', 'positions.delete',
  'employees.view_all', 'employees.view_team'
)
ORDER BY name;
