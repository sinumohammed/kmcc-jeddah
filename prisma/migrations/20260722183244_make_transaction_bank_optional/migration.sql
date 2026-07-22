-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_bankId_fkey";

-- AlterTable
ALTER TABLE "Transaction" ALTER COLUMN "bankId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE SET NULL ON UPDATE CASCADE;
