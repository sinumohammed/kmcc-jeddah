import { prisma } from './prisma';
import { Decimal } from '.prisma/client/runtime/library';

/**
 * Ensures MonthlyContribution rows exist for a saving member from their join
 * month/year through the given target year/month. Each year must have a
 * MonthlyAmountHistory entry (set at registration or year-start) to know the
 * due amount for that year's months.
 */
export async function ensureContributionsUpTo(
  memberId: string,
  targetYear: number,
  targetMonth: number
) {
  const member = await prisma.member.findUniqueOrThrow({ where: { id: memberId } });
  if (!member.isSavingMember) return;

  const join = member.joinDate;
  const startYear = join.getFullYear();
  const startMonth = join.getMonth() + 1;

  for (let year = startYear; year <= targetYear; year++) {
    const amountHistory = await prisma.monthlyAmountHistory.findUnique({
      where: { memberId_year: { memberId, year } },
    });
    if (!amountHistory) continue; // amount not set for this year yet, skip

    const fromMonth = year === startYear ? startMonth : 1;
    const toMonth = year === targetYear ? targetMonth : 12;

    for (let month = fromMonth; month <= toMonth; month++) {
      await prisma.monthlyContribution.upsert({
        where: { memberId_year_month: { memberId, year, month } },
        update: {},
        create: {
          memberId,
          year,
          month,
          amountDue: amountHistory.amount,
          amountPaid: 0,
          status: 'PENDING',
        },
      });
    }
  }
}

/**
 * Applies a deposit amount to a saving member's oldest pending/partial
 * months first, so a single lump-sum payment can clear multiple back-months.
 * Only allocates within the deposit's own calendar year — each year's dues
 * are a separate obligation, so a payment dated in 2025 must never fill
 * 2026's months (and vice versa).
 */
export async function allocateDepositToContributions(
  memberId: string,
  amount: Decimal | number,
  paidDate: Date
) {
  let remaining = new Decimal(amount);
  const year = paidDate.getFullYear();

  const pending = await prisma.monthlyContribution.findMany({
    where: { memberId, year, status: { in: ['PENDING', 'PARTIAL'] } },
    orderBy: [{ month: 'asc' }],
  });

  for (const row of pending) {
    if (remaining.lte(0)) break;
    const due = new Decimal(row.amountDue).minus(row.amountPaid);
    const applied = Decimal.min(due, remaining);
    const newPaid = new Decimal(row.amountPaid).plus(applied);
    const isPaid = newPaid.gte(row.amountDue);

    await prisma.monthlyContribution.update({
      where: { id: row.id },
      data: {
        amountPaid: newPaid,
        status: isPaid ? 'PAID' : 'PARTIAL',
        paidDate: isPaid ? paidDate : row.paidDate,
      },
    });

    remaining = remaining.minus(applied);
  }
}

/**
 * Recomputes a saving member's entire paid/pending contribution history from
 * scratch: resets all months to unpaid, then replays every remaining
 * SAVING_DEPOSIT transaction (oldest first) through the same allocation
 * logic used when a deposit is created. Call this after a saving-deposit
 * transaction is deleted or edited so the contribution schedule stays in
 * sync with the actual transaction ledger.
 */
export async function recalculateAllContributions(memberId: string) {
  await prisma.monthlyContribution.updateMany({
    where: { memberId },
    data: { amountPaid: 0, status: 'PENDING', paidDate: null },
  });

  const deposits = await prisma.transaction.findMany({
    where: { memberId, category: 'SAVING_DEPOSIT' },
    orderBy: { date: 'asc' },
  });

  for (const txn of deposits) {
    await allocateDepositToContributions(memberId, txn.amount, txn.date);
  }
}
