-- AlterEnum
-- Adds two new business roles:
--   user_creation_admin — can create staff users only (no list/edit/delete); views media like staff
--   user_full_admin     — can list/create/edit/delete staff users; views media like staff
-- This migration adds more than one value to an enum. On PostgreSQL 12+ this runs fine;
-- ADD VALUE appends to the end of the enum type.
ALTER TYPE "BusinessRole" ADD VALUE IF NOT EXISTS 'user_full_admin';
ALTER TYPE "BusinessRole" ADD VALUE IF NOT EXISTS 'user_creation_admin';
