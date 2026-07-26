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
    { label: 'Profit', value: 'PROFIT' },
    { label: 'Zakat', value: 'ZAKAT' },
  ],
  EXPENSE: [
    { label: 'Loan', value: 'LOAN_DISBURSEMENT' },
    { label: 'Savings Withdrawal', value: 'SAVING_WITHDRAWAL' },
    { label: 'Expense', value: 'EXPENSE' },
    { label: 'Zakat', value: 'ZAKAT' },
  ],
};

export const MEMBER_REQUIRED_CATEGORIES = [
  'SAVING_DEPOSIT',
  'SAVING_WITHDRAWAL',
  'LOAN_DISBURSEMENT',
  'LOAN_REPAYMENT',
];

// Member-required categories that have no way to satisfy that requirement on the Banks page's
// bank-only entry form (no member picker there) — loan disbursement/repayment are tied to a
// specific Loan record, and savings withdrawal always debits one member's balance. SAVING_DEPOSIT
// is member-required on the Transactions page but not here — that bank-only form still needs to
// offer Saving so admins can post the bank-side half of a member deposit recorded without a bank.
export const NO_PICKER_CATEGORIES = ['LOAN_DISBURSEMENT', 'LOAN_REPAYMENT', 'SAVING_WITHDRAWAL'];

// Unlike CATEGORY_OPTIONS (grouped by flow, where "Loan" alone is unambiguous since Deposit vs
// Withdrawal already disambiguates disbursement from repayment), this is a flat flow-agnostic
// list — e.g. the Transactions page's category filter shows every category side by side, so
// LOAN_REPAYMENT/LOAN_DISBURSEMENT need distinct labels here or they'd look like a duplicate.
export const CATEGORY_LABELS: Record<string, string> = {
  SAVING_DEPOSIT: 'Saving',
  SAVING_WITHDRAWAL: 'Savings Withdrawal',
  INTEREST: 'Interest',
  LOAN_REPAYMENT: 'Loan Repayment',
  LOAN_DISBURSEMENT: 'Loan Disbursement',
  EXPENSE: 'Expense',
  ZAKAT: 'Zakat',
  PROFIT: 'Profit',
};
