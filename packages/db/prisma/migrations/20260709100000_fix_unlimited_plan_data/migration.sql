-- The previous migration's data UPDATEs were silent no-ops: subscription_plans
-- has FORCE ROW LEVEL SECURITY and its write policy requires app.bypass_rls='on'.
-- Plain migration SQL runs as the non-superuser app role without that flag, so
-- the rows were RLS-filtered out of the UPDATE (0 rows changed) while the
-- ALTER TABLE default changes still applied.
--
-- Re-run the 0 -> -1 conversion with the bypass flag set for this transaction so
-- existing "unlimited" plans (old convention: 0) are preserved as -1. Idempotent.
SET LOCAL app.bypass_rls = 'on';
UPDATE "subscription_plans" SET "max_users"      = -1 WHERE "max_users"      = 0;
UPDATE "subscription_plans" SET "max_storage_mb" = -1 WHERE "max_storage_mb" = 0;
UPDATE "subscription_plans" SET "max_images"     = -1 WHERE "max_images"     = 0;
UPDATE "subscription_plans" SET "max_videos"     = -1 WHERE "max_videos"     = 0;
