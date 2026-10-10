-- Immatriculation : fiche d'identité légale de l'entreprise créée, et
-- mentions de l'émetteur figées à l'émission des devis/factures.
-- Additive uniquement : une table neuve et une colonne nullable.

-- AlterTable
ALTER TABLE "billing_documents" ADD COLUMN "issuer_details" TEXT;

-- CreateTable
CREATE TABLE "company_registrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "siren" TEXT NOT NULL,
    "siret" TEXT,
    "vat_number" TEXT,
    "legal_name" TEXT NOT NULL,
    "head_office" TEXT NOT NULL,
    "registered_on" DATE NOT NULL,
    "capital_entry_id" UUID,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "company_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_registrations_project_id_key" ON "company_registrations"("project_id");

-- CreateIndex
CREATE INDEX "company_registrations_owner_id_idx" ON "company_registrations"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_registrations_owner_id_siren_key" ON "company_registrations"("owner_id", "siren");

-- AddForeignKey
ALTER TABLE "company_registrations" ADD CONSTRAINT "company_registrations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_registrations" ADD CONSTRAINT "company_registrations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
