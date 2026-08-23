-- CreateTable
CREATE TABLE "SiteCapture" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "captureId" TEXT NOT NULL,
    "cols" INTEGER NOT NULL,
    "rows" INTEGER NOT NULL,
    "cellSizeIn" DOUBLE PRECISION NOT NULL,
    "originXIn" DOUBLE PRECISION NOT NULL,
    "originYIn" DOUBLE PRECISION NOT NULL,
    "benchmarkXIn" DOUBLE PRECISION NOT NULL,
    "benchmarkYIn" DOUBLE PRECISION NOT NULL,
    "datumFt" DOUBLE PRECISION NOT NULL,
    "benchmarkLabel" TEXT,
    "elevationsFt" BYTEA NOT NULL,
    "coverage" BYTEA NOT NULL,
    "measuredCells" INTEGER NOT NULL,
    "shotCount" INTEGER NOT NULL,
    "maxErrorFt" DOUBLE PRECISION NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteCapture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteCapture_orgId_idx" ON "SiteCapture"("orgId");

-- CreateIndex
CREATE INDEX "SiteCapture_projectId_capturedAt_idx" ON "SiteCapture"("projectId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SiteCapture_orgId_captureId_key" ON "SiteCapture"("orgId", "captureId");

-- AddForeignKey
ALTER TABLE "SiteCapture" ADD CONSTRAINT "SiteCapture_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteCapture" ADD CONSTRAINT "SiteCapture_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
