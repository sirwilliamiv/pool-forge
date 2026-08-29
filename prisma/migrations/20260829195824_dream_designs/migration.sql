-- CreateTable
CREATE TABLE "DreamDesign" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "postcode" TEXT,
    "timeframe" TEXT,
    "design" TEXT NOT NULL,
    "ballparkLow" INTEGER NOT NULL,
    "ballparkHigh" INTEGER NOT NULL,
    "source" TEXT,
    "routedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DreamDesign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DreamDesign_createdAt_idx" ON "DreamDesign"("createdAt");

-- CreateIndex
CREATE INDEX "DreamDesign_email_idx" ON "DreamDesign"("email");
