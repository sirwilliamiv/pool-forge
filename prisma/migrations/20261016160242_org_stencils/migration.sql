-- CreateEnum
CREATE TYPE "OrgStencilSource" AS ENUM ('VISIO_IMPORT', 'SAVED_SELECTION');

-- CreateEnum
CREATE TYPE "StencilImportStatus" AS ENUM ('PENDING', 'COMMITTED', 'DISCARDED');

-- CreateTable
CREATE TABLE "OrgStencil" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "StencilCategory" NOT NULL,
    "shapeKind" "ShapeKind" NOT NULL,
    "rings" JSONB NOT NULL DEFAULT '[]',
    "widthIn" DOUBLE PRECISION NOT NULL,
    "heightIn" DOUBLE PRECISION NOT NULL,
    "fill" TEXT NOT NULL,
    "stroke" TEXT NOT NULL,
    "thumbnailSvg" TEXT NOT NULL,
    "source" "OrgStencilSource" NOT NULL,
    "sourceFile" TEXT,
    "sourceMaster" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgStencil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StencilImport" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "scaleInchesPerInch" DOUBLE PRECISION NOT NULL,
    "candidatesJson" JSONB NOT NULL DEFAULT '[]',
    "skippedJson" JSONB NOT NULL DEFAULT '[]',
    "status" "StencilImportStatus" NOT NULL DEFAULT 'PENDING',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StencilImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrgStencil_orgId_category_idx" ON "OrgStencil"("orgId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "OrgStencil_orgId_name_key" ON "OrgStencil"("orgId", "name");

-- CreateIndex
CREATE INDEX "StencilImport_orgId_status_idx" ON "StencilImport"("orgId", "status");

-- AddForeignKey
ALTER TABLE "OrgStencil" ADD CONSTRAINT "OrgStencil_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgStencil" ADD CONSTRAINT "OrgStencil_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StencilImport" ADD CONSTRAINT "StencilImport_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
