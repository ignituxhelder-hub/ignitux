-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "confirmed_legal_form" TEXT;

-- CreateTable
CREATE TABLE "company_bylaws" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "legal_form" TEXT NOT NULL,
    "capital_cents" INTEGER NOT NULL,
    "head_office" TEXT NOT NULL,
    "duration_years" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'brouillon',
    "finalized_at" TIMESTAMPTZ(6),
    "generated_by" TEXT NOT NULL DEFAULT 'igini',
    "generated_model" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "company_bylaws_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bylaw_associates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bylaws_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "share_basis_points" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bylaw_associates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_bylaws_project_id_key" ON "company_bylaws"("project_id");

-- CreateIndex
CREATE INDEX "company_bylaws_owner_id_idx" ON "company_bylaws"("owner_id");

-- CreateIndex
CREATE INDEX "bylaw_associates_bylaws_id_idx" ON "bylaw_associates"("bylaws_id");

-- AddForeignKey
ALTER TABLE "company_bylaws" ADD CONSTRAINT "company_bylaws_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_bylaws" ADD CONSTRAINT "company_bylaws_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bylaw_associates" ADD CONSTRAINT "bylaw_associates_bylaws_id_fkey" FOREIGN KEY ("bylaws_id") REFERENCES "company_bylaws"("id") ON DELETE CASCADE ON UPDATE CASCADE;

