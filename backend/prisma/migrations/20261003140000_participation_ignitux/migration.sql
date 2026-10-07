-- CreateTable
CREATE TABLE "participation_agreements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "founder_holder_id" UUID NOT NULL,
    "ignitux_holder_id" UUID NOT NULL,
    "initial_founder_bps" INTEGER NOT NULL,
    "initial_ignitux_bps" INTEGER NOT NULL,
    "dividend_right_bps" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'actif',
    "effective_on" DATE NOT NULL,
    "contract_reference" TEXT,
    "ecosystem_offre" TEXT NOT NULL DEFAULT 'construction',
    "transmitted_on" DATE,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "participation_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participation_milestones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agreement_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT,
    "target_ignitux_bps" INTEGER NOT NULL,
    "conditions" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'prevu',
    "validated_at" TIMESTAMPTZ(6),
    "validated_by" UUID,
    "validation_note" TEXT,
    "founder_acknowledged_at" TIMESTAMPTZ(6),
    "effective_on" DATE,
    "executed_at" TIMESTAMPTZ(6),
    "equity_event_ids" TEXT[],
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participation_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dividend_right_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agreement_id" UUID NOT NULL,
    "distributed_cents" INTEGER NOT NULL,
    "right_bps" INTEGER NOT NULL,
    "due_cents" INTEGER NOT NULL,
    "occurred_on" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'du',
    "settled_on" DATE,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dividend_right_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "participation_agreements_project_id_key" ON "participation_agreements"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "participation_agreements_founder_holder_id_key" ON "participation_agreements"("founder_holder_id");

-- CreateIndex
CREATE UNIQUE INDEX "participation_agreements_ignitux_holder_id_key" ON "participation_agreements"("ignitux_holder_id");

-- CreateIndex
CREATE INDEX "participation_agreements_status_idx" ON "participation_agreements"("status");

-- CreateIndex
CREATE INDEX "participation_milestones_agreement_id_idx" ON "participation_milestones"("agreement_id");

-- CreateIndex
CREATE UNIQUE INDEX "participation_milestones_agreement_id_position_key" ON "participation_milestones"("agreement_id", "position");

-- CreateIndex
CREATE INDEX "dividend_right_entries_agreement_id_idx" ON "dividend_right_entries"("agreement_id");

-- AddForeignKey
ALTER TABLE "participation_agreements" ADD CONSTRAINT "participation_agreements_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participation_agreements" ADD CONSTRAINT "participation_agreements_founder_holder_id_fkey" FOREIGN KEY ("founder_holder_id") REFERENCES "equity_holders"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participation_agreements" ADD CONSTRAINT "participation_agreements_ignitux_holder_id_fkey" FOREIGN KEY ("ignitux_holder_id") REFERENCES "equity_holders"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participation_milestones" ADD CONSTRAINT "participation_milestones_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "participation_agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dividend_right_entries" ADD CONSTRAINT "dividend_right_entries_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "participation_agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

