-- Réseaux sociaux : comptes Instagram et TikTok connectés, publications
-- préparées puis envoyées après confirmation. Rien n'existe en base avant :
-- deux tables neuves, aucune donnée touchée.

CREATE TABLE "social_accounts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "owner_id" UUID NOT NULL,
  "platform" TEXT NOT NULL,
  "platform_account_id" TEXT NOT NULL,
  "username" TEXT,
  -- Vidé à la déconnexion : un compte déconnecté ne garde aucun jeton.
  "access_token_chiffre" TEXT,
  "token_expires_at" TIMESTAMPTZ(6),
  -- TikTok : le jeton d'accès ne vit que 24 h, celui-ci le renouvelle.
  "refresh_token_chiffre" TEXT,
  "refresh_expires_at" TIMESTAMPTZ(6),
  "connected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disconnected_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_accounts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "social_accounts_owner_id_platform_key" ON "social_accounts"("owner_id", "platform");
CREATE INDEX "social_accounts_owner_id_idx" ON "social_accounts"("owner_id");

CREATE TABLE "social_posts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "owner_id" UUID NOT NULL,
  "platform" TEXT NOT NULL,
  "caption" TEXT NOT NULL,
  "media_url" TEXT NOT NULL,
  "media_type" TEXT NOT NULL,
  "media_duration_seconds" INTEGER,
  "privacy_level" TEXT,
  "allow_comments" BOOLEAN NOT NULL DEFAULT false,
  "allow_duet" BOOLEAN NOT NULL DEFAULT false,
  "allow_stitch" BOOLEAN NOT NULL DEFAULT false,
  "brand_organic" BOOLEAN NOT NULL DEFAULT false,
  "brand_content" BOOLEAN NOT NULL DEFAULT false,
  "music_consent_at" TIMESTAMPTZ(6),
  "status" TEXT NOT NULL DEFAULT 'draft',
  "platform_post_id" TEXT,
  -- Instagram vidéo : le conteneur que Meta prépare avant la publication.
  "media_container_id" TEXT,
  "error" TEXT,
  "published_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "social_posts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_posts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "social_posts_owner_id_created_at_idx" ON "social_posts"("owner_id", "created_at");
CREATE INDEX "social_posts_owner_id_platform_status_idx" ON "social_posts"("owner_id", "platform", "status");
