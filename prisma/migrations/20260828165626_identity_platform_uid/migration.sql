-- AlterTable
ALTER TABLE "User" ADD COLUMN     "identityUid" TEXT,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_identityUid_key" ON "User"("identityUid");

