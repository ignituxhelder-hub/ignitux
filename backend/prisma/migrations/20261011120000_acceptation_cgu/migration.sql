-- Enregistre l'acceptation des conditions d'utilisation à l'inscription.
-- Purement additif : deux colonnes nullables, aucune valeur par défaut, aucun
-- remplissage. Les comptes existants restent à NULL — on ne fabrique pas une
-- acceptation qu'on n'a pas recueillie.
ALTER TABLE "users" ADD COLUMN "cgu_accepted_at" TIMESTAMPTZ(6);
ALTER TABLE "users" ADD COLUMN "cgu_version" TEXT;
