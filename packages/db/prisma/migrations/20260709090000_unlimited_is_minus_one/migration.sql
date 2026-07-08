-- Switch the "unlimited" sentinel for plan limits from 0 to -1.
-- Under the old convention 0 meant unlimited, so every existing 0 is converted
-- to -1 to preserve behaviour. After this, 0 means "none allowed" and -1 means
-- "unlimited".

UPDATE "subscription_plans" SET "max_users"      = -1 WHERE "max_users"      = 0;
UPDATE "subscription_plans" SET "max_storage_mb" = -1 WHERE "max_storage_mb" = 0;
UPDATE "subscription_plans" SET "max_images"     = -1 WHERE "max_images"     = 0;
UPDATE "subscription_plans" SET "max_videos"     = -1 WHERE "max_videos"     = 0;

-- New rows default to unlimited (-1).
ALTER TABLE "subscription_plans" ALTER COLUMN "max_users"      SET DEFAULT -1;
ALTER TABLE "subscription_plans" ALTER COLUMN "max_storage_mb" SET DEFAULT -1;
ALTER TABLE "subscription_plans" ALTER COLUMN "max_images"     SET DEFAULT -1;
ALTER TABLE "subscription_plans" ALTER COLUMN "max_videos"     SET DEFAULT -1;
