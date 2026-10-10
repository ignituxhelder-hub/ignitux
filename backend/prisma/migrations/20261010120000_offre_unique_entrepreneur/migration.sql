-- Fusion des offres Entrepreneur et Construction en une seule offre à 20 €/mois.
-- L'offre « construction » n'existe plus au catalogue : les lignes qui la portent
-- sont ramenées à « entrepreneur », qui contient désormais tout.
ALTER TABLE "participation_agreements" ALTER COLUMN "ecosystem_offre" SET DEFAULT 'entrepreneur';
UPDATE "participation_agreements" SET "ecosystem_offre" = 'entrepreneur' WHERE "ecosystem_offre" = 'construction';
UPDATE "subscriptions" SET "offre" = 'entrepreneur' WHERE "offre" = 'construction';
