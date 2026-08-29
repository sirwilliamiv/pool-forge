-- CreateEnum
CREATE TYPE "CommandSource" AS ENUM ('UI', 'VOICE', 'API', 'IMPORT', 'CRON');

-- AlterTable
ALTER TABLE "CommandAuditLog" ADD COLUMN     "source" "CommandSource" NOT NULL DEFAULT 'UI';

-- CreateIndex
CREATE INDEX "CommandAuditLog_orgId_source_ranAt_idx" ON "CommandAuditLog"("orgId", "source", "ranAt");
