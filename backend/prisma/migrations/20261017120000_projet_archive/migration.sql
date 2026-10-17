-- Un projet archivé quitte la liste sans rien perdre : c'est ce qu'on propose
-- quand il ne peut pas être supprimé (société immatriculée, factures émises).
-- Purement additif : une colonne nullable, aucun remplissage.

-- AlterTable
ALTER TABLE "projects" ADD COLUMN "archived_at" TIMESTAMPTZ(6);
