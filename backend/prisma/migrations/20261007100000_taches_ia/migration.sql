-- AlterTable (additif : 5 colonnes nullables, aucune donnee existante touchee)
ALTER TABLE "tasks" ADD COLUMN "ai_status" TEXT,
ADD COLUMN "ai_result_kind" TEXT,
ADD COLUMN "ai_result" TEXT,
ADD COLUMN "ai_refusal_reason" TEXT,
ADD COLUMN "ai_run_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "project_compliance_ai_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "requirement_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "result_kind" TEXT,
    "result" TEXT,
    "refusal_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "project_compliance_ai_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_compliance_ai_runs_project_id_idx" ON "project_compliance_ai_runs"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_compliance_ai_runs_project_id_requirement_id_key" ON "project_compliance_ai_runs"("project_id", "requirement_id");

-- AddForeignKey
ALTER TABLE "project_compliance_ai_runs" ADD CONSTRAINT "project_compliance_ai_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_compliance_ai_runs" ADD CONSTRAINT "project_compliance_ai_runs_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "compliance_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
