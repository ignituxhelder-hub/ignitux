-- Questionnaire de projet et CV décrit.
-- Purement additif : une colonne nullable, quatre tables neuves, aucun
-- remplissage. Les comptes et projets existants n'ont simplement pas encore
-- répondu.

-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN "current_situation" TEXT;

-- CreateTable
CREATE TABLE "user_experiences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "poste" TEXT NOT NULL,
    "entreprise" TEXT,
    "debut" TEXT,
    "fin" TEXT,
    "en_cours" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_experiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_formations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "diplome" TEXT NOT NULL,
    "etablissement" TEXT,
    "annee" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_formations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_questionnaires" (
    "project_id" UUID NOT NULL,
    "reponses" JSONB NOT NULL DEFAULT '{}',
    "termine_le" TIMESTAMPTZ(6),
    "questions_igini_le" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "project_questionnaires_pkey" PRIMARY KEY ("project_id")
);

-- CreateTable
CREATE TABLE "project_igini_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "pourquoi" TEXT,
    "reponse" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_igini_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_experiences_user_id_position_idx" ON "user_experiences"("user_id", "position");

-- CreateIndex
CREATE INDEX "user_formations_user_id_position_idx" ON "user_formations"("user_id", "position");

-- CreateIndex
CREATE INDEX "project_igini_questions_project_id_position_idx" ON "project_igini_questions"("project_id", "position");

-- AddForeignKey
ALTER TABLE "user_experiences" ADD CONSTRAINT "user_experiences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_formations" ADD CONSTRAINT "user_formations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_questionnaires" ADD CONSTRAINT "project_questionnaires_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_igini_questions" ADD CONSTRAINT "project_igini_questions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
