-- Legacy mobile-app compatibility: integer surrogate keys.
-- Adding a SERIAL column backfills existing rows sequentially from the sequence,
-- so pre-existing businesses/users/media all receive stable integer ids.

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN "legacy_id" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN "legacy_id" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "media" ADD COLUMN "legacy_id" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "businesses_legacy_id_key" ON "businesses"("legacy_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_legacy_id_key" ON "users"("legacy_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_legacy_id_key" ON "media"("legacy_id");
