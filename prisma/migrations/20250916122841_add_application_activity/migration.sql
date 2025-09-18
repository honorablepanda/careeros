/*
  Safe & idempotent migration
  - Adds Application.title (nullable → backfill → NOT NULL)
  - Creates User table (if missing) + seeds from Application.userId
  - Wires Application → User FK AFTER seeding
  - Creates ApplicationActivity enum/table/index (if missing) + FK
  - Defers destructive drops (commented)

  This version tolerates partial/previous attempts by checking for existence.
*/

-- ======================================================
-- ApplicationActivity enum (guarded)
-- ======================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'ApplicationActivityType'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."ApplicationActivityType" AS ENUM ('CREATE', 'STATUS_CHANGE');
  END IF;
END$$;

-- ======================================================
-- ApplicationActivity table (guarded)
-- ======================================================
CREATE TABLE IF NOT EXISTS "public"."ApplicationActivity" (
  "id"            TEXT        NOT NULL,
  "applicationId" TEXT        NOT NULL,
  "type"          "public"."ApplicationActivityType" NOT NULL,
  "payload"       JSONB,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApplicationActivity_pkey" PRIMARY KEY ("id")
);

-- Index (guarded)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'ApplicationActivity_applicationId_createdAt_idx'
  ) THEN
    CREATE INDEX "ApplicationActivity_applicationId_createdAt_idx"
      ON "public"."ApplicationActivity" ("applicationId", "createdAt" DESC);
  END IF;
END$$;

-- ======================================================
-- Application table adjustments (SAFE pattern)
-- ======================================================

-- If Prisma generated destructive changes, keep them deferred for now:
-- DROP INDEX "public"."Application_company_role_idx";
-- DROP INDEX "public"."Application_userId_status_idx";
-- ALTER TABLE "public"."Application"
--   DROP COLUMN "location",
--   DROP COLUMN "notes",
--   DROP COLUMN "role",
--   DROP COLUMN "source",
--   ADD COLUMN "title" TEXT NOT NULL;

-- 1) Add title as nullable first (guarded)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'Application'
      AND column_name  = 'title'
  ) THEN
    ALTER TABLE "public"."Application" ADD COLUMN "title" TEXT;
  END IF;
END$$;

-- 2) Backfill existing rows (prefer prior "role" if present; else 'Unknown')
UPDATE "public"."Application"
SET "title" = COALESCE("title", NULLIF("role", ''), 'Unknown')
WHERE "title" IS NULL;

-- 3) Only now make it NOT NULL
ALTER TABLE "public"."Application"
  ALTER COLUMN "title" SET NOT NULL;

-- Helpful indexes (guarded)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='Application_userId_idx'
  ) THEN
    CREATE INDEX "Application_userId_idx" ON "public"."Application" ("userId");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='Application_status_updatedAt_idx'
  ) THEN
    CREATE INDEX "Application_status_updatedAt_idx"
      ON "public"."Application" ("status", "updatedAt" DESC);
  END IF;
END$$;

-- ======================================================
-- User table + seed + FK (all guarded)
-- ======================================================

-- Create User table (guarded)
CREATE TABLE IF NOT EXISTS "public"."User" (
  "id"        TEXT        NOT NULL,
  "email"     TEXT        NOT NULL,
  "name"      TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- Unique index on email (guarded)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='User_email_key'
  ) THEN
    CREATE UNIQUE INDEX "User_email_key" ON "public"."User" ("email");
  END IF;
END$$;

-- Seed missing users from existing Application.userId values
INSERT INTO "public"."User" ("id", "email", "name", "createdAt", "updatedAt")
SELECT DISTINCT a."userId",
       (a."userId" || '@local.invalid')::text AS email,
       NULL,
       NOW(),
       NOW()
FROM "public"."Application" a
WHERE a."userId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "public"."User" u WHERE u."id" = a."userId"
  );

-- Add/ensure FK after seeding (guarded)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    WHERE tc.constraint_schema = 'public'
      AND tc.table_name = 'Application'
      AND tc.constraint_name = 'Application_userId_fkey'
  ) THEN
    ALTER TABLE "public"."Application"
      ADD CONSTRAINT "Application_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "public"."User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

-- ======================================================
-- FK for ApplicationActivity → Application (guarded)
-- ======================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    WHERE tc.constraint_schema = 'public'
      AND tc.table_name = 'ApplicationActivity'
      AND tc.constraint_name = 'ApplicationActivity_applicationId_fkey'
  ) THEN
    ALTER TABLE "public"."ApplicationActivity"
      ADD CONSTRAINT "ApplicationActivity_applicationId_fkey"
      FOREIGN KEY ("applicationId") REFERENCES "public"."Application"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

-- ======================================================
-- Deferred clean-ups (optional later)
-- ======================================================
-- ALTER TABLE "public"."Application" DROP COLUMN "location";
-- ALTER TABLE "public"."Application" DROP COLUMN "notes";
-- ALTER TABLE "public"."Application" DROP COLUMN "role";
-- ALTER TABLE "public"."Application" DROP COLUMN "source";
-- DROP TYPE "public"."ApplicationSource";
