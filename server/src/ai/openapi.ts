// OpenAPI description of the read-only AI endpoints (/api/ai/*, routes.ts).
// The AI assistant reads this to know which calls it may make and what each
// is for - the `summary` and parameter `description` texts are what its model
// chooses by, so they are written for a reader who knows nothing about the
// app. Served at GET /api/ai/openapi.json; the MCP tools (mcp.ts) are made
// from it too.
const date = (description: string) => ({ type: 'string', format: 'date', description });
const search = (whose: string) => ({
  name: 'search',
  in: 'query',
  required: false,
  description: `A member name in English letters or Malayalam ("Basheer P" or "ബഷീർ"), or a member code like KMCC0012; leave out for ${whose}`,
  schema: { type: 'string' },
});
const year = { name: 'year', in: 'query', required: false, description: 'The calendar year, e.g. 2026 (default this year; work out "last year" from today\'s date)', schema: { type: 'integer' } };

export const AI_OPENAPI = {
  openapi: '3.0.3',
  info: {
    title: 'KMCC Jeddah - read-only API for the AI assistant',
    version: '1.0.0',
    description:
      'KMCC savings and loan scheme: members, monthly savings dues, savings deposits and withdrawals, loans and repayments, ' +
      'profit, interest, zakat, expenses and bank balances. Amounts are in Indian rupees (₹). ' +
      'Answers follow the asking user: the admin sees every member and the accounts; a member sees only their own ' +
      'savings, dues, loans and transactions - never other members\' or KMCC\'s totals.',
  },
  servers: [{ url: '/api' }],
  paths: {
    '/ai/me': {
      get: {
        operationId: 'me',
        summary: 'The asking user: name, member code, role, savings balance, this year\'s monthly dues (paid and pending months), active loan balance and totals per category - for questions about "me", "my savings", "my dues", "my loan"',
      },
    },
    '/ai/member-summary': {
      get: {
        operationId: 'member_summary',
        summary: 'One member\'s full picture: savings deposited, withdrawn and balance, Profile balance, this year\'s dues, active loans, totals per category. The admin can look up any member (search); a member only themselves',
        parameters: [search("the asking member's own")],
      },
    },
    '/ai/members': {
      get: {
        operationId: 'members',
        summary: 'The member list (admin only): code, name, saving or loan member, join date, and how many members of each kind',
        parameters: [
          { name: 'type', in: 'query', required: false, description: 'Only saving members or only loan members', schema: { type: 'string', enum: ['saving', 'loan'] } },
          { ...search('every member'), description: 'A member name (English letters or Malayalam) or member code, to find members' },
        ],
      },
    },
    '/ai/dues': {
      get: {
        operationId: 'dues',
        summary: 'One member\'s monthly savings dues for a year, month by month: due, paid, status (paid / partial / pending), pending months and pending amount - "my dues", "which months have I not paid", "dues of Basheer in 2025". A member only their own',
        parameters: [year, search("the asking member's own")],
      },
    },
    '/ai/pending-dues': {
      get: {
        operationId: 'pending_dues',
        summary: 'Who has not paid their monthly savings dues in a year, up to this month: each member\'s pending months and amount, and the total (admin) - "who has pending dues", "pending of last year". For a member: only their own',
        parameters: [year],
      },
    },
    '/ai/transactions': {
      get: {
        operationId: 'transactions',
        summary: 'Transactions, newest first: date, member, category, in or out, amount, description, with the count and totals of all that match - "my payments this year", "deposits of Basheer", "zakat paid in 2025". A member only their own',
        parameters: [
          search("every member's (admin) or the asking member's own"),
          { name: 'category', in: 'query', required: false, description: 'One or more, comma-separated: SAVING_DEPOSIT, SAVING_WITHDRAWAL, LOAN_DISBURSEMENT (loan given), LOAN_REPAYMENT, PROFIT, INTEREST, ZAKAT, EXPENSE', schema: { type: 'string' } },
          { name: 'flow', in: 'query', required: false, description: 'in = money coming in to KMCC (deposits, repayments), out = money going out (loans given, withdrawals, expenses)', schema: { type: 'string', enum: ['in', 'out'] } },
          { name: 'from', in: 'query', required: false, description: 'First day YYYY-MM-DD', schema: date('First day') },
          { name: 'to', in: 'query', required: false, description: 'Last day YYYY-MM-DD', schema: date('Last day') },
          { name: 'limit', in: 'query', required: false, description: 'How many to list, 1-100 (default 20); the totals always cover all that match', schema: { type: 'integer' } },
        ],
      },
    },
    '/ai/loans': {
      get: {
        operationId: 'loans',
        summary: 'Loans: member, principal, balance still owed, repaid, date given, last repayment, and the total balance - "who has loans", "my loan balance". A member only their own',
        parameters: [
          search("every member's (admin) or the asking member's own"),
          { name: 'status', in: 'query', required: false, description: 'active (default), closed (fully repaid) or all', schema: { type: 'string', enum: ['active', 'closed', 'all'] } },
        ],
      },
    },
    '/ai/totals': {
      get: {
        operationId: 'totals',
        summary: 'KMCC\'s totals as on the admin dashboard (admin only): total savings, loans outstanding, bank balance, profit, net interest, expense, net zakat, total inflow and outflow, and member counts',
      },
    },
    '/ai/banks': {
      get: {
        operationId: 'banks',
        summary: 'Each bank account\'s current balance and the total (admin only)',
      },
    },
    '/ai/flow-by-category': {
      get: {
        operationId: 'flow_by_category',
        summary: 'All money in or all money out, totalled per category, for a period (admin only) - "what did KMCC spend on this year", "income by category"',
        parameters: [
          { name: 'flow', in: 'query', required: false, description: 'in or out (default out)', schema: { type: 'string', enum: ['in', 'out'] } },
          { name: 'from', in: 'query', required: false, description: 'First day YYYY-MM-DD (default: from the start)', schema: date('First day') },
          { name: 'to', in: 'query', required: false, description: 'Last day YYYY-MM-DD (default: today)', schema: date('Last day') },
        ],
      },
    },
    '/ai/finance-by-month': {
      get: {
        operationId: 'finance_by_month',
        summary: 'Money in, money out and savings deposits for each month of a year - for "month by month", trends and charts over time. Totals only, no categories (those are in flow_by_category). The admin gets all of KMCC; a member only their own transactions',
        parameters: [year],
      },
    },
    '/ai/finance-by-day': {
      get: {
        operationId: 'finance_by_day',
        summary: 'Money in and out for each day of the last N days (admin only) - for "the last 30 days", "day by day", daily charts. Totals only, no categories',
        parameters: [
          { name: 'days', in: 'query', required: false, description: 'How many days, ending today (1-92, default 30)', schema: { type: 'integer' } },
        ],
      },
    },
  },
};
