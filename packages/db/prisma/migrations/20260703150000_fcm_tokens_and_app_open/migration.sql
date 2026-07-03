-- Add 'app_open' analytics event type (app opened without media interaction).
-- IF NOT EXISTS makes this idempotent; PG17 allows ADD VALUE inside a transaction
-- as long as the new value isn't used in the same transaction (it isn't here).
ALTER TYPE "MediaEventType" ADD VALUE IF NOT EXISTS 'app_open';

-- FCM device tokens for push notifications (tenant-scoped).
CREATE TABLE "fcm_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "device_type" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "fcm_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fcm_tokens_token_key" ON "fcm_tokens"("token");
CREATE INDEX "fcm_tokens_business_id_idx" ON "fcm_tokens"("business_id");
CREATE INDEX "fcm_tokens_user_id_idx" ON "fcm_tokens"("user_id");

ALTER TABLE "fcm_tokens" ADD CONSTRAINT "fcm_tokens_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fcm_tokens" ADD CONSTRAINT "fcm_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security: isolate fcm_tokens by tenant (same pattern as other tenant tables).
ALTER TABLE "fcm_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fcm_tokens" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fcm_tokens_isolation ON "fcm_tokens";
CREATE POLICY fcm_tokens_isolation ON "fcm_tokens"
  USING (
    business_id = NULLIF(current_setting('app.current_business_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    business_id = NULLIF(current_setting('app.current_business_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  );
