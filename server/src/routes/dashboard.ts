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

// INTEREST and ZAKAT are selectable under both Deposit (INCOME) and Withdrawal (EXPENSE) flow,
// so a plain category sum would add the two flows together instead of netting them.
async function netByCategory(category: string) {
  const [income, expense] = await Promise.all([
    prisma.transaction.aggregate({ where: { category: category as any, flow: 'INCOME' }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { category: category as any, flow: 'EXPENSE' }, _sum: { amount: true } }),
  ]);
  return new Decimal(income._sum.amount ?? 0).minus(new Decimal(expense._sum.amount ?? 0));
}

router.get('/summary', async (_req, res) => {
  const [totalDeposits, totalWithdrawals, totalProfit, totalInterest, totalExpense, totalZakat] = await Promise.all([
    netByCategory('SAVING_DEPOSIT'),
    sumByCategory('SAVING_WITHDRAWAL'),
    sumByCategory('PROFIT'),
    netByCategory('INTEREST'),
    sumByCategory('EXPENSE'),
    netByCategory('ZAKAT'),
  ]);
  const totalSavings = totalDeposits.minus(totalWithdrawals);

  const [incomeTotal, expenseTotal] = await Promise.all([
    prisma.transaction.aggregate({ where: { flow: 'INCOME', bankId: { not: null } }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { flow: 'EXPENSE', bankId: { not: null } }, _sum: { amount: true } }),
  ]);

  // Unscoped by bankId (unlike incomeTotal/expenseTotal above, which are scoped to match
  // banks-summary for the Total Bank Balance tile) — these are the gross income/expense across
  // every transaction regardless of category, for the Total Income/Total Expense (All) tiles.
  const [grossIncome, grossExpense] = await Promise.all([
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
    totalIncomeAll: new Decimal(grossIncome._sum.amount ?? 0),
    totalExpenseAll: new Decimal(grossExpense._sum.amount ?? 0),
  });
});

// Per-category breakdown of every transaction under one flow, for the Total Income/Total
// Expense (All) drill-down tiles — e.g. flow=INCOME groups SAVING_DEPOSIT, INTEREST,
// LOAN_REPAYMENT, PROFIT, ZAKAT rows that are all tagged flow: INCOME.
router.get('/flow-summary', async (req, res) => {
  const flow = req.query.flow === 'EXPENSE' ? 'EXPENSE' : 'INCOME';

  const rows = await prisma.transaction.groupBy({
    by: ['category'],
    where: { flow },
    _sum: { amount: true },
  });

  const breakdown = rows
    .map((r) => ({ category: r.category, amount: new Decimal(r._sum.amount ?? 0) }))
    .filter((r) => !r.amount.isZero())
    .sort((a, b) => b.amount.comparedTo(a.amount));

  res.json({ flow, breakdown });
});

router.get('/members-summary', async (_req, res) => {
  const [savingMembers, loanMembers, totalMembers] = await Promise.all([
    prisma.member.count({ where: { active: true, role: 'MEMBER', isSavingMember: true } }),
    prisma.member.count({ where: { active: true, role: 'MEMBER', isLoanMember: true } }),
    prisma.member.count({ where: { active: true, role: 'MEMBER' } }),
  ]);

  res.json({ totalMembers, savingMembers, loanMembers });
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
