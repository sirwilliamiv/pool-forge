-- AlterTable
ALTER TABLE "ImportSession" ADD COLUMN     "analysisStatus" TEXT NOT NULL DEFAULT 'NONE';

-- CreateTable
CREATE TABLE "IntakeRateCounter" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "bucketKey" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntakeRateCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntakeRateCounter_expiresAt_idx" ON "IntakeRateCounter"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeRateCounter_scope_bucketKey_windowStart_key" ON "IntakeRateCounter"("scope", "bucketKey", "windowStart");

-- CreateIndex
CREATE INDEX "ImportSession_analysisStatus_createdAt_idx" ON "ImportSession"("analysisStatus", "createdAt");
