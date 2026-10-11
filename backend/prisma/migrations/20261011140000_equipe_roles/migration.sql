-- Rôles d'équipe : les collaborateurs existants deviennent observateurs (tout voir, rien modifier).
-- AlterTable
ALTER TABLE "project_collaborators" ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'observateur';
