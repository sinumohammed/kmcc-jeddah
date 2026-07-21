import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { Decimal } from '.prisma/client/runtime/library';

const router = Router();
router.use(requireAuth, requireAdmin);

async function sumByCategory(category: string) {
  const result = await prisma.transaction.aggregate({
    where: { category: category as any },
    _sum: { amount: true },
  });
  return new Decimal(result._sum.amount ?? 0);
}

router.get('/summary', async (_req, res) => {
  const [totalSavings, totalProfit, totalInterest, totalExpense, totalZakat] = await Promise.all([
    sumByCategory('SAVING_DEPOSIT'),
    sumByCategory('PROFIT'),
    sumByCategory('INTEREST'),
    sumByCategory('EXPENSE'),
    sumByCategory('ZAKAT'),
  ]);

  const [incomeTotal, expenseTotal] = await Promise.all([
    prisma.transaction.aggregate({ where: { flow: 'INCOME' }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { flow: 'EXPENSE' }, _sum: { amount: true } }),
  ]);

  const banks = await prisma.bank.findMany({ where: { active: true } });
  const totalOpeningBalance = banks.reduce(
    (sum, b) => sum.plus(new Decimal(b.openingBalance)),
    new Decimal(0)
  );

  const totalBankBalance = totalOpeningBalance
    .plus(new Decimal(incomeTotal._sum.amount ?? 0))
    .minus(new Decimal(expenseTotal._sum.amount ?? 0));

  const activeLoans = await prisma.loan.findMany({ where: { status: 'ACTIVE' } });
  const totalLoanAmount = activeLoans.reduce(
    (sum, l) => sum.plus(new Decimal(l.balance)),
    new Decimal(0)
  );

  res.json({
    totalSavingsAmount: totalSavings,
    totalLoanAmount,
    totalBankBalance,
    totalProfit,
    totalInterestAmount: totalInterest,
    totalExpense,
    totalZakat,
  });
});

router.get('/banks-summary', async (_req, res) => {
  const banks = await prisma.bank.findMany({ where: { active: true }, orderBy: { name: 'asc' } });

  const summaries = await Promise.all(
    banks.map(async (bank) => {
      const [income, expense] = await Promise.all([
        prisma.transaction.aggregate({
          where: { bankId: bank.id, flow: 'INCOME' },
          _sum: { amount: true },
        }),
        prisma.transaction.aggregate({
          where: { bankId: bank.id, flow: 'EXPENSE' },
          _sum: { amount: true },
        }),
      ]);

      const balance = new Decimal(bank.openingBalance)
        .plus(new Decimal(income._sum.amount ?? 0))
        .minus(new Decimal(expense._sum.amount ?? 0));

      return { bankId: bank.id, name: bank.name, balance };
    })
  );

  res.json(summaries);
});

export default router;
