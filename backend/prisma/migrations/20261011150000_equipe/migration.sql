-- Équipe : inviter des membres dans son espace, chacun avec un rôle.
-- Spec : docs/superpowers/specs/2026-10-11-equipe-design.md
-- Purement additive : trois tables neuves, aucune colonne ni table existante
-- n'est modifiée.

-- CreateTable
CREATE TABLE "space_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "space_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "space_invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "accepted_by" UUID,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "space_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "space_activity" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "actor_id" UUID,
    "methode" TEXT NOT NULL,
    "chemin" TEXT NOT NULL,
    "statut" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "space_activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "space_members_owner_id_member_id_key" ON "space_members"("owner_id", "member_id");

-- CreateIndex
CREATE INDEX "space_members_owner_id_idx" ON "space_members"("owner_id");

-- CreateIndex
CREATE INDEX "space_members_member_id_idx" ON "space_members"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "space_invitations_token_hash_key" ON "space_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "space_invitations_owner_id_idx" ON "space_invitations"("owner_id");

-- CreateIndex
CREATE INDEX "space_activity_owner_id_created_at_idx" ON "space_activity"("owner_id", "created_at");

-- AddForeignKey
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_invitations" ADD CONSTRAINT "space_invitations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_invitations" ADD CONSTRAINT "space_invitations_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_activity" ADD CONSTRAINT "space_activity_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_activity" ADD CONSTRAINT "space_activity_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
