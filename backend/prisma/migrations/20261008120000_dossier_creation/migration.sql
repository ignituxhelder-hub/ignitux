-- CreateTable
CREATE TABLE "creation_filings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'preparation',
    "checked_items" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deposited_at" TIMESTAMPTZ(6),
    "filing_reference" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "creation_filings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "creation_filings_project_id_key" ON "creation_filings"("project_id");

-- CreateIndex
CREATE INDEX "creation_filings_owner_id_idx" ON "creation_filings"("owner_id");

-- AddForeignKey
ALTER TABLE "creation_filings" ADD CONSTRAINT "creation_filings_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creation_filings" ADD CONSTRAINT "creation_filings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
