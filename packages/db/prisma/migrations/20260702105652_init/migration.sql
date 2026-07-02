-- CreateEnum
CREATE TYPE "BusinessRole" AS ENUM ('business_admin', 'media_admin', 'staff');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('image', 'video');

-- CreateEnum
CREATE TYPE "MediaEventType" AS ENUM ('download', 'share', 'view');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'expired', 'suspended');

-- CreateEnum
CREATE TYPE "BillingPeriod" AS ENUM ('monthly', 'quarterly', 'yearly');

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "billing_period" "BillingPeriod" NOT NULL DEFAULT 'monthly',
    "max_users" INTEGER NOT NULL DEFAULT 0,
    "max_storage_mb" INTEGER NOT NULL DEFAULT 0,
    "features" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "agency_name" TEXT,
    "city" TEXT,
    "logo_url" TEXT,
    "website" TEXT,
    "plan_id" UUID,
    "subscription_status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "subscription_start" TIMESTAMP(3),
    "subscription_end" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "mobile_no" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "BusinessRole" NOT NULL DEFAULT 'staff',
    "name" TEXT NOT NULL,
    "profile_pic_url" TEXT,
    "company_logo_url" TEXT,
    "agency_name" TEXT,
    "city" TEXT,
    "youtube" TEXT,
    "website" TEXT,
    "instagram" TEXT,
    "optional1" TEXT,
    "optional2" TEXT,
    "last_app_opened_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "super_admins" (
    "id" UUID NOT NULL,
    "mobile_no" TEXT NOT NULL,
    "email" TEXT,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "super_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "type" "MediaType" NOT NULL,
    "title" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_size" BIGINT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "uploaded_by" UUID,
    "scheduled_publish_at" TIMESTAMP(3),
    "published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_events" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "media_id" UUID,
    "user_id" UUID,
    "event_type" "MediaEventType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "businesses_plan_id_idx" ON "businesses"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_mobile_no_key" ON "users"("mobile_no");

-- CreateIndex
CREATE INDEX "users_business_id_idx" ON "users"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "super_admins_mobile_no_key" ON "super_admins"("mobile_no");

-- CreateIndex
CREATE UNIQUE INDEX "super_admins_email_key" ON "super_admins"("email");

-- CreateIndex
CREATE INDEX "media_business_id_idx" ON "media"("business_id");

-- CreateIndex
CREATE INDEX "media_business_id_type_idx" ON "media"("business_id", "type");

-- CreateIndex
CREATE INDEX "media_business_id_published_idx" ON "media"("business_id", "published");

-- CreateIndex
CREATE INDEX "media_scheduled_publish_at_idx" ON "media"("scheduled_publish_at");

-- CreateIndex
CREATE INDEX "media_events_business_id_idx" ON "media_events"("business_id");

-- CreateIndex
CREATE INDEX "media_events_business_id_media_id_idx" ON "media_events"("business_id", "media_id");

-- CreateIndex
CREATE INDEX "media_events_business_id_user_id_idx" ON "media_events"("business_id", "user_id");

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_events" ADD CONSTRAINT "media_events_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_events" ADD CONSTRAINT "media_events_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_events" ADD CONSTRAINT "media_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
