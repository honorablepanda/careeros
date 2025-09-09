-- CreateEnum
CREATE TYPE "public"."ApplicationStatus" AS ENUM ('APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN', 'HIRED');

-- CreateEnum
CREATE TYPE "public"."ApplicationSource" AS ENUM ('JOB_BOARD', 'REFERRAL', 'COMPANY_WEBSITE', 'RECRUITER', 'OTHER');

-- CreateTable
CREATE TABLE "public"."Application" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "location" TEXT,
    "status" "public"."ApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "source" "public"."ApplicationSource" NOT NULL DEFAULT 'OTHER',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Application_userId_status_idx" ON "public"."Application"("userId", "status");

-- CreateIndex
CREATE INDEX "Application_company_role_idx" ON "public"."Application"("company", "role");
