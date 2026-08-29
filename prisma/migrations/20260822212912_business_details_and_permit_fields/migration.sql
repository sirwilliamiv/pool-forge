-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "address" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "licenseNumber" TEXT,
ADD COLUMN     "paymentSchedule" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "proposalTerms" TEXT,
ADD COLUMN     "proposalValidDays" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "jobNumber" INTEGER,
ADD COLUMN     "jurisdiction" TEXT,
ADD COLUMN     "parcelId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Project_orgId_jobNumber_key" ON "Project"("orgId", "jobNumber");

