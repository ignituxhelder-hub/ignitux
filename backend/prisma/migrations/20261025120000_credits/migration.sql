-- Crédits IGINI : le journal des crédits (bienvenue, recharges, ajustements,
-- débits des actions IGINI, remboursements des échecs).
-- Spec : docs/superpowers/specs/2026-10-25-credits-design.md
-- Purement additive : une table neuve, aucune colonne ni table existante n'est
-- modifiée, aucune ligne n'est écrite. Les 30 crédits de bienvenue des comptes
-- existants sont versés par l'application, une fois, à la première lecture du
-- solde (voir CreditsService) — pas par cette migration.

-- CreateTable
CREATE TABLE "credit_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "actor_id" UUID,
    "kind" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "generator" TEXT,
    "project_id" UUID,
    "ai_usage_event_id" UUID,
    "motif" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credit_entries_owner_id_created_at_idx" ON "credit_entries"("owner_id", "created_at");

-- AddForeignKey
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
