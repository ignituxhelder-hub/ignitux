
-- CreateTable
CREATE TABLE "legal_form_recommendations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "recommended_form" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "points_to_check" TEXT[],
    "generated_by" TEXT NOT NULL DEFAULT 'igini',
    "generated_model" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_form_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_form_assumptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recommendation_id" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "assumption" TEXT NOT NULL,
    "how_to_correct" TEXT NOT NULL,

    CONSTRAINT "legal_form_assumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_form_alternatives" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recommendation_id" UUID NOT NULL,
    "form" TEXT NOT NULL,
    "why_not_chosen" TEXT NOT NULL,

    CONSTRAINT "legal_form_alternatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_form_sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recommendation_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,

    CONSTRAINT "legal_form_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "legal_form_recommendations_project_id_idx" ON "legal_form_recommendations"("project_id");

-- CreateIndex
CREATE INDEX "legal_form_assumptions_recommendation_id_idx" ON "legal_form_assumptions"("recommendation_id");

-- CreateIndex
CREATE INDEX "legal_form_alternatives_recommendation_id_idx" ON "legal_form_alternatives"("recommendation_id");

-- CreateIndex
CREATE INDEX "legal_form_sources_recommendation_id_idx" ON "legal_form_sources"("recommendation_id");

-- AddForeignKey
ALTER TABLE "legal_form_recommendations" ADD CONSTRAINT "legal_form_recommendations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_form_assumptions" ADD CONSTRAINT "legal_form_assumptions_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "legal_form_recommendations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_form_alternatives" ADD CONSTRAINT "legal_form_alternatives_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "legal_form_recommendations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_form_sources" ADD CONSTRAINT "legal_form_sources_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "legal_form_recommendations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

