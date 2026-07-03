-- Per-user access expiry (null = no user-level expiry; business expiry still applies).
ALTER TABLE "users" ADD COLUMN "expires_at" TIMESTAMPTZ;
