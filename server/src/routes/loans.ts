import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { Decimal } from '.prisma/client/runtime/library';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const where: any = {};
  if (req.user!.role !== 'ADMIN') where.memberId = req.user!.memberId;
  else if (req.query.memberId) where.memberId = req.query.memberId as string;

  const loans = await prisma.loan.findMany({
    where,
    include: { transactions: { include: { bank: true }, orderBy: { date: 'desc' } } },
    orderBy: { disbursedDate: 'desc' },
  });
  res.json(loans);
});

router.post('/', requireAdmin, async (req, res) => {
  const { memberId, principalAmount, disbursedDate, bankId, description } = req.body ?? {};
  if (!memberId || !principalAmount || !disbursedDate || !bankId) {
    return res
      .status(400)
      .json({ error: 'memberId, principalAmount, disbursedDate and bankId are required' });
  }

  const loan = await prisma.loan.create({
    data: {
      memberId,
      principalAmount,
      disbursedDate: new Date(disbursedDate),
      balance: principalAmount,
    },
  });

  await prisma.transaction.create({
    data: {
      memberId,
      bankId,
      date: new Date(disbursedDate),
      description: description || 'Loan disbursement',
      flow: 'EXPENSE',
      category: 'LOAN_DISBURSEMENT',
      amount: principalAmount,
      linkedLoanId: loan.id,
      createdBy: req.user!.memberId,
    },
  });

  res.status(201).json(loan);
});

router.post('/:id/repayment', requireAdmin, async (req, res) => {
  const { amount, bankId, date, description } = req.body ?? {};
  if (!amount || !bankId || !date) {
    return res.status(400).json({ error: 'amount, bankId and date are required' });
  }

  const loan = await prisma.loan.findUniqueOrThrow({ where: { id: req.params.id as string } });
  const newBalance = Decimal.max(0, new Decimal(loan.balance).minus(amount));

  await prisma.loan.update({
    where: { id: loan.id },
    data: { balance: newBalance, status: newBalance.lte(0) ? 'CLOSED' : 'ACTIVE' },
  });

  const txn = await prisma.transaction.create({
    data: {
      memberId: loan.memberId,
      bankId,
      date: new Date(date),
      description: description || 'Loan repayment',
      flow: 'INCOME',
      category: 'LOAN_REPAYMENT',
      amount,
      linkedLoanId: loan.id,
      createdBy: req.user!.memberId,
    },
  });

  res.status(201).json(txn);
});

export default router;
