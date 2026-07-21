-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "ContributionStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "TxnFlow" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "TxnCategory" AS ENUM ('SAVING_DEPOSIT', 'INTEREST', 'PROFIT', 'LOAN_DISBURSEMENT', 'LOAN_REPAYMENT', 'EXPENSE', 'ZAKAT');

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "memberCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "isSavingMember" BOOLEAN NOT NULL DEFAULT false,
    "isLoanMember" BOOLEAN NOT NULL DEFAULT false,
    "joinDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyAmountHistory" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "MonthlyAmountHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyContribution" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amountDue" DECIMAL(12,2) NOT NULL,
    "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "ContributionStatus" NOT NULL DEFAULT 'PENDING',
    "paidDate" TIMESTAMP(3),

    CONSTRAINT "MonthlyContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bank" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountNumber" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "principalAmount" DECIMAL(12,2) NOT NULL,
    "disbursedDate" TIMESTAMP(3) NOT NULL,
    "status" "LoanStatus" NOT NULL DEFAULT 'ACTIVE',
    "balance" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "memberId" TEXT,
    "bankId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "flow" "TxnFlow" NOT NULL,
    "category" "TxnCategory" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "linkedLoanId" TEXT,
    "profitBatchId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Member_memberCode_key" ON "Member"("memberCode");

-- CreateIndex
CREATE UNIQUE INDEX "Member_mobile_key" ON "Member"("mobile");

-- CreateIndex
CREATE INDEX "Member_mobile_idx" ON "Member"("mobile");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyAmountHistory_memberId_year_key" ON "MonthlyAmountHistory"("memberId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyContribution_memberId_year_month_key" ON "MonthlyContribution"("memberId", "year", "month");

-- CreateIndex
CREATE INDEX "Transaction_memberId_idx" ON "Transaction"("memberId");

-- CreateIndex
CREATE INDEX "Transaction_bankId_idx" ON "Transaction"("bankId");

-- CreateIndex
CREATE INDEX "Transaction_category_idx" ON "Transaction"("category");

-- CreateIndex
CREATE INDEX "Transaction_profitBatchId_idx" ON "Transaction"("profitBatchId");

-- AddForeignKey
ALTER TABLE "MonthlyAmountHistory" ADD CONSTRAINT "MonthlyAmountHistory_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyContribution" ADD CONSTRAINT "MonthlyContribution_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_linkedLoanId_fkey" FOREIGN KEY ("linkedLoanId") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
