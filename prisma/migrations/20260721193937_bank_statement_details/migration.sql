-- AlterTable
ALTER TABLE "Bank" ADD COLUMN     "accountHolderName" TEXT,
ADD COLUMN     "accountOpenDate" TIMESTAMP(3),
ADD COLUMN     "branchName" TEXT,
ADD COLUMN     "branchSolId" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "ifscCode" TEXT,
ADD COLUMN     "jointHolders" TEXT,
ADD COLUMN     "micrCode" TEXT,
ADD COLUMN     "modeOfOperation" TEXT,
ADD COLUMN     "nominationRegistered" BOOLEAN,
ADD COLUMN     "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "swiftCode" TEXT;
