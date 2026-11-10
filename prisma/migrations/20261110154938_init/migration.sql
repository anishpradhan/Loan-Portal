-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SENIOR', 'PROVINCE_MANAGER', 'BRANCH_MANAGER');

-- CreateTable
CREATE TABLE "Province" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "manager" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Province_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT,
    "email" TEXT,
    "provinceId" INTEGER,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "excludeFromProvisioning" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Borrower" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "memberId" TEXT,

    CONSTRAINT "Borrower_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanAccount" (
    "id" SERIAL NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "branchId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "borrowerId" INTEGER NOT NULL,
    "openingDate" DATE,
    "maturityDate" DATE,

    CONSTRAINT "LoanAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" SERIAL NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "note" TEXT,
    "uploadedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanSnapshotRow" (
    "id" SERIAL NOT NULL,
    "snapshotId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "interestRate" DECIMAL(9,4) NOT NULL,
    "penalRate" DECIMAL(9,4) NOT NULL,
    "granted" DECIMAL(18,2) NOT NULL,
    "principal" DECIMAL(18,2) NOT NULL,
    "interestPaid" DECIMAL(18,2) NOT NULL,
    "penalChargePaid" DECIMAL(18,2) NOT NULL,
    "principalPaid" DECIMAL(18,2) NOT NULL,
    "principalBalance" DECIMAL(18,2) NOT NULL,
    "installmentAmount" DECIMAL(18,2) NOT NULL,
    "penalBalance" DECIMAL(18,2) NOT NULL,
    "interestBalance" DECIMAL(18,2) NOT NULL,
    "chargeBalance" DECIMAL(18,2) NOT NULL,
    "overduePrincipal" DECIMAL(18,2) NOT NULL,
    "overdueInterest" DECIMAL(18,2) NOT NULL,
    "installmentsPaid" INTEGER NOT NULL,
    "dpd" INTEGER NOT NULL,
    "term" INTEGER NOT NULL,
    "lastTransactionDate" DATE,
    "frequency" TEXT,
    "accruedInterest" DECIMAL(18,2) NOT NULL,
    "accruedPenalty" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "LoanSnapshotRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProvisionOverride" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProvisionOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetTarget" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "BudgetTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUp" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "dueDate" DATE,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "authorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "branchId" INTEGER,
    "provinceId" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "detail" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Province_name_key" ON "Province"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_code_key" ON "Branch"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_name_key" ON "Branch"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_name_key" ON "Product"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Borrower_memberId_key" ON "Borrower"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "LoanAccount_accountNumber_key" ON "LoanAccount"("accountNumber");

-- CreateIndex
CREATE INDEX "LoanAccount_branchId_idx" ON "LoanAccount"("branchId");

-- CreateIndex
CREATE INDEX "LoanAccount_productId_idx" ON "LoanAccount"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Snapshot_asOf_key" ON "Snapshot"("asOf");

-- CreateIndex
CREATE UNIQUE INDEX "Snapshot_checksum_key" ON "Snapshot"("checksum");

-- CreateIndex
CREATE INDEX "LoanSnapshotRow_accountId_idx" ON "LoanSnapshotRow"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "LoanSnapshotRow_snapshotId_accountId_key" ON "LoanSnapshotRow"("snapshotId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetTarget_branchId_fiscalYear_month_key" ON "BudgetTarget"("branchId", "fiscalYear", "month");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "Province"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanAccount" ADD CONSTRAINT "LoanAccount_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanAccount" ADD CONSTRAINT "LoanAccount_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanAccount" ADD CONSTRAINT "LoanAccount_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanSnapshotRow" ADD CONSTRAINT "LoanSnapshotRow_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanSnapshotRow" ADD CONSTRAINT "LoanSnapshotRow_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LoanAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvisionOverride" ADD CONSTRAINT "ProvisionOverride_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LoanAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvisionOverride" ADD CONSTRAINT "ProvisionOverride_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetTarget" ADD CONSTRAINT "BudgetTarget_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LoanAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "Province"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
