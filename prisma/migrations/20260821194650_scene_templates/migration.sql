-- CreateTable
CREATE TABLE "SceneTemplate" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "objectCount" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SceneTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SceneTemplate_orgId_isDefault_idx" ON "SceneTemplate"("orgId", "isDefault");

-- CreateIndex
CREATE INDEX "SceneTemplate_orgId_updatedAt_idx" ON "SceneTemplate"("orgId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SceneTemplate_orgId_name_key" ON "SceneTemplate"("orgId", "name");

-- AddForeignKey
ALTER TABLE "SceneTemplate" ADD CONSTRAINT "SceneTemplate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SceneTemplate" ADD CONSTRAINT "SceneTemplate_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
