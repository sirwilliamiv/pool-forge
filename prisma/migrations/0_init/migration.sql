-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'READY_FOR_REVIEW', 'PROPOSAL_SENT', 'APPROVED', 'CONSTRUCTION_READY', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MaterialKind" AS ENUM ('POOL_WATER', 'CONCRETE_DECK', 'PAVER_DECK', 'GRASS', 'COPING', 'SCREEN', 'LANAI', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PriceCategory" AS ENUM ('POOL', 'SPA', 'DECK', 'COPING', 'EQUIPMENT', 'LIGHTING', 'SCREEN', 'BENCH', 'DRAIN', 'ELECTRICAL', 'WATER_FEATURE', 'FENCE', 'WALL', 'LANAI', 'MISC');

-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('SQFT', 'LF', 'EACH', 'LUMP', 'HOUR');

-- CreateEnum
CREATE TYPE "ExportKind" AS ENUM ('CUSTOMER_PROPOSAL', 'CONSTRUCTION_PACKET', 'SITE_PLAN', 'SCREEN_ENCLOSURE_QUOTE', 'IMAGE');

-- CreateEnum
CREATE TYPE "StencilCategory" AS ENUM ('POOL_SHAPE', 'INTERIOR_FEATURE', 'DECK_HOUSE', 'CONSTRUCTION_SYMBOL', 'WATER_OUTDOOR');

-- CreateEnum
CREATE TYPE "MeasurementBehavior" AS ENUM ('POOL_AREA_PERIMETER_GALLONS', 'SPA_AREA_PERIMETER_GALLONS', 'BENCH_LINEAR_FEET', 'SHELF_AREA', 'FEATURE_COUNT', 'DECK_AREA', 'LANAI_AREA', 'COPING_LINEAR_FEET', 'DECO_DRAIN_LINEAR_FEET', 'SCREEN_AREA', 'FENCE_LINEAR_FEET', 'WALL_LINEAR_FEET', 'POINT_MARKER', 'DIMENSION_LINE', 'NONE');

-- CreateEnum
CREATE TYPE "PricingBehavior" AS ENUM ('POOL_BASE', 'SPA_BASE', 'FEATURE_FIXED', 'FEATURE_PER_UNIT', 'DECK_PER_SQFT', 'LANAI_PER_SQFT', 'COPING_PER_LF', 'DECO_DRAIN_PER_LF', 'SCREEN_PER_SQFT', 'FENCE_PER_LF', 'WALL_PER_LF', 'BENCH_PER_LF', 'NONE');

-- CreateEnum
CREATE TYPE "ExportVisibility" AS ENUM ('CUSTOMER', 'CONSTRUCTION', 'BOTH', 'NONE');

-- CreateEnum
CREATE TYPE "EditableProperty" AS ENUM ('WIDTH', 'HEIGHT', 'DEPTH_SHALLOW', 'DEPTH_DEEP', 'ROTATION', 'FILL', 'STROKE', 'MATERIAL', 'LABEL', 'COUNT', 'RADIUS', 'LENGTH', 'NOTE');

-- CreateEnum
CREATE TYPE "ShapeKind" AS ENUM ('RECTANGLE_POOL', 'CONCRETE_DECK', 'PAVER_DECK', 'GRASS_AREA', 'SUN_SHELF', 'BENCH', 'SPA', 'STENCIL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "brandColor" TEXT,
    "taxRatePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'MEMBER',

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "notes" TEXT,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "customerId" TEXT,
    "name" TEXT NOT NULL,
    "salesperson" TEXT,
    "designer" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "proposalExpiresAt" TIMESTAMP(3),
    "internalNotes" TEXT,
    "poolFields" JSONB NOT NULL DEFAULT '{}',
    "shareToken" TEXT,
    "sharedAt" TIMESTAMP(3),
    "proposalAcceptedAt" TIMESTAMP(3),
    "proposalAcceptedName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Drawing" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "scale" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "rootJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Drawing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrawingObject" (
    "id" TEXT NOT NULL,
    "drawingId" TEXT NOT NULL,
    "parentId" TEXT,
    "type" TEXT NOT NULL,
    "name" TEXT,
    "geometry" JSONB NOT NULL DEFAULT '{}',
    "displayHint" JSONB NOT NULL DEFAULT '{}',
    "depthProfile" JSONB,
    "materialId" TEXT,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "zIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DrawingObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShapeTemplate" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultGeometry" JSONB NOT NULL DEFAULT '{}',
    "defaultStyle" JSONB NOT NULL DEFAULT '{}',
    "measurementBehavior" JSONB NOT NULL DEFAULT '{}',
    "pricingBehavior" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "ShapeTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "kind" "MaterialKind" NOT NULL,
    "name" TEXT NOT NULL,
    "fillSpec" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceBook" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceBook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceBookItem" (
    "id" TEXT NOT NULL,
    "priceBookId" TEXT NOT NULL,
    "category" "PriceCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "unitType" "UnitType" NOT NULL,
    "unitCost" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "retailPrice" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "formula" JSONB,
    "taxBehavior" TEXT,
    "customerVisible" BOOLEAN NOT NULL DEFAULT true,
    "internalOnly" BOOLEAN NOT NULL DEFAULT false,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "upgradeOnly" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PriceBookItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL,
    "priceBookId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "priceBookId" TEXT NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteLineItem" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "validationStatus" TEXT NOT NULL DEFAULT 'ok',

    CONSTRAINT "QuoteLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationResult" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "items" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "ValidationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Export" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "ExportKind" NOT NULL,
    "url" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedById" TEXT,

    CONSTRAINT "Export_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommandAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "orgId" TEXT,
    "commandId" TEXT NOT NULL,
    "inputJson" JSONB NOT NULL DEFAULT '{}',
    "outputJson" JSONB NOT NULL DEFAULT '{}',
    "success" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommandAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StencilDef" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "StencilCategory" NOT NULL,
    "defaultWidthIn" INTEGER NOT NULL,
    "defaultHeightIn" INTEGER NOT NULL,
    "defaultFill" TEXT NOT NULL,
    "defaultStroke" TEXT NOT NULL,
    "measurementBehavior" "MeasurementBehavior" NOT NULL,
    "pricingBehavior" "PricingBehavior" NOT NULL,
    "exportVisibility" "ExportVisibility" NOT NULL,
    "affectsQuote" BOOLEAN NOT NULL DEFAULT false,
    "onConstructionSheet" BOOLEAN NOT NULL DEFAULT true,
    "editableProperties" "EditableProperty"[],
    "shapeKind" "ShapeKind" NOT NULL DEFAULT 'STENCIL',

    CONSTRAINT "StencilDef_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "OrganizationMember_orgId_idx" ON "OrganizationMember"("orgId");

-- CreateIndex
CREATE INDEX "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_userId_orgId_key" ON "OrganizationMember"("userId", "orgId");

-- CreateIndex
CREATE INDEX "Customer_orgId_idx" ON "Customer"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_shareToken_key" ON "Project"("shareToken");

-- CreateIndex
CREATE INDEX "Project_orgId_idx" ON "Project"("orgId");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Project_orgId_status_updatedAt_idx" ON "Project"("orgId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Drawing_projectId_key" ON "Drawing"("projectId");

-- CreateIndex
CREATE INDEX "DrawingObject_drawingId_idx" ON "DrawingObject"("drawingId");

-- CreateIndex
CREATE INDEX "DrawingObject_parentId_idx" ON "DrawingObject"("parentId");

-- CreateIndex
CREATE INDEX "ShapeTemplate_category_idx" ON "ShapeTemplate"("category");

-- CreateIndex
CREATE UNIQUE INDEX "ShapeTemplate_orgId_name_key" ON "ShapeTemplate"("orgId", "name");

-- CreateIndex
CREATE INDEX "Material_orgId_kind_idx" ON "Material"("orgId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Material_orgId_name_key" ON "Material"("orgId", "name");

-- CreateIndex
CREATE INDEX "PriceBook_orgId_idx" ON "PriceBook"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceBook_orgId_name_version_key" ON "PriceBook"("orgId", "name", "version");

-- CreateIndex
CREATE INDEX "PriceBookItem_priceBookId_idx" ON "PriceBookItem"("priceBookId");

-- CreateIndex
CREATE INDEX "PriceBookItem_category_idx" ON "PriceBookItem"("category");

-- CreateIndex
CREATE INDEX "PricingRule_priceBookId_idx" ON "PricingRule"("priceBookId");

-- CreateIndex
CREATE INDEX "Quote_projectId_idx" ON "Quote"("projectId");

-- CreateIndex
CREATE INDEX "QuoteLineItem_quoteId_idx" ON "QuoteLineItem"("quoteId");

-- CreateIndex
CREATE INDEX "ValidationResult_projectId_idx" ON "ValidationResult"("projectId");

-- CreateIndex
CREATE INDEX "Export_projectId_idx" ON "Export"("projectId");

-- CreateIndex
CREATE INDEX "CommandAuditLog_commandId_idx" ON "CommandAuditLog"("commandId");

-- CreateIndex
CREATE INDEX "CommandAuditLog_orgId_idx" ON "CommandAuditLog"("orgId");

-- CreateIndex
CREATE INDEX "CommandAuditLog_userId_idx" ON "CommandAuditLog"("userId");

-- CreateIndex
CREATE INDEX "CommandAuditLog_ranAt_idx" ON "CommandAuditLog"("ranAt");

-- CreateIndex
CREATE INDEX "CommandAuditLog_userId_ranAt_idx" ON "CommandAuditLog"("userId", "ranAt");

-- CreateIndex
CREATE INDEX "CommandAuditLog_orgId_commandId_ranAt_idx" ON "CommandAuditLog"("orgId", "commandId", "ranAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_orgId_key_key" ON "AppSetting"("orgId", "key");

-- CreateIndex
CREATE INDEX "StencilDef_category_idx" ON "StencilDef"("category");

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Drawing" ADD CONSTRAINT "Drawing_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingObject" ADD CONSTRAINT "DrawingObject_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "Drawing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingObject" ADD CONSTRAINT "DrawingObject_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DrawingObject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingObject" ADD CONSTRAINT "DrawingObject_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShapeTemplate" ADD CONSTRAINT "ShapeTemplate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBook" ADD CONSTRAINT "PriceBook_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBookItem" ADD CONSTRAINT "PriceBookItem_priceBookId_fkey" FOREIGN KEY ("priceBookId") REFERENCES "PriceBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_priceBookId_fkey" FOREIGN KEY ("priceBookId") REFERENCES "PriceBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_priceBookId_fkey" FOREIGN KEY ("priceBookId") REFERENCES "PriceBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLineItem" ADD CONSTRAINT "QuoteLineItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationResult" ADD CONSTRAINT "ValidationResult_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Export" ADD CONSTRAINT "Export_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Export" ADD CONSTRAINT "Export_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommandAuditLog" ADD CONSTRAINT "CommandAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommandAuditLog" ADD CONSTRAINT "CommandAuditLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSetting" ADD CONSTRAINT "AppSetting_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

