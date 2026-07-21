export type Role = 'ADMIN' | 'MEMBER';

export interface AuthMember {
  id: string;
  memberCode: string;
  name: string;
  role: Role;
  isSavingMember: boolean;
  isLoanMember: boolean;
}

export interface Member extends AuthMember {
  mobile: string;
  address?: string | null;
  joinDate: string;
  active: boolean;
  monthlyAmounts?: { id: string; year: number; amount: string }[];
  loans?: Loan[];
}

export interface Bank {
  id: string;
  name: string;
  accountHolderName?: string | null;
  accountNumber?: string | null;
  branchName?: string | null;
  branchSolId?: string | null;
  customerId?: string | null;
  accountOpenDate?: string | null;
  modeOfOperation?: string | null;
  jointHolders?: string | null;
  ifscCode?: string | null;
  micrCode?: string | null;
  swiftCode?: string | null;
  currency: string;
  nominationRegistered?: boolean | null;
  openingBalance: string;
  active: boolean;
}

export type TxnFlow = 'INCOME' | 'EXPENSE';
export type TxnCategory =
  | 'SAVING_DEPOSIT'
  | 'INTEREST'
  | 'PROFIT'
  | 'LOAN_DISBURSEMENT'
  | 'LOAN_REPAYMENT'
  | 'EXPENSE'
  | 'ZAKAT';

export interface Transaction {
  id: string;
  memberId?: string | null;
  member?: { id: string; name: string; memberCode: string } | null;
  bankId: string;
  bank?: Bank;
  date: string;
  description: string;
  flow: TxnFlow;
  category: TxnCategory;
  amount: string;
  linkedLoanId?: string | null;
  profitBatchId?: string | null;
}

export interface Loan {
  id: string;
  memberId: string;
  principalAmount: string;
  disbursedDate: string;
  status: 'ACTIVE' | 'CLOSED';
  balance: string;
  transactions?: Transaction[];
}

export interface MonthlyContribution {
  id: string;
  year: number;
  month: number;
  amountDue: string;
  amountPaid: string;
  status: 'PENDING' | 'PARTIAL' | 'PAID';
  paidDate?: string | null;
}

export interface BankSummary {
  bankId: string;
  name: string;
  balance: string;
}

export interface DashboardSummary {
  totalSavingsAmount: string;
  totalLoanAmount: string;
  totalBankBalance: string;
  totalProfit: string;
  totalInterestAmount: string;
  totalExpense: string;
  totalZakat: string;
}
