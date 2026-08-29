-- CreateEnum
CREATE TYPE "PriceChangeStatus" AS ENUM ('OPEN', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PriceChangeKind" AS ENUM ('ADD', 'UPDATE', 'REMOVE');

-- CreateTable
CREATE TABLE "PriceChangeRequest" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "status" "PriceChangeStatus" NOT NULL DEFAULT 'OPEN',
    "baseBookId" TEXT NOT NULL,
    "resultBookId" TEXT,
    "openedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceChange" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "kind" "PriceChangeKind" NOT NULL,
    "itemId" TEXT,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "reason" TEXT,

    CONSTRAINT "PriceChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceChangeRequest_orgId_status_idx" ON "PriceChangeRequest"("orgId", "status");

-- CreateIndex
CREATE INDEX "PriceChangeRequest_baseBookId_idx" ON "PriceChangeRequest"("baseBookId");

-- CreateIndex
CREATE INDEX "PriceChange_requestId_idx" ON "PriceChange"("requestId");

-- AddForeignKey
ALTER TABLE "PriceChangeRequest" ADD CONSTRAINT "PriceChangeRequest_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceChangeRequest" ADD CONSTRAINT "PriceChangeRequest_baseBookId_fkey" FOREIGN KEY ("baseBookId") REFERENCES "PriceBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceChangeRequest" ADD CONSTRAINT "PriceChangeRequest_resultBookId_fkey" FOREIGN KEY ("resultBookId") REFERENCES "PriceBook"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceChange" ADD CONSTRAINT "PriceChange_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PriceChangeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

