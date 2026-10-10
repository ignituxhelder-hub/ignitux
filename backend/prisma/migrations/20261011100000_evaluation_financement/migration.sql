
-- CreateTable
CREATE TABLE "financing_evaluations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'en_preparation',
    "verdict" TEXT,
    "report" JSONB,
    "ai_draft" JSONB,
    "admin_note" TEXT,
    "refusal_reason" TEXT,
    "redo_instruction" TEXT,
    "failure_reason" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "financing_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financing_evaluation_edits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "evaluation_id" UUID NOT NULL,
    "editor_id" UUID,
    "section" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financing_evaluation_edits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financing_evaluations_project_id_created_at_idx" ON "financing_evaluations"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "financing_evaluations_status_created_at_idx" ON "financing_evaluations"("status", "created_at");

-- CreateIndex
CREATE INDEX "financing_evaluation_edits_evaluation_id_idx" ON "financing_evaluation_edits"("evaluation_id");

-- AddForeignKey
ALTER TABLE "financing_evaluations" ADD CONSTRAINT "financing_evaluations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financing_evaluations" ADD CONSTRAINT "financing_evaluations_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financing_evaluations" ADD CONSTRAINT "financing_evaluations_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financing_evaluation_edits" ADD CONSTRAINT "financing_evaluation_edits_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "financing_evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financing_evaluation_edits" ADD CONSTRAINT "financing_evaluation_edits_editor_id_fkey" FOREIGN KEY ("editor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
