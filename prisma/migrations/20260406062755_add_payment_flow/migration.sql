-- CreateEnum
CREATE TYPE "PaymentCategory" AS ENUM ('MEAL_CHARGE', 'OTHERS', 'UTILITY_BILL', 'RENT', 'INTERNET_BILL', 'GAS_BILL', 'GUEST_MEAL', 'MESS_FUND', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReturnMethod" AS ENUM ('OTHER_FUND_TRANSFER', 'CASH');

-- CreateEnum
CREATE TYPE "ReturnTransferTarget" AS ENUM ('INTERNET_BILL', 'GAS_BILL', 'UTILITY_BILL', 'MEAL_CHARGE', 'OTHERS', 'OTHER');

-- CreateEnum
CREATE TYPE "ReturnRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "messId" TEXT NOT NULL,
    "messMemberId" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "category" "PaymentCategory" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "returnAmountRequested" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "payableAmount" DECIMAL(12,2),
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "managerNote" TEXT,
    "rejectionReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReturnRequest" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "messId" TEXT NOT NULL,
    "messMemberId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "ReturnMethod" NOT NULL,
    "transferTarget" "ReturnTransferTarget",
    "status" "ReturnRequestStatus" NOT NULL DEFAULT 'PENDING',
    "managerNote" TEXT,
    "memberReason" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentReturnRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payment_messId_year_month_idx" ON "Payment"("messId", "year", "month");

-- CreateIndex
CREATE INDEX "Payment_messId_status_idx" ON "Payment"("messId", "status");

-- CreateIndex
CREATE INDEX "Payment_messMemberId_status_idx" ON "Payment"("messMemberId", "status");

-- CreateIndex
CREATE INDEX "Payment_messId_category_idx" ON "Payment"("messId", "category");

-- CreateIndex
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

-- CreateIndex
CREATE INDEX "PaymentReturnRequest_paymentId_idx" ON "PaymentReturnRequest"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentReturnRequest_messId_status_idx" ON "PaymentReturnRequest"("messId", "status");

-- CreateIndex
CREATE INDEX "PaymentReturnRequest_messMemberId_status_idx" ON "PaymentReturnRequest"("messMemberId", "status");

-- CreateIndex
CREATE INDEX "PaymentReturnRequest_createdAt_idx" ON "PaymentReturnRequest"("createdAt");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_messId_fkey" FOREIGN KEY ("messId") REFERENCES "Mess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_messMemberId_fkey" FOREIGN KEY ("messMemberId") REFERENCES "MessMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReturnRequest" ADD CONSTRAINT "PaymentReturnRequest_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReturnRequest" ADD CONSTRAINT "PaymentReturnRequest_messId_fkey" FOREIGN KEY ("messId") REFERENCES "Mess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReturnRequest" ADD CONSTRAINT "PaymentReturnRequest_messMemberId_fkey" FOREIGN KEY ("messMemberId") REFERENCES "MessMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
