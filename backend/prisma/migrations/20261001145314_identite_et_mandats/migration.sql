-- CreateTable
CREATE TABLE "identity_verifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "document_type" TEXT NOT NULL,
    "document_front" BYTEA NOT NULL,
    "document_back" BYTEA,
    "extracted_first_name" TEXT,
    "extracted_last_name" TEXT,
    "extracted_birth_date" DATE,
    "extracted_document_number" TEXT,
    "extracted_expiry_date" DATE,
    "mrz_checksum_valid" BOOLEAN,
    "name_matches_account" BOOLEAN,
    "status" TEXT NOT NULL DEFAULT 'en_attente',
    "rejection_reason" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mandates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "identity_verification_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "mandate_text" TEXT,
    "signed_full_name" TEXT,
    "signed_at" TIMESTAMPTZ(6),
    "signer_ip" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mandates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "identity_verifications_owner_id_idx" ON "identity_verifications"("owner_id");

-- CreateIndex
CREATE INDEX "mandates_owner_id_idx" ON "mandates"("owner_id");

-- CreateIndex
CREATE INDEX "mandates_project_id_idx" ON "mandates"("project_id");

-- AddForeignKey
ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_identity_verification_id_fkey" FOREIGN KEY ("identity_verification_id") REFERENCES "identity_verifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
