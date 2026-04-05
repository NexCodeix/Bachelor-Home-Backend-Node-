-- CreateEnum
CREATE TYPE "MessJoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Mess" ADD COLUMN     "isJoinEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "MessMember" ADD COLUMN     "requestStatus" "MessJoinRequestStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "respondedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "MessMember_messId_requestStatus_idx" ON "MessMember"("messId", "requestStatus");
