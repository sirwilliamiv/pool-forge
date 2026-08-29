-- AlterTable
ALTER TABLE "Export" ADD COLUMN     "byteSize" INTEGER,
ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "storageKey" TEXT;

-- AlterTable
ALTER TABLE "PriceBookItem" ADD COLUMN     "optionKey" TEXT;

-- CreateTable
CREATE TABLE "ProjectLineItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "category" "PriceCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "unitType" "UnitType" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "note" TEXT,
    "priceBookItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitCounter" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitCounter_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateIndex
CREATE INDEX "ProjectLineItem_projectId_idx" ON "ProjectLineItem"("projectId");

-- CreateIndex
CREATE INDEX "ProjectLineItem_orgId_idx" ON "ProjectLineItem"("orgId");

-- CreateIndex
CREATE INDEX "RateLimitCounter_windowStart_idx" ON "RateLimitCounter"("windowStart");

-- AddForeignKey
ALTER TABLE "ProjectLineItem" ADD CONSTRAINT "ProjectLineItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

