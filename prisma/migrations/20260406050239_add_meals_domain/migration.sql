-- CreateEnum
CREATE TYPE "MealType" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER');

-- CreateEnum
CREATE TYPE "MealRequestType" AS ENUM ('MEAL_ON', 'MEAL_OFF', 'GUEST_MEAL');

-- CreateEnum
CREATE TYPE "MealRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('NOT_MARKED', 'GOT_MEAL', 'DID_NOT_GET');

-- CreateTable
CREATE TABLE "MessMealMenu" (
    "id" TEXT NOT NULL,
    "messId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "mealType" "MealType" NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessMealMenu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessMealRoutine" (
    "id" TEXT NOT NULL,
    "messId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "mealType" "MealType" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessMealRoutine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberMealRoutine" (
    "id" TEXT NOT NULL,
    "messMemberId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "mealType" "MealType" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberMealRoutine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealDay" (
    "id" TEXT NOT NULL,
    "messId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "weekday" INTEGER NOT NULL,
    "mealType" "MealType" NOT NULL,
    "menuDescription" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealDayMemberStatus" (
    "id" TEXT NOT NULL,
    "mealDayId" TEXT NOT NULL,
    "messMemberId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "guestCount" INTEGER NOT NULL DEFAULT 0,
    "isOverridden" BOOLEAN NOT NULL DEFAULT false,
    "attendanceStatus" "AttendanceStatus" NOT NULL DEFAULT 'NOT_MARKED',
    "attendanceMarkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealDayMemberStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealRequest" (
    "id" TEXT NOT NULL,
    "messId" TEXT NOT NULL,
    "mealDayId" TEXT NOT NULL,
    "messMemberId" TEXT NOT NULL,
    "requestType" "MealRequestType" NOT NULL,
    "status" "MealRequestStatus" NOT NULL DEFAULT 'PENDING',
    "guestCount" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "managerNote" TEXT,
    "respondedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessMealMenu_messId_year_month_idx" ON "MessMealMenu"("messId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "MessMealMenu_messId_year_month_mealType_key" ON "MessMealMenu"("messId", "year", "month", "mealType");

-- CreateIndex
CREATE INDEX "MessMealRoutine_messId_idx" ON "MessMealRoutine"("messId");

-- CreateIndex
CREATE UNIQUE INDEX "MessMealRoutine_messId_weekday_mealType_key" ON "MessMealRoutine"("messId", "weekday", "mealType");

-- CreateIndex
CREATE INDEX "MemberMealRoutine_messMemberId_idx" ON "MemberMealRoutine"("messMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberMealRoutine_messMemberId_weekday_mealType_key" ON "MemberMealRoutine"("messMemberId", "weekday", "mealType");

-- CreateIndex
CREATE INDEX "MealDay_messId_year_month_idx" ON "MealDay"("messId", "year", "month");

-- CreateIndex
CREATE INDEX "MealDay_messId_date_idx" ON "MealDay"("messId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MealDay_messId_date_mealType_key" ON "MealDay"("messId", "date", "mealType");

-- CreateIndex
CREATE INDEX "MealDayMemberStatus_messMemberId_idx" ON "MealDayMemberStatus"("messMemberId");

-- CreateIndex
CREATE INDEX "MealDayMemberStatus_mealDayId_idx" ON "MealDayMemberStatus"("mealDayId");

-- CreateIndex
CREATE INDEX "MealDayMemberStatus_messMemberId_attendanceStatus_idx" ON "MealDayMemberStatus"("messMemberId", "attendanceStatus");

-- CreateIndex
CREATE UNIQUE INDEX "MealDayMemberStatus_mealDayId_messMemberId_key" ON "MealDayMemberStatus"("mealDayId", "messMemberId");

-- CreateIndex
CREATE INDEX "MealRequest_messId_status_idx" ON "MealRequest"("messId", "status");

-- CreateIndex
CREATE INDEX "MealRequest_messMemberId_status_idx" ON "MealRequest"("messMemberId", "status");

-- CreateIndex
CREATE INDEX "MealRequest_mealDayId_idx" ON "MealRequest"("mealDayId");

-- CreateIndex
CREATE INDEX "MealRequest_createdAt_idx" ON "MealRequest"("createdAt");

-- AddForeignKey
ALTER TABLE "MessMealMenu" ADD CONSTRAINT "MessMealMenu_messId_fkey" FOREIGN KEY ("messId") REFERENCES "Mess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessMealRoutine" ADD CONSTRAINT "MessMealRoutine_messId_fkey" FOREIGN KEY ("messId") REFERENCES "Mess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberMealRoutine" ADD CONSTRAINT "MemberMealRoutine_messMemberId_fkey" FOREIGN KEY ("messMemberId") REFERENCES "MessMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealDay" ADD CONSTRAINT "MealDay_messId_fkey" FOREIGN KEY ("messId") REFERENCES "Mess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealDayMemberStatus" ADD CONSTRAINT "MealDayMemberStatus_mealDayId_fkey" FOREIGN KEY ("mealDayId") REFERENCES "MealDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealDayMemberStatus" ADD CONSTRAINT "MealDayMemberStatus_messMemberId_fkey" FOREIGN KEY ("messMemberId") REFERENCES "MessMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealRequest" ADD CONSTRAINT "MealRequest_messId_fkey" FOREIGN KEY ("messId") REFERENCES "Mess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealRequest" ADD CONSTRAINT "MealRequest_mealDayId_fkey" FOREIGN KEY ("mealDayId") REFERENCES "MealDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealRequest" ADD CONSTRAINT "MealRequest_messMemberId_fkey" FOREIGN KEY ("messMemberId") REFERENCES "MessMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
