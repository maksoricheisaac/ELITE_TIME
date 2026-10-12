-- ============================================================
-- Migration : Congés — traçabilité approbateur + updatedAt + index
-- Description : Ajoute approvedById, rejectedById, updatedAt sur Absence,
--               ainsi que des index de performance. Additive, nullable-safe,
--               aucune perte de données.
-- ============================================================

-- 1. Ajouter les nouvelles colonnes
ALTER TABLE "Absence"
  ADD COLUMN IF NOT EXISTS "approvedById" TEXT,
  ADD COLUMN IF NOT EXISTS "rejectedById" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

-- 2. Backfill updatedAt pour les lignes existantes (valeur = createdAt)
UPDATE "Absence" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;

-- 3. Rendre updatedAt NOT NULL avec valeur par défaut désormais que le backfill est fait
ALTER TABLE "Absence" ALTER COLUMN "updatedAt" SET NOT NULL;

-- 4. Contraintes de clé étrangère vers User (SetNull à la suppression)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Absence_approvedById_fkey'
  ) THEN
    ALTER TABLE "Absence"
      ADD CONSTRAINT "Absence_approvedById_fkey"
      FOREIGN KEY ("approvedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Absence_rejectedById_fkey'
  ) THEN
    ALTER TABLE "Absence"
      ADD CONSTRAINT "Absence_rejectedById_fkey"
      FOREIGN KEY ("rejectedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 5. Index de performance
CREATE INDEX IF NOT EXISTS "Absence_userId_status_idx" ON "Absence"("userId", "status");
CREATE INDEX IF NOT EXISTS "Absence_status_startDate_idx" ON "Absence"("status", "startDate");
