-- ============================================================
-- Migration : Congés — ajout du statut "cancelled" (annulation logique)
-- Description : Ajoute la valeur "cancelled" à l'enum AbsenceStatus pour
--               permettre l'annulation logique (soft-delete) des demandes
--               de congé au lieu d'une suppression physique.
--               Additive, aucune perte de données, aucune ligne existante modifiée.
-- ============================================================

DO $$ BEGIN
  ALTER TYPE "AbsenceStatus" ADD VALUE IF NOT EXISTS 'cancelled';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
