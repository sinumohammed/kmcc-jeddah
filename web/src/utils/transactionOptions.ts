import type { TxnFlow } from '../types';

export const FLOW_OPTIONS = [
  { label: 'Deposit', value: 'INCOME' },
  { label: 'Withdrawal', value: 'EXPENSE' },
];

export const CATEGORY_OPTIONS: Record<TxnFlow, { label: string; value: string }[]> = {
  INCOME: [
    { label: 'Saving', value: 'SAVING_DEPOSIT' },
    { label: 'Interest', value: 'INTEREST' },
    { label: 'Loan', value: 'LOAN_REPAYMENT' },
    { label: 'Zakat', value: 'ZAKAT' },
  ],
  EXPENSE: [
    { label: 'Loan', value: 'LOAN_DISBURSEMENT' },
    { label: 'Expense', value: 'EXPENSE' },
    { label: 'Zakat', value: 'ZAKAT' },
  ],
};

export const MEMBER_REQUIRED_CATEGORIES = ['SAVING_DEPOSIT', 'LOAN_DISBURSEMENT', 'LOAN_REPAYMENT'];

// Categories that can never be entered without a member because they're tied to a specific
// Loan record (disbursement creates one, repayment pays down an existing one). SAVING_DEPOSIT
// is member-required on the Transactions page but not here — the Banks page's bank-only entry
// form (no member picker) still needs to offer Saving so admins can post the bank-side half of
// a member deposit that was recorded without a bank.
export const LOAN_LINKED_CATEGORIES = ['LOAN_DISBURSEMENT', 'LOAN_REPAYMENT'];

// PROFIT has no entry here because it's only ever created via the Distribute Profit flow, not
// picked from this dropdown — but it still needs a human label for filter tags/summaries.
export const CATEGORY_LABELS: Record<string, string> = {
  SAVING_DEPOSIT: 'Saving',
  INTEREST: 'Interest',
  LOAN_REPAYMENT: 'Loan',
  LOAN_DISBURSEMENT: 'Loan',
  EXPENSE: 'Expense',
  ZAKAT: 'Zakat',
  PROFIT: 'Profit',
};
