-- CreateEnum
CREATE TYPE "DesignVersionSource" AS ENUM ('BUILDER', 'CUSTOMER');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "activeVersionId" TEXT;

-- CreateTable
CREATE TABLE "DesignVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "source" "DesignVersionSource" NOT NULL DEFAULT 'BUILDER',
    "createdById" TEXT,
    "createdByName" TEXT,
    "rootJson" JSONB NOT NULL DEFAULT '{}',
    "totalCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesignVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DesignVersion_projectId_createdAt_idx" ON "DesignVersion"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "DesignVersion_orgId_idx" ON "DesignVersion"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_activeVersionId_key" ON "Project"("activeVersionId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_activeVersionId_fkey" FOREIGN KEY ("activeVersionId") REFERENCES "DesignVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignVersion" ADD CONSTRAINT "DesignVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignVersion" ADD CONSTRAINT "DesignVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

