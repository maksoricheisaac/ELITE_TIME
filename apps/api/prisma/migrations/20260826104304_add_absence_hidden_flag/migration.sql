-- ============================================================
-- Migration : Congés — ajout du champ "hidden" (masquage d'affichage)
-- Description : Ajoute une colonne booléenne "hidden" sur Absence, distincte
--               du statut métier (pending/approved/rejected/cancelled).
--               Permet de retirer une ligne des vues manager/employé sans la
--               supprimer physiquement ni changer son statut : la ligne reste
--               intégralement récupérable en base de données.
--               Additive, nullable-safe (valeur par défaut false), aucune
--               perte de données, aucune ligne existante affectée.
-- ============================================================

ALTER TABLE "Absence"
  ADD COLUMN IF NOT EXISTS "hidden" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Absence_hidden_idx" ON "Absence"("hidden");
