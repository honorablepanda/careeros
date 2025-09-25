-- CreateEnum
CREATE TYPE "public"."ApplicationActivityType" AS ENUM ('CREATE', 'STATUS_CHANGE');

-- CreateTable
CREATE TABLE "public"."ApplicationActivity" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "type" "public"."ApplicationActivityType" NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApplicationActivity_applicationId_createdAt_idx" ON "public"."ApplicationActivity"("applicationId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "public"."ApplicationActivity" ADD CONSTRAINT "ApplicationActivity_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "public"."Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
