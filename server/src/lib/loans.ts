import { prisma } from './prisma';
import { Decimal } from '.prisma/client/runtime/library';

// A member has at most one ACTIVE loan at a time. A disbursement while the member
// already has an ACTIVE loan tops that loan up (principal + balance both increase)
// instead of creating a second Loan row — otherwise every repayment against that
// member becomes ambiguous ("which of your N active loans is this against?"). A new
// Loan row is only created when the member has no ACTIVE loan (first-ever loan, or a
// previous one was fully repaid/CLOSED).
export async function resolveDisbursementLoan(memberId: string, amount: number, disbursedDate: Date) {
  const existing = await prisma.loan.findFirst({ where: { memberId, status: 'ACTIVE' } });
  if (existing) {
    const updated = await prisma.loan.update({
      where: { id: existing.id },
      data: {
        principalAmount: new Decimal(existing.principalAmount).plus(amount),
        balance: new Decimal(existing.balance).plus(amount),
      },
    });
    return updated;
  }
  return prisma.loan.create({
    data: { memberId, principalAmount: amount, disbursedDate, balance: amount },
  });
}

// Recomputes a Loan's principal/balance/status purely from its remaining linked
// transactions. Call this after editing or deleting a LOAN_DISBURSEMENT/LOAN_REPAYMENT
// transaction so the loan never drifts out of sync with the transactions that back it.
// If no transactions reference the loan anymore, it's deleted outright rather than left
// behind as an orphaned zero-balance row (this is what was silently happening before —
// deleting loan transactions never touched the Loan row at all).
export async function recalculateLoan(loanId: string) {
  const txns = await prisma.transaction.findMany({
    where: { linkedLoanId: loanId, category: { in: ['LOAN_DISBURSEMENT', 'LOAN_REPAYMENT'] } },
    orderBy: { date: 'asc' },
  });

  const disbursements = txns.filter((t) => t.category === 'LOAN_DISBURSEMENT');
  if (disbursements.length === 0) {
    await prisma.loan.deleteMany({ where: { id: loanId } });
    return;
  }

  const principal = disbursements.reduce((sum, t) => sum.plus(t.amount), new Decimal(0));
  const repaid = txns
    .filter((t) => t.category === 'LOAN_REPAYMENT')
    .reduce((sum, t) => sum.plus(t.amount), new Decimal(0));
  const balance = Decimal.max(0, principal.minus(repaid));
  const earliestDisbursedDate = disbursements[0].date;

  await prisma.loan.update({
    where: { id: loanId },
    data: {
      principalAmount: principal,
      balance,
      disbursedDate: earliestDisbursedDate,
      status: balance.lte(0) ? 'CLOSED' : 'ACTIVE',
    },
  });
}
