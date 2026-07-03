-- Plan limits by media count (in addition to max_users). 0 = unlimited.
ALTER TABLE "subscription_plans" ADD COLUMN "max_images" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "subscription_plans" ADD COLUMN "max_videos" INTEGER NOT NULL DEFAULT 0;
