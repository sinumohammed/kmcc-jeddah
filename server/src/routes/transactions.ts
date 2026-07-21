import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireAdmin } from '../middleware/auth';
import {
  ensureContributionsUpTo,
  allocateDepositToContributions,
  recalculateAllContributions,
} from '../lib/contributions';
import { Decimal } from '.prisma/client/runtime/library';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const { memberId, bankId, category, flow, from, to } = req.query as Record<string, string>;
  const where: any = {};

  if (req.user!.role !== 'ADMIN') {
    where.memberId = req.user!.memberId;
  } else if (memberId) {
    where.memberId = memberId;
  }

  if (bankId) where.bankId = bankId;
  if (category) where.category = category;
  if (flow) where.flow = flow;
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(from);
    if (to) where.date.lte = new Date(to);
  }

  const transactions = await prisma.transaction.findMany({
    where,
    include: { bank: true, member: { select: { id: true, name: true, memberCode: true } } },
    orderBy: { date: 'desc' },
  });
  res.json(transactions);
});

router.post('/', requireAdmin, async (req, res) => {
  const { memberId, bankId, date, description, flow, category, amount, linkedLoanId } =
    req.body ?? {};

  if (!bankId || !date || !flow || !category || !amount) {
    return res.status(400).json({ error: 'bankId, date, flow, category and amount are required' });
  }

  const memberRequiredCategories = ['SAVING_DEPOSIT', 'LOAN_DISBURSEMENT', 'LOAN_REPAYMENT'];
  if (memberRequiredCategories.includes(category) && !memberId) {
    return res.status(400).json({ error: 'A member must be selected for this category' });
  }

  const txn = await prisma.transaction.create({
    data: {
      memberId: memberId || null,
      bankId,
      date: new Date(date),
      description: description ?? '',
      flow,
      category,
      amount,
      linkedLoanId: linkedLoanId || null,
      createdBy: req.user!.memberId,
    },
  });

  if (category === 'SAVING_DEPOSIT' && memberId) {
    const txnDate = new Date(date);
    await ensureContributionsUpTo(memberId, txnDate.getFullYear(), txnDate.getMonth() + 1);
    await allocateDepositToContributions(memberId, amount, txnDate);
  }

  if (category === 'LOAN_REPAYMENT' && linkedLoanId) {
    const loan = await prisma.loan.findUniqueOrThrow({ where: { id: linkedLoanId } });
    const newBalance = new Decimal(loan.balance).minus(amount);
    await prisma.loan.update({
      where: { id: linkedLoanId },
      data: {
        balance: newBalance.lt(0) ? 0 : newBalance,
        status: newBalance.lte(0) ? 'CLOSED' : 'ACTIVE',
      },
    });
  }

  res.status(201).json(txn);
});

router.put('/:id', requireAdmin, async (req, res) => {
  const id = req.params.id as string;
  const { date, description, amount, bankId, category, flow } = req.body ?? {};

  const before = await prisma.transaction.findUniqueOrThrow({ where: { id } });

  const txn = await prisma.transaction.update({
    where: { id },
    data: {
      date: date ? new Date(date) : undefined,
      description,
      amount,
      bankId,
      category,
      flow,
    },
  });

  const affectedMemberIds = new Set<string>();
  if (before.category === 'SAVING_DEPOSIT' && before.memberId) affectedMemberIds.add(before.memberId);
  if (txn.category === 'SAVING_DEPOSIT' && txn.memberId) affectedMemberIds.add(txn.memberId);
  for (const memberId of affectedMemberIds) {
    await recalculateAllContributions(memberId);
  }

  res.json(txn);
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const id = req.params.id as string;
  const txn = await prisma.transaction.delete({ where: { id } });

  if (txn.category === 'SAVING_DEPOSIT' && txn.memberId) {
    await recalculateAllContributions(txn.memberId);
  }

  res.status(204).send();
});

// Admin enters one lump-sum profit amount; it's distributed across active
// saving members proportional to each member's total savings deposited to date.
router.post('/profit-distribution', requireAdmin, async (req, res) => {
  const { totalAmount, bankId, date, description } = req.body ?? {};
  if (!totalAmount || !bankId || !date) {
    return res.status(400).json({ error: 'totalAmount, bankId and date are required' });
  }

  const savingMembers = await prisma.member.findMany({
    where: { isSavingMember: true, active: true },
  });

  const deposits = await prisma.transaction.groupBy({
    by: ['memberId'],
    where: { category: 'SAVING_DEPOSIT', memberId: { in: savingMembers.map((m) => m.id) } },
    _sum: { amount: true },
  });

  const totalsByMember = new Map<string, Decimal>();
  for (const d of deposits) {
    if (d.memberId) totalsByMember.set(d.memberId, new Decimal(d._sum.amount ?? 0));
  }

  const grandTotal = [...totalsByMember.values()].reduce(
    (sum, v) => sum.plus(v),
    new Decimal(0)
  );

  if (grandTotal.lte(0)) {
    return res.status(400).json({ error: 'No savings collected yet; cannot distribute profit' });
  }

  const profitBatchId = `profit_${Date.now()}`;
  const profitTotal = new Decimal(totalAmount);

  const created = [];
  for (const [memberId, memberTotal] of totalsByMember.entries()) {
    if (memberTotal.lte(0)) continue;
    const share = memberTotal.div(grandTotal).mul(profitTotal);
    const txn = await prisma.transaction.create({
      data: {
        memberId,
        bankId,
        date: new Date(date),
        description: description || 'Profit distribution',
        flow: 'INCOME',
        category: 'PROFIT',
        amount: share,
        profitBatchId,
        createdBy: req.user!.memberId,
      },
    });
    created.push(txn);
  }

  res.status(201).json({ profitBatchId, count: created.length });
});

router.delete('/profit-distribution/:batchId', requireAdmin, async (req, res) => {
  await prisma.transaction.deleteMany({ where: { profitBatchId: req.params.batchId as string } });
  res.status(204).send();
});

export default router;
