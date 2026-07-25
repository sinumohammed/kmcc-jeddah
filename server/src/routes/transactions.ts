import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireAdmin } from '../middleware/auth';
import {
  ensureContributionsUpTo,
  allocateDepositToContributions,
  recalculateAllContributions,
} from '../lib/contributions';
import { resolveDisbursementLoan, recalculateLoan } from '../lib/loans';
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
  // SAVING_WITHDRAWAL always debits one member's savings, so it's required too.
  const memberLinkedCategories = ['LOAN_DISBURSEMENT', 'LOAN_REPAYMENT', 'SAVING_WITHDRAWAL'];
  if (memberLinkedCategories.includes(category) && !memberId) {
    return res.status(400).json({ error: 'A member must be selected for this category' });
  }
  if (category === 'LOAN_REPAYMENT' && !linkedLoanId) {
    return res.status(400).json({ error: 'A loan must be selected for a loan repayment' });
  }

  // LOAN_DISBURSEMENT has no "existing loan" to link to (unlike LOAN_REPAYMENT) — a member
  // has at most one ACTIVE loan at a time, so this tops up their existing active loan if
  // they have one, or creates a brand new Loan record if not (see resolveDisbursementLoan).
  let resolvedLinkedLoanId = linkedLoanId || null;
  if (category === 'LOAN_DISBURSEMENT' && memberId) {
    const loan = await resolveDisbursementLoan(memberId, amount, new Date(date));
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

  // An edited amount/category on a loan-linked transaction (e.g. correcting a repayment
  // amount) must be reflected back onto the Loan it's tied to, not just the transaction row.
  const affectedLoanIds = new Set<string>();
  if (before.linkedLoanId) affectedLoanIds.add(before.linkedLoanId);
  if (txn.linkedLoanId) affectedLoanIds.add(txn.linkedLoanId);
  for (const loanId of affectedLoanIds) {
    await recalculateLoan(loanId);
  }

  res.json(txn);
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const id = req.params.id as string;
  const txn = await prisma.transaction.delete({ where: { id } });

  if (txn.category === 'SAVING_DEPOSIT' && txn.memberId) {
    await recalculateAllContributions(txn.memberId);
  }

  // Deleting a LOAN_DISBURSEMENT/LOAN_REPAYMENT must un-apply its effect on the Loan it's
  // linked to (previously this silently left orphaned/stale Loan rows behind).
  if (txn.linkedLoanId) {
    await recalculateLoan(txn.linkedLoanId);
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

// Bulk import for historical/plain transactions (statements, back-entry), and the
// round-trip target for the CSV this same page exports. LOAN_DISBURSEMENT can be
// inferred entirely from one row (it always creates a new Loan). LOAN_REPAYMENT needs
// a specific existing Loan to apply balance math against — the optional LoanId column
// (present in export, exposing Transaction.linkedLoanId) disambiguates when a member has
// more than one active loan; otherwise we fall back to their single active loan.
const IMPORTABLE_CATEGORIES = new Set([
  'SAVING_DEPOSIT',
  'SAVING_WITHDRAWAL',
  'INTEREST',
  'PROFIT',
  'EXPENSE',
  'ZAKAT',
  'LOAN_DISBURSEMENT',
  'LOAN_REPAYMENT',
]);
const CATEGORY_ALIASES: Record<string, string> = {
  SAVING: 'SAVING_DEPOSIT',
  SAVINGS: 'SAVING_DEPOSIT',
  DEPOSIT: 'SAVING_DEPOSIT',
  'SAVINGS WITHDRAWAL': 'SAVING_WITHDRAWAL',
  'SAVING WITHDRAWAL': 'SAVING_WITHDRAWAL',
  LOAN: 'LOAN_REPAYMENT',
};
const FLOW_ALIASES: Record<string, string> = {
  DEPOSIT: 'INCOME',
  WITHDRAWAL: 'EXPENSE',
};

// Accepts the ISO format this page exports (YYYY-MM-DD) as well as DD/MM/YYYY (or
// DD-MM-YYYY), since opening the exported CSV in Excel and saving it back commonly
// rewrites dates into that regional format.
function parseImportDate(raw: string): Date | null {
  const s = String(raw ?? '').trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (month > 12) return null;
    const d = new Date(Date.UTC(Number(m[3]), month - 1, day));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const fallback = new Date(s);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

// dryRun:true validates every row and reports what each row would do (including
// which loan a LOAN_REPAYMENT would hit) without writing anything to the DB, so the
// frontend can render an import preview and let the admin resolve ambiguous rows
// (a member with multiple active loans) by picking a LoanId before committing.
router.post('/import', requireAdmin, async (req, res) => {
  const { rows, dryRun } = req.body ?? {};
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'rows array is required' });
  }

  const banks = await prisma.bank.findMany();
  const bankByName = new Map(banks.map((b) => [b.name.trim().toLowerCase(), b]));
  const members = await prisma.member.findMany();
  const memberByCode = new Map(members.map((m) => [m.memberCode.trim().toUpperCase(), m]));

  const memberRequiredCategories = ['SAVING_DEPOSIT', 'SAVING_WITHDRAWAL', 'LOAN_DISBURSEMENT', 'LOAN_REPAYMENT'];
  const affectedMemberIds = new Set<string>();
  const errors: { row: number; error: string }[] = [];
  const preview: any[] = [];
  let created = 0;

  // dryRun never writes to the DB, so a disbursement earlier in the batch isn't visible to
  // prisma queries a later repayment row makes — this tracks each member's resulting active
  // loan (balance + label) across the simulated batch so the preview matches what the live
  // run (which does write row-by-row) will actually do.
  const virtualLoans = new Map<string, { id: string; balance: Decimal; label: string }>();

  // Process LOAN_DISBURSEMENT rows before everything else, regardless of their position in
  // the sheet, so a disbursement + same-batch repayment for the same member works no matter
  // which row comes first in the CSV (Array#sort is stable, so relative order is otherwise
  // preserved). Results are keyed by original row number so output ordering is unaffected.
  const processingOrder = rows.map((_: any, i: number) => i).sort((a: number, b: number) => {
    const rank = (idx: number) => {
      const raw = String(rows[idx]?.category ?? '').trim().toUpperCase();
      return (CATEGORY_ALIASES[raw] ?? raw) === 'LOAN_REPAYMENT' ? 1 : 0;
    };
    return rank(a) - rank(b);
  });

  for (const i of processingOrder) {
    const r = rows[i] ?? {};
    const rowNum = i + 1;
    try {
      const flowRaw = String(r.flow ?? '').trim().toUpperCase();
      const flow = FLOW_ALIASES[flowRaw] ?? flowRaw;
      if (!['INCOME', 'EXPENSE'].includes(flow)) throw new Error(`Invalid flow "${r.flow}"`);

      const categoryRaw = String(r.category ?? '').trim().toUpperCase();
      const category = CATEGORY_ALIASES[categoryRaw] ?? categoryRaw;
      if (!IMPORTABLE_CATEGORIES.has(category)) {
        throw new Error(`Category "${r.category}" is not supported for import`);
      }

      // Every category except SAVING_DEPOSIT requires a bank, mirroring POST /transactions.
      const bankName = String(r.bankName ?? r.bank ?? '').trim();
      const bank = bankName ? bankByName.get(bankName.toLowerCase()) ?? null : null;
      if (bankName && !bank) throw new Error(`Bank "${bankName}" not found`);
      if (category !== 'SAVING_DEPOSIT' && !bank) {
        throw new Error(`Bank is required for category ${category}`);
      }

      const amount = Number(r.amount);
      if (!amount || amount <= 0) throw new Error(`Invalid amount "${r.amount}"`);

      const date = parseImportDate(r.date);
      if (!date) throw new Error(`Invalid date "${r.date}"`);

      let member: (typeof members)[number] | null = null;
      const memberCode = String(r.memberCode ?? '').trim();
      if (memberCode) {
        member = memberByCode.get(memberCode.toUpperCase()) ?? null;
        if (!member) throw new Error(`Member code "${memberCode}" not found`);
      }
      if (memberRequiredCategories.includes(category) && !member) {
        throw new Error(`Member is required for category ${category}`);
      }

      const summary = {
        row: rowNum,
        memberCode: member?.memberCode ?? '',
        memberName: member?.name ?? '',
        bankName: bank?.name ?? '',
        flow,
        category,
        amount,
        date: date.toISOString(),
        description: String(r.description ?? ''),
      };

      let linkedLoanId: string | null = null;
      let loanNote = '';
      if (category === 'LOAN_DISBURSEMENT' && member) {
        if (dryRun) {
          const virtual = virtualLoans.get(member.id);
          if (virtual) {
            virtual.balance = virtual.balance.plus(amount);
            loanNote = `Tops up ${virtual.label} (running balance ₹${virtual.balance})`;
          } else {
            const existingActive = await prisma.loan.findFirst({
              where: { memberId: member.id, status: 'ACTIVE' },
            });
            if (existingActive) {
              const newBalance = new Decimal(existingActive.balance).plus(amount);
              const label = `loan ${existingActive.id.slice(-6)}`;
              virtualLoans.set(member.id, { id: existingActive.id, balance: newBalance, label });
              loanNote = `Tops up existing ${label} (balance ₹${existingActive.balance} → ₹${newBalance})`;
            } else {
              virtualLoans.set(member.id, { id: 'new', balance: new Decimal(amount), label: 'the new loan created earlier in this import' });
              loanNote = 'Creates a new loan';
            }
          }
        } else {
          const loan = await resolveDisbursementLoan(member.id, amount, date);
          linkedLoanId = loan.id;
        }
      }
      if (category === 'LOAN_REPAYMENT' && member) {
        const loanIdRaw = String(r.loanId ?? '').trim();
        let loan: { id: string; balance: Decimal | string | number };
        if (loanIdRaw) {
          const found = await prisma.loan.findFirst({ where: { id: loanIdRaw, memberId: member.id } });
          if (!found) throw new Error(`Loan "${loanIdRaw}" not found for member ${memberCode}`);
          loan = found;
        } else {
          const virtual = virtualLoans.get(member.id);
          if (virtual) {
            loan = virtual;
          } else {
            const activeLoans = await prisma.loan.findMany({
              where: { memberId: member.id, status: 'ACTIVE' },
              orderBy: { disbursedDate: 'asc' },
            });
            if (activeLoans.length === 0) throw new Error(`No active loan found for member ${memberCode}`);
            if (activeLoans.length > 1) {
              if (dryRun) {
                preview.push({
                  ...summary,
                  status: 'needsLoanId',
                  candidates: activeLoans.map((l) => ({
                    id: l.id,
                    balance: l.balance,
                    disbursedDate: l.disbursedDate,
                  })),
                });
                continue;
              }
              throw new Error(
                `Member ${memberCode} has multiple active loans; include a LoanId column to disambiguate`
              );
            }
            loan = activeLoans[0];
          }
        }
        if (dryRun) {
          const label = virtualLoans.get(member.id)?.label ?? `loan ${loan.id.slice(-6)}`;
          loanNote = `Repays ${label} (balance ₹${loan.balance})`;
          const newVirtualBalance = Decimal.max(0, new Decimal(loan.balance).minus(amount));
          virtualLoans.set(member.id, { id: loan.id, balance: newVirtualBalance, label });
        } else {
          const newBalance = new Decimal(loan.balance).minus(amount);
          await prisma.loan.update({
            where: { id: loan.id },
            data: { balance: newBalance.lt(0) ? 0 : newBalance, status: newBalance.lte(0) ? 'CLOSED' : 'ACTIVE' },
          });
          linkedLoanId = loan.id;
        }
      }

      if (dryRun) {
        preview.push({ ...summary, status: 'ok', loanNote });
        continue;
      }

      await prisma.transaction.create({
        data: {
          memberId: member?.id ?? null,
          bankId: bank?.id ?? null,
          date,
          description: String(r.description ?? ''),
          flow: flow as any,
          category: category as any,
          amount,
          linkedLoanId,
          createdBy: req.user!.memberId,
        },
      });

      if (category === 'SAVING_DEPOSIT' && member) affectedMemberIds.add(member.id);
      created++;
    } catch (e: any) {
      if (dryRun) {
        preview.push({ row: rowNum, status: 'error', error: e.message ?? 'Unknown error' });
      } else {
        errors.push({ row: rowNum, error: e.message ?? 'Unknown error' });
      }
    }
  }

  if (dryRun) {
    preview.sort((a, b) => a.row - b.row);
    return res.json({ preview });
  }

  for (const memberId of affectedMemberIds) {
    await recalculateAllContributions(memberId);
  }

  errors.sort((a, b) => a.row - b.row);
  res.status(201).json({ created, errors });
});

router.delete('/profit-distribution/:batchId', requireAdmin, async (req, res) => {
  await prisma.transaction.deleteMany({ where: { profitBatchId: req.params.batchId as string } });
  res.status(204).send();
});

export default router;
