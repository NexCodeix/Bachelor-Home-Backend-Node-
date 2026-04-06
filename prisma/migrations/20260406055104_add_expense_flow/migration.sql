-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ExpenseMoneySource" AS ENUM ('MESS_FUND', 'SELF_FUND');

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "messId" TEXT NOT NULL,
    "messMemberId" TEXT NOT NULL,
    "dateTime" TIMESTAMP(3) NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "amountValue" DECIMAL(12,2) NOT NULL,
    "amountUnitName" TEXT,
    "perAmountValue" DECIMAL(12,2),
    "voucherImageUrl" TEXT,
    "totalValue" DECIMAL(12,2) NOT NULL,
    "moneySource" "ExpenseMoneySource",
    "receivedMessFundAmount" DECIMAL(12,2),
    "returnAmount" DECIMAL(12,2),
    "status" "ExpenseStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Expense_messId_year_month_idx" ON "Expense"("messId", "year", "month");

-- CreateIndex
CREATE INDEX "Expense_messId_status_idx" ON "Expense"("messId", "status");

-- CreateIndex
CREATE INDEX "Expense_messMemberId_status_idx" ON "Expense"("messMemberId", "status");

-- CreateIndex
CREATE INDEX "Expense_messId_category_idx" ON "Expense"("messId", "category");

-- CreateIndex
CREATE INDEX "Expense_createdAt_idx" ON "Expense"("createdAt");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_messId_fkey" FOREIGN KEY ("messId") REFERENCES "Mess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_messMemberId_fkey" FOREIGN KEY ("messMemberId") REFERENCES "MessMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
