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
