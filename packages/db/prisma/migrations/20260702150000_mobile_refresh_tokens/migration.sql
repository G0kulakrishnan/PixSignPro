-- Mobile API secure refresh tokens table.
-- Opaque refresh tokens (SHA-256 hash stored). Not tenant-scoped; no RLS needed.

CREATE TABLE "mobile_refresh_tokens" (
    "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
    "user_id"    UUID        NOT NULL,
    "token_hash" TEXT        NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mobile_refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mobile_refresh_tokens_token_hash_key" ON "mobile_refresh_tokens"("token_hash");
CREATE INDEX "mobile_refresh_tokens_user_id_idx" ON "mobile_refresh_tokens"("user_id");

ALTER TABLE "mobile_refresh_tokens"
    ADD CONSTRAINT "mobile_refresh_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
