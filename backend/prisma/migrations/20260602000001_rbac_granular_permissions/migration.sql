-- ============================================================
-- Migration : RBAC granulaire — ajout des métadonnées Permission
-- Auteur     : EliteTime Platform
-- Date       : 2026-06-02
-- Description : Ajoute module, action, riskLevel, isSystem au modèle
--               Permission. Ajoute les index de performance.
--               Sécurisée : ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
-- ============================================================

-- 1. Créer l'enum PermissionRisk (idempotent via DO block)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PermissionRisk') THEN
    CREATE TYPE "PermissionRisk" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
  END IF;
END $$;

-- 2. Ajouter les nouveaux champs à la table Permission
ALTER TABLE "Permission"
  ADD COLUMN IF NOT EXISTS "module"    TEXT,
  ADD COLUMN IF NOT EXISTS "action"    TEXT,
  ADD COLUMN IF NOT EXISTS "riskLevel" "PermissionRisk" NOT NULL DEFAULT 'LOW',
  ADD COLUMN IF NOT EXISTS "isSystem"  BOOLEAN NOT NULL DEFAULT false;

-- 3. Peupler module et action pour les permissions format module.action déjà en DB
UPDATE "Permission"
SET
  "module" = split_part("name", '.', 1),
  "action" = split_part("name", '.', 2)
WHERE "name" LIKE '%.%'
  AND ("module" IS NULL OR "action" IS NULL);

-- 4. Marquer les permissions système (celles créées par le seed)
UPDATE "Permission"
SET "isSystem" = true
WHERE "module" IS NOT NULL;

-- 5. Appliquer les niveaux de risque connus
UPDATE "Permission" SET "riskLevel" = 'CRITICAL' WHERE "name" IN (
  'auth.revoke_all_sessions',
  'employees.delete', 'employees.change_role', 'employees.reset_password', 'employees.import',
  'permissions.assign', 'permissions.revoke', 'permissions.reset',
  'settings.ldap', 'settings.security',
  'ldap.configure',
  'workers.configure',
  'ai.configure'
);

UPDATE "Permission" SET "riskLevel" = 'HIGH' WHERE "name" IN (
  'pointages.edit', 'pointages.delete', 'pointages.close_session', 'pointages.force_checkout',
  'pointages.validate', 'pointages.import',
  'absences.delete', 'absences.delete_managed', 'absences.approve', 'absences.reject',
  'employees.view_sensitive', 'employees.create', 'employees.edit',
  'employees.activate', 'employees.deactivate', 'employees.export',
  'corrections.approve', 'corrections.reject',
  'validations.approve', 'validations.reject',
  'logs.view_security',
  'ai.manage_cache', 'ai.manage_circuit',
  'ldap.sync',
  'workers.trigger',
  'breaks.manage'
);

UPDATE "Permission" SET "riskLevel" = 'MEDIUM' WHERE "name" IN (
  'pointages.view_all', 'pointages.create', 'pointages.export',
  'breaks.view_all', 'breaks.export',
  'absences.view_all', 'absences.create_managed', 'absences.edit_managed',
  'absences.export', 'absences.view_history', 'absences.delete',
  'corrections.view_all',
  'employees.view_all',
  'departments.create', 'departments.edit', 'departments.delete',
  'positions.create', 'positions.edit', 'positions.delete',
  'reports.view_all', 'reports.generate', 'reports.export_pdf', 'reports.export_excel',
  'reports.schedule', 'reports.delete_schedule',
  'emails.configure', 'emails.schedule', 'emails.manage_recipients',
  'emails.send_now', 'emails.delete_schedule',
  'ldap.view', 'ldap.view_users',
  'logs.export', 'logs.view_auth',
  'settings.work_hours', 'settings.email', 'settings.ai', 'settings.general',
  'settings.notifications',
  'permissions.view', 'permissions.audit',
  'ai.view_metrics', 'ai.view_history',
  'dashboard.view_global',
  'workers.view'
);
-- Tout le reste reste LOW par défaut

-- 6. Index sur module (pour requêtes par module fonctionnel)
CREATE INDEX IF NOT EXISTS "Permission_module_idx" ON "Permission"("module");

-- 7. Index sur userId dans UserPermission (pour requêtes fréquentes guard)
CREATE INDEX IF NOT EXISTS "UserPermission_userId_idx" ON "UserPermission"("userId");

-- 8. Index sur permissionId dans UserPermission
CREATE INDEX IF NOT EXISTS "UserPermission_permissionId_idx" ON "UserPermission"("permissionId");
