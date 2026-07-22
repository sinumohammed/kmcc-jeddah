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
  if (category) {
    const categories = category.split(',');
    where.category = categories.length > 1 ? { in: categories } : categories[0];
  }
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

  if (!date || !flow || !category || !amount) {
    return res.status(400).json({ error: 'date, flow, category and amount are required' });
  }
  if (category !== 'SAVING_DEPOSIT' && !bankId) {
    return res.status(400).json({ error: 'bankId is required for this category' });
  }

  // SAVING_DEPOSIT is member-required in the Transactions page UI, but the Banks page's
  // bank-only entry form (no member picker) also posts SAVING_DEPOSIT rows to record the
  // bank-side half of a deposit that was entered without a bank — so it's not hard-enforced
  // here. LOAN_DISBURSEMENT/LOAN_REPAYMENT always tie to a specific Loan and stay required.
  const loanLinkedCategories = ['LOAN_DISBURSEMENT', 'LOAN_REPAYMENT'];
  if (loanLinkedCategories.includes(category) && !memberId) {
    return res.status(400).json({ error: 'A member must be selected for this category' });
  }

  // LOAN_DISBURSEMENT has no "existing loan" to link to (unlike LOAN_REPAYMENT) — every
  // disbursement creates a brand new Loan record, mirroring POST /loans, so that
  // Loan.balance (and the dashboard's Total Loan Amount, which sums it) reflects entries
  // made from this generic form the same as ones made through the dedicated loan flow.
  let resolvedLinkedLoanId = linkedLoanId || null;
  if (category === 'LOAN_DISBURSEMENT' && memberId) {
    const loan = await prisma.loan.create({
      data: {
        memberId,
        principalAmount: amount,
        disbursedDate: new Date(date),
        balance: amount,
      },
    });
    resolvedLinkedLoanId = loan.id;
  }

  const txn = await prisma.transaction.create({
    data: {
      memberId: memberId || null,
      bankId: bankId || null,
      date: new Date(date),
      description: description ?? '',
      flow,
      category,
      amount,
      linkedLoanId: resolvedLinkedLoanId,
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

// Bulk import for historical/plain transactions (statements, back-entry).
// Loan-linked categories are intentionally excluded: LOAN_DISBURSEMENT needs to
// create a Loan record and LOAN_REPAYMENT needs a specific loan to apply
// balance math against, neither of which can be inferred safely from a CSV row.
const IMPORTABLE_CATEGORIES = new Set(['SAVING_DEPOSIT', 'INTEREST', 'PROFIT', 'EXPENSE', 'ZAKAT']);
const CATEGORY_ALIASES: Record<string, string> = {
  SAVING: 'SAVING_DEPOSIT',
  SAVINGS: 'SAVING_DEPOSIT',
  DEPOSIT: 'SAVING_DEPOSIT',
};
const FLOW_ALIASES: Record<string, string> = {
  DEPOSIT: 'INCOME',
  WITHDRAWAL: 'EXPENSE',
};

router.post('/import', requireAdmin, async (req, res) => {
  const { rows } = req.body ?? {};
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'rows array is required' });
  }

  const banks = await prisma.bank.findMany();
  const bankByName = new Map(banks.map((b) => [b.name.trim().toLowerCase(), b]));
  const members = await prisma.member.findMany();
  const memberByCode = new Map(members.map((m) => [m.memberCode.trim().toUpperCase(), m]));

  const memberRequiredCategories = ['SAVING_DEPOSIT'];
  const affectedMemberIds = new Set<string>();
  const errors: { row: number; error: string }[] = [];
  let created = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] ?? {};
    try {
      const bankName = String(r.bankName ?? r.bank ?? '').trim();
      const bank = bankByName.get(bankName.toLowerCase());
      if (!bank) throw new Error(`Bank "${bankName}" not found`);

      const flowRaw = String(r.flow ?? '').trim().toUpperCase();
      const flow = FLOW_ALIASES[flowRaw] ?? flowRaw;
      if (!['INCOME', 'EXPENSE'].includes(flow)) throw new Error(`Invalid flow "${r.flow}"`);

      const categoryRaw = String(r.category ?? '').trim().toUpperCase();
      const category = CATEGORY_ALIASES[categoryRaw] ?? categoryRaw;
      if (!IMPORTABLE_CATEGORIES.has(category)) {
        throw new Error(`Category "${r.category}" is not supported for import`);
      }

      const amount = Number(r.amount);
      if (!amount || amount <= 0) throw new Error(`Invalid amount "${r.amount}"`);

      const date = new Date(r.date);
      if (Number.isNaN(date.getTime())) throw new Error(`Invalid date "${r.date}"`);

      let member: (typeof members)[number] | null = null;
      const memberCode = String(r.memberCode ?? '').trim();
      if (memberCode) {
        member = memberByCode.get(memberCode.toUpperCase()) ?? null;
        if (!member) throw new Error(`Member code "${memberCode}" not found`);
      }
      if (memberRequiredCategories.includes(category) && !member) {
        throw new Error(`Member is required for category ${category}`);
      }

      await prisma.transaction.create({
        data: {
          memberId: member?.id ?? null,
          bankId: bank.id,
          date,
          description: String(r.description ?? ''),
          flow: flow as any,
          category: category as any,
          amount,
          createdBy: req.user!.memberId,
        },
      });

      if (category === 'SAVING_DEPOSIT' && member) affectedMemberIds.add(member.id);
      created++;
    } catch (e: any) {
      errors.push({ row: i + 1, error: e.message ?? 'Unknown error' });
    }
  }

  for (const memberId of affectedMemberIds) {
    await recalculateAllContributions(memberId);
  }

  res.status(201).json({ created, errors });
});

router.delete('/profit-distribution/:batchId', requireAdmin, async (req, res) => {
  await prisma.transaction.deleteMany({ where: { profitBatchId: req.params.batchId as string } });
  res.status(204).send();
});

export default router;
