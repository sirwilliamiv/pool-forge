-- CreateEnum
CREATE TYPE "SourceImageKind" AS ENUM ('SKETCH', 'SITE_PLAN', 'CONCEPT_RENDER', 'SITE_PHOTO', 'SCREENSHOT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ImageOrigin" AS ENUM ('BUILDER', 'CUSTOMER_INTAKE');

-- CreateEnum
CREATE TYPE "AnalysisStage" AS ENUM ('CLASSIFY', 'EXTRACT', 'CALIBRATE', 'TRANSLATE');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('PENDING', 'OK', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportSessionStatus" AS ENUM ('DRAFT', 'READY', 'APPLIED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "IntakeSubmissionStatus" AS ENUM ('NEW', 'REVIEWED', 'CONVERTED', 'DISCARDED');

-- AlterEnum
ALTER TYPE "ShapeKind" ADD VALUE 'POLYGON_POOL';

-- CreateTable
CREATE TABLE "SourceImage" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "projectId" TEXT,
    "kind" "SourceImageKind" NOT NULL DEFAULT 'UNKNOWN',
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "widthPx" INTEGER NOT NULL,
    "heightPx" INTEGER NOT NULL,
    "uploadedBy" TEXT,
    "origin" "ImageOrigin" NOT NULL DEFAULT 'BUILDER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageAnalysis" (
    "id" TEXT NOT NULL,
    "sourceImageId" TEXT NOT NULL,
    "stage" "AnalysisStage" NOT NULL,
    "extractorVersion" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptHash" TEXT NOT NULL,
    "rawJson" JSONB NOT NULL DEFAULT '{}',
    "parsedJson" JSONB NOT NULL DEFAULT '{}',
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "errorRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImageAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportSession" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "projectId" TEXT,
    "status" "ImportSessionStatus" NOT NULL DEFAULT 'DRAFT',
    "designIntentJson" JSONB NOT NULL DEFAULT '{}',
    "appliedAt" TIMESTAMP(3),
    "appliedCommandIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeLink" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntakeLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeSubmission" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "intakeLinkId" TEXT NOT NULL,
    "projectId" TEXT,
    "customerName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "status" "IntakeSubmissionStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntakeSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SourceImage_orgId_idx" ON "SourceImage"("orgId");

-- CreateIndex
CREATE INDEX "SourceImage_orgId_sha256_idx" ON "SourceImage"("orgId", "sha256");

-- CreateIndex
CREATE INDEX "SourceImage_projectId_idx" ON "SourceImage"("projectId");

-- CreateIndex
CREATE INDEX "ImageAnalysis_sourceImageId_idx" ON "ImageAnalysis"("sourceImageId");

-- CreateIndex
CREATE INDEX "ImageAnalysis_status_idx" ON "ImageAnalysis"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ImageAnalysis_sourceImageId_stage_extractorVersion_key" ON "ImageAnalysis"("sourceImageId", "stage", "extractorVersion");

-- CreateIndex
CREATE INDEX "ImportSession_orgId_idx" ON "ImportSession"("orgId");

-- CreateIndex
CREATE INDEX "ImportSession_projectId_idx" ON "ImportSession"("projectId");

-- CreateIndex
CREATE INDEX "ImportSession_orgId_status_updatedAt_idx" ON "ImportSession"("orgId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeLink_token_key" ON "IntakeLink"("token");

-- CreateIndex
CREATE INDEX "IntakeLink_orgId_idx" ON "IntakeLink"("orgId");

-- CreateIndex
CREATE INDEX "IntakeLink_orgId_active_idx" ON "IntakeLink"("orgId", "active");

-- CreateIndex
CREATE INDEX "IntakeSubmission_orgId_idx" ON "IntakeSubmission"("orgId");

-- CreateIndex
CREATE INDEX "IntakeSubmission_intakeLinkId_idx" ON "IntakeSubmission"("intakeLinkId");

-- CreateIndex
CREATE INDEX "IntakeSubmission_orgId_status_createdAt_idx" ON "IntakeSubmission"("orgId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "SourceImage" ADD CONSTRAINT "SourceImage_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceImage" ADD CONSTRAINT "SourceImage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceImage" ADD CONSTRAINT "SourceImage_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageAnalysis" ADD CONSTRAINT "ImageAnalysis_sourceImageId_fkey" FOREIGN KEY ("sourceImageId") REFERENCES "SourceImage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportSession" ADD CONSTRAINT "ImportSession_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportSession" ADD CONSTRAINT "ImportSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeLink" ADD CONSTRAINT "IntakeLink_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeSubmission" ADD CONSTRAINT "IntakeSubmission_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeSubmission" ADD CONSTRAINT "IntakeSubmission_intakeLinkId_fkey" FOREIGN KEY ("intakeLinkId") REFERENCES "IntakeLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeSubmission" ADD CONSTRAINT "IntakeSubmission_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
