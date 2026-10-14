-- Note libre sur une tâche (surtout quand IGINI n'arrive pas à la faire).
-- Purement additif : une colonne nullable, aucun remplissage.

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "note" TEXT;
