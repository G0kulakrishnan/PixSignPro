-- Per-media share caption (typed by uploader) and per-user default caption fallback.
ALTER TABLE "media" ADD COLUMN "caption" TEXT;
ALTER TABLE "users" ADD COLUMN "share_message" TEXT;
