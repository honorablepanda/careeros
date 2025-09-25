/*
  Warnings:

  - You are about to drop the column `location` on the `Application` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `Application` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `Application` table. All the data in the column will be lost.
  - You are about to drop the column `source` on the `Application` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "public"."Application_company_role_idx";

-- DropIndex
DROP INDEX "public"."Application_userId_status_idx";

-- AlterTable
ALTER TABLE "public"."Application" DROP COLUMN "location",
DROP COLUMN "notes",
DROP COLUMN "role",
DROP COLUMN "source";

-- DropEnum
DROP TYPE "public"."ApplicationSource";
