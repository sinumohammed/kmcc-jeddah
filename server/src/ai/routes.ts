// --- Read-only API for the AI assistant (/api/ai/*) ---
// The AI chat service (a separate app) answers members' questions from this
// data: "how much have I saved?", "which months are pending?", "what is the
// total bank balance?". Separate from the routes the app's own screens use, so
// a UI change never breaks it, and shaped for the AI: only GET, nothing
// written (dues are worked out, not created), and only the fields it needs -
// no mobile numbers, addresses, password hashes or bank account details.
//
// Access is one long random token (KMCC_AI_TOKEN, set on Vercel), sent as
// "Authorization: Bearer <token>" - not a login, so it can only read these
// endpoints. Without KMCC_AI_TOKEN the whole section answers 503. Every call
// also carries the member it is for (X-User-Token, aiUser.ts): the admin sees
// everything; a member only their own savings, monthly dues, loans and
// transactions - any other member's answers 403. There are no guests.
//
// The endpoints are described for the AI in openapi.ts (served at
// /api/ai/openapi.json), and are also MCP tools at /api/ai/mcp (mcp.ts).
import crypto from 'node:crypto';
import express, { Request, Response, NextFunction } from 'express';
import { Decimal } from '.prisma/client/runtime/library';
import { prisma } from '../lib/prisma';
import { dashboardSummary, flowSummary, membersSummary, banksSummary } from '../lib/dashboard';
import { findMembers } from './nameMatch';
import { aiUserFrom, AiUser } from './aiUser';
import { AI_OPENAPI } from './openapi';
import { aiMcpHandler } from './mcp';
import { KMCC_TIMEZONE, today, dayOf, startOfDay, nextDay, yearMonthOf } from './time';

const KMCC_AI_TOKEN = process.env.KMCC_AI_TOKEN;
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest();

// What a handler gets: the query (strings, as Express gives them) and the user.
// The MCP tools (mcp.ts) build the same thing from a tool call's arguments.
export interface AiRequest {
  query: Record<string, string | undefined>;
  aiUser: AiUser;
}
type Handler = (req: AiRequest) => Promise<unknown>;

const statusError = (status: number, message: string) => Object.assign(new Error(message), { status });
const forbidden = (message: string) => statusError(403, message);
const badRequest = (message: string) => statusError(400, message);
const adminOnly = (req: AiRequest, what: string) => {
  if (!req.aiUser.isAdmin) throw forbidden(`only the admin can see ${what} - a member sees only their own savings, dues, loans and transactions`);
};
const ONLY_YOURS = (what: string) => `Only the asking member's own ${what} - members cannot see other members' data.`;

// Every amount here is in rupees - said once per response. With bare numbers
// the AI may answer in dollars.
const AMOUNTS_IN = 'INR (Indian rupees, ₹)';
const inRupees = (data: object) => ({ amountsIn: AMOUNTS_IN, ...data });
const money = (d: Decimal | number | string | null | undefined) => Number(new Decimal(d ?? 0).toFixed(2));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// The app's own names for the categories (web/src/utils/transactionOptions.ts).
const CATEGORY_LABELS: Record<string, string> = {
  SAVING_DEPOSIT: 'Saving deposit',
  SAVING_WITHDRAWAL: 'Savings withdrawal',
  INTEREST: 'Interest',
  PROFIT: 'Profit',
  LOAN_DISBURSEMENT: 'Loan given',
  LOAN_REPAYMENT: 'Loan repayment',
  EXPENSE: 'Expense',
  ZAKAT: 'Zakat',
};
const CATEGORIES = Object.keys(CATEGORY_LABELS);
// The app's two flows, as the member's Profile statement and PDF show them:
// INCOME = Credit (money received: a deposit, a repayment, profit credited to
// the member), EXPENSE = Debit (money paid out: a withdrawal, a loan given, an
// expense). "in"/"out" read wrongly for profit credited to a member.
const FLOW_LABELS = { INCOME: 'credit', EXPENSE: 'debit' } as const;
// The flow filter: credit/debit, or in/out as before.
const flowParam = (value: unknown) => {
  const f = String(value ?? '').toLowerCase();
  if (!f) return null;
  if (['credit', 'in'].includes(f)) return 'INCOME' as const;
  if (['debit', 'out'].includes(f)) return 'EXPENSE' as const;
  throw badRequest('flow: "credit" (in) or "debit" (out)');
};

const clampInt = (value: unknown, min: number, max: number, fallback: number) => Math.min(Math.max(parseInt(String(value ?? ''), 10) || fallback, min), max);
const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const searchOf = (req: AiRequest) => String(req.query.search ?? '').trim();
const yearOf = (req: AiRequest) => clampInt(req.query.year, 2000, 2100, yearMonthOf(new Date()).year);

// --- members ---

const MEMBER_FIELDS = { id: true, memberCode: true, name: true, role: true, isSavingMember: true, isLoanMember: true, joinDate: true } as const;
type MemberRow = { id: string; memberCode: string; name: string; role: 'ADMIN' | 'MEMBER'; isSavingMember: boolean; isLoanMember: boolean; joinDate: Date };

const activeMembers = (): Promise<MemberRow[]> =>
  prisma.member.findMany({ where: { active: true }, select: MEMBER_FIELDS, orderBy: { memberCode: 'asc' } });
const nameOf = (m: { memberCode: string; name: string }) => ({ code: m.memberCode, name: m.name.trim() });
const typeOf = (m: MemberRow) =>
  m.isSavingMember ? 'saving member' : m.isLoanMember ? 'loan member' : m.role === 'ADMIN' ? 'admin' : 'member (neither saving nor loan)';

// The members a call is about: the asker by default; with a search, the
// members it names - for the admin up to `max`, for a member only themselves.
// `noMatch` when the search names nobody.
async function membersFor(req: AiRequest, what: string, max = 3): Promise<{ members: MemberRow[]; noMatch?: object }> {
  const all = await activeMembers();
  const self = all.find((m) => m.id === req.aiUser.memberId);
  const search = searchOf(req);
  if (!search) {
    if (!self) throw forbidden('this login is no longer an active member');
    return { members: [self] };
  }
  const found = findMembers(search, all);
  // A member only ever sees themselves: a search that names nobody (the model
  // passed "my" or "എന്റെ" as the search) is about them - not "no record".
  if (!found.length && !req.aiUser.isAdmin && self) return { members: [self] };
  if (!found.length) {
    return {
      members: [],
      noMatch: req.aiUser.isAdmin
        ? {
            noMatch: `No member matched "${search}". All members are listed - pick the one meant, or say that nobody matches.`,
            allMembers: all.map(nameOf),
          }
        : { noMatch: `No member matched "${search}". ${ONLY_YOURS(what)}` },
    };
  }
  if (req.aiUser.isAdmin) return { members: found.slice(0, max) };
  if (self && found.some((m) => m.id === self.id)) return { members: [self] };
  throw forbidden(`only the admin can see other members' ${what}`);
}

// --- monthly dues ---

// How many months of `year` are due by now: all 12 of a past year, up to
// this month of this year, none of a future year.
function monthsDueIn(year: number) {
  const now = yearMonthOf(new Date());
  return year < now.year ? 12 : year === now.year ? now.month : 0;
}

// Each saving member's monthly dues for a year, worked out the way the app
// does (lib/contributions.ts) - but without writing anything: the app makes a
// month's row only when someone opens the profile or records a deposit, so a
// month with no row yet is shown as pending at that year's monthly amount.
async function duesFor(members: MemberRow[], year: number) {
  const saving = members.filter((m) => m.isSavingMember);
  const ids = saving.map((m) => m.id);
  const [amounts, rows] = await Promise.all([
    prisma.monthlyAmountHistory.findMany({ where: { memberId: { in: ids }, year } }),
    prisma.monthlyContribution.findMany({ where: { memberId: { in: ids }, year }, orderBy: { month: 'asc' } }),
  ]);
  const upTo = monthsDueIn(year);
  return saving.map((m) => {
    const amount = amounts.find((a) => a.memberId === m.id)?.amount ?? null;
    const own = rows.filter((r) => r.memberId === m.id);
    // As ensureContributionsUpTo: from the join month in the join year.
    const from = year === m.joinDate.getFullYear() ? m.joinDate.getMonth() + 1 : 1;
    const months: { month: number; due: Decimal; paid: Decimal; status: string; paidDate: Date | null }[] = [];
    if (amount !== null && year >= m.joinDate.getFullYear()) {
      for (let month = from; month <= upTo; month++) {
        const row = own.find((r) => r.month === month);
        months.push(row
          ? { month, due: row.amountDue, paid: row.amountPaid, status: row.status, paidDate: row.paidDate }
          : { month, due: new Decimal(amount), paid: new Decimal(0), status: 'PENDING', paidDate: null });
      }
    }
    // A later month already paid (in advance) still counts as paid.
    for (const row of own) {
      if (row.month > upTo && new Decimal(row.amountPaid).gt(0)) {
        months.push({ month: row.month, due: row.amountDue, paid: row.amountPaid, status: row.status, paidDate: row.paidDate });
      }
    }
    const open = months.filter((x) => x.month <= upTo && x.status !== 'PAID');
    const pendingAmount = open.reduce((sum, x) => sum.plus(new Decimal(x.due).minus(x.paid)), new Decimal(0));
    return {
      member: m,
      monthlyAmount: amount === null ? null : money(amount),
      months,
      monthsPaid: months.filter((x) => x.status === 'PAID').length,
      open,
      pendingAmount,
    };
  });
}
type Dues = Awaited<ReturnType<typeof duesFor>>[number];

const monthLabel = (month: number, year: number) => `${MONTHS[month - 1]} ${year}`;
function duesView(d: Dues, year: number) {
  return {
    member: nameOf(d.member),
    year,
    monthlyAmount: d.monthlyAmount,
    ...(d.monthlyAmount === null ? { note: `No monthly amount is set for ${year}, so no dues are counted for that year.` } : {}),
    monthsDueSoFar: monthsDueIn(year),
    monthsPaid: d.monthsPaid,
    pendingMonths: d.open.map((x) => (new Decimal(x.paid).gt(0) ? `${monthLabel(x.month, year)} (partly paid: ${money(x.paid)} of ${money(x.due)})` : monthLabel(x.month, year))),
    pendingAmount: money(d.pendingAmount),
    months: d.months.map((x) => ({
      month: monthLabel(x.month, year),
      due: money(x.due),
      paid: money(x.paid),
      status: x.status.toLowerCase(),
      ...(x.paidDate ? { paidOn: dayOf(x.paidDate) } : {}),
    })),
  };
}

// --- one member's picture ---

async function memberSummary(m: MemberRow) {
  const year = yearMonthOf(new Date()).year;
  const [sums, loans, dues] = await Promise.all([
    prisma.transaction.groupBy({ by: ['category', 'flow'], where: { memberId: m.id }, _sum: { amount: true }, _count: true }),
    prisma.loan.findMany({ where: { memberId: m.id }, orderBy: { disbursedDate: 'desc' } }),
    m.isSavingMember ? duesFor([m], year) : Promise.resolve([]),
  ]);
  const amountOf = (category: string | null, flow: 'INCOME' | 'EXPENSE') =>
    sums
      .filter((x) => (!category || x.category === category) && x.flow === flow)
      .reduce((t, x) => t.plus(new Decimal(x._sum.amount ?? 0)), new Decimal(0));
  const credited = (category: string) => amountOf(category, 'INCOME');
  const debited = (category: string) => amountOf(category, 'EXPENSE');
  const totalCredit = amountOf(null, 'INCOME');
  const totalDebit = amountOf(null, 'EXPENSE');
  // Savings paid out: the Savings Withdrawal category, and older withdrawals
  // recorded as a Saving entry with the Withdrawal (debit) flow - that
  // category came later (July 2026).
  const deposited = credited('SAVING_DEPOSIT');
  const withdrawn = debited('SAVING_WITHDRAWAL').plus(debited('SAVING_DEPOSIT'));
  const active = loans.filter((l) => l.status === 'ACTIVE');
  const count = sums.reduce((t, x) => t + x._count, 0);
  return {
    member: nameOf(m),
    type: typeOf(m),
    joined: dayOf(m.joinDate),
    // The member's statement, as on their Profile page and PDF: every
    // transaction, credits minus debits = the Profile "Balance".
    statement: {
      transactions: count,
      totalCredit: money(totalCredit),
      totalDebit: money(totalDebit),
      balance: money(totalCredit.minus(totalDebit)),
      note: 'credit = money received for the member (savings deposits, profit, interest, loan repayments); debit = money paid out to them (withdrawals, loans given). balance = the Balance on their Profile page.',
    },
    savings: {
      deposited: money(deposited),
      withdrawn: money(withdrawn),
      savingsBalance: money(deposited.minus(withdrawn)),
    },
    profitCredited: money(credited('PROFIT').minus(debited('PROFIT'))),
    interest: { credited: money(credited('INTEREST')), debited: money(debited('INTEREST')) },
    zakat: { credited: money(credited('ZAKAT')), debited: money(debited('ZAKAT')) },
    byCategory: [...new Set(sums.map((x) => x.category))].map((c) => ({
      category: CATEGORY_LABELS[c],
      credited: money(credited(c)),
      debited: money(debited(c)),
      transactions: sums.filter((x) => x.category === c).reduce((t, x) => t + x._count, 0),
    })),
    loans: {
      loanGiven: money(debited('LOAN_DISBURSEMENT')),
      repaid: money(credited('LOAN_REPAYMENT')),
      activeLoanBalance: money(active.reduce((t, l) => t.plus(new Decimal(l.balance)), new Decimal(0))),
      active: active.map((l) => ({ principal: money(l.principalAmount), balance: money(l.balance), repaid: money(new Decimal(l.principalAmount).minus(l.balance)), disbursed: dayOf(l.disbursedDate) })),
      closedLoans: loans.length - active.length,
    },
    ...(dues[0] ? { duesThisYear: { ...duesView(dues[0], year), months: undefined } } : {}),
  };
}

// --- dates for transaction filters ---

// "from"/"to" as KMCC days -> a date filter covering both whole days.
function dateRange(req: AiRequest) {
  const { from, to } = req.query;
  if (from !== undefined && !isDay(from)) throw badRequest('from: a date as YYYY-MM-DD');
  if (to !== undefined && !isDay(to)) throw badRequest('to: a date as YYYY-MM-DD');
  if (!from && !to) return undefined;
  return { ...(from ? { gte: startOfDay(from) } : {}), ...(to ? { lt: startOfDay(nextDay(to)) } : {}) };
}

// --- the router ---

declare global {
  namespace Express {
    interface Request {
      aiUser?: AiUser;
    }
  }
}

function requireAiToken(req: Request, res: Response, next: NextFunction) {
  if (!KMCC_AI_TOKEN) return res.status(503).json({ error: 'AI access is not configured (KMCC_AI_TOKEN)' });
  const header = req.headers.authorization ?? '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  // Compared as hashes with timingSafeEqual, so the time taken says nothing about the token.
  if (!crypto.timingSafeEqual(sha256(given), sha256(KMCC_AI_TOKEN))) {
    return res.status(401).json({ error: 'AI access token required' });
  }
  // The MCP server checks the user per tool call: listing its tools needs none.
  if (req.path === '/openapi.json' || req.path === '/mcp') return next();
  try {
    req.aiUser = aiUserFrom(req.get('x-user-token'));
  } catch (error) {
    return res.status(401).json({ error: (error as Error).message });
  }
  next();
}

const router = express.Router();
router.use(requireAiToken);

// Each endpoint's handler, kept by path: the MCP tools (mcp.ts) run the same ones.
const handlers = new Map<string, Handler>();
function aiGet(path: string, fn: Handler) {
  handlers.set(path, fn);
  router.get(path, async (req, res) => {
    try {
      res.json(await fn({ query: req.query as Record<string, string>, aiUser: req.aiUser! }));
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (!status) console.error(`[ai] ${path}:`, error);
      res.status(status ?? 500).json({ error: status ? (error as Error).message : 'Server error' });
    }
  });
}

router.get('/openapi.json', (_req, res) => res.json(AI_OPENAPI));

aiGet('/me', async (req) => {
  const all = await activeMembers();
  const self = all.find((m) => m.id === req.aiUser.memberId);
  if (!self) throw forbidden('this login is no longer an active member');
  return inRupees({
    role: req.aiUser.isAdmin ? 'admin (sees every member and the accounts)' : 'member (sees only their own data)',
    today: today(),
    timezone: KMCC_TIMEZONE,
    ...(await memberSummary(self)),
  });
});

aiGet('/member-summary', async (req) => {
  const { members, noMatch } = await membersFor(req, 'savings, dues and loans');
  if (noMatch) return noMatch;
  const summaries = await Promise.all(members.map(memberSummary));
  return inRupees({
    ...(req.aiUser.isAdmin ? {} : { scope: ONLY_YOURS('savings, dues and loans') }),
    ...(summaries.length > 1 ? { note: `${summaries.length} members matched "${searchOf(req)}"` } : {}),
    members: summaries,
  });
});

aiGet('/members', async (req) => {
  adminOnly(req, 'the member list');
  const type = req.query.type;
  let members = (await activeMembers()).filter((m) => m.role === 'MEMBER');
  if (type === 'saving') members = members.filter((m) => m.isSavingMember);
  if (type === 'loan') members = members.filter((m) => m.isLoanMember);
  const search = searchOf(req);
  if (search) {
    const found = findMembers(search, members);
    if (!found.length) return { noMatch: `No member matched "${search}"`, allMembers: members.map(nameOf) };
    members = found;
  }
  return {
    count: members.length,
    ...(await membersSummary()),
    members: members.map((m) => ({ ...nameOf(m), type: typeOf(m), joined: dayOf(m.joinDate) })),
  };
});

aiGet('/dues', async (req) => {
  const year = yearOf(req);
  const { members, noMatch } = await membersFor(req, 'dues');
  if (noMatch) return { year, ...noMatch };
  const dues = await duesFor(members, year);
  const notSaving = members.filter((m) => !m.isSavingMember).map((m) => `${m.name.trim()} (${m.memberCode}) is not a saving member, so has no monthly dues`);
  return inRupees({
    ...(req.aiUser.isAdmin ? {} : { scope: ONLY_YOURS('dues') }),
    ...(notSaving.length ? { notSavingMembers: notSaving } : {}),
    dues: dues.map((d) => duesView(d, year)),
  });
});

aiGet('/pending-dues', async (req) => {
  const year = yearOf(req);
  if (!req.aiUser.isAdmin) {
    const self = (await activeMembers()).filter((m) => m.id === req.aiUser.memberId);
    const [d] = await duesFor(self, year);
    if (!d) return { scope: ONLY_YOURS('dues'), note: 'The asking member is not a saving member, so has no monthly dues' };
    return inRupees({ scope: ONLY_YOURS('dues'), ...duesView(d, year), months: undefined });
  }
  const dues = await duesFor(await activeMembers(), year);
  const pending = dues.filter((d) => d.open.length).sort((a, b) => b.pendingAmount.comparedTo(a.pendingAmount));
  return inRupees({
    year,
    monthsDueSoFar: monthsDueIn(year),
    savingMembers: dues.length,
    membersWithPending: pending.length,
    membersPaidUp: dues.length - pending.length,
    totalPending: money(pending.reduce((t, d) => t.plus(d.pendingAmount), new Decimal(0))),
    pending: pending.map((d) => ({
      member: nameOf(d.member),
      pendingMonths: d.open.map((x) => MONTHS[x.month - 1]),
      pendingAmount: money(d.pendingAmount),
    })),
  });
});

aiGet('/transactions', async (req) => {
  const where: Record<string, unknown> = {};
  if (searchOf(req) || !req.aiUser.isAdmin) {
    const { members, noMatch } = await membersFor(req, 'transactions', 5);
    if (noMatch) return noMatch;
    where.memberId = { in: members.map((m) => m.id) };
  }
  if (req.query.category) {
    const wanted = String(req.query.category).toUpperCase().split(',').map((c) => c.trim());
    const bad = wanted.filter((c) => !CATEGORIES.includes(c));
    if (bad.length) throw badRequest(`category: one or more of ${CATEGORIES.join(', ')}`);
    where.category = { in: wanted };
  }
  const flow = flowParam(req.query.flow);
  if (flow) where.flow = flow;
  const date = dateRange(req);
  if (date) where.date = date;
  const limit = clampInt(req.query.limit, 1, 100, 20);
  const [rows, count, sums] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: { bank: { select: { name: true } }, member: { select: { memberCode: true, name: true } } },
      orderBy: { date: 'desc' },
      take: limit,
    }),
    prisma.transaction.count({ where }),
    prisma.transaction.groupBy({ by: ['flow'], where, _sum: { amount: true } }),
  ]);
  const total = (f: string) => money(sums.find((s) => s.flow === f)?._sum.amount);
  return inRupees({
    ...(req.aiUser.isAdmin ? {} : { scope: ONLY_YOURS('transactions') }),
    matching: count,
    totalCredit: total('INCOME'),
    totalDebit: total('EXPENSE'),
    ...(count > rows.length ? { note: `The newest ${rows.length} of ${count} are listed; the totals cover all ${count}.` } : {}),
    transactions: rows.map((t) => ({
      date: dayOf(t.date),
      ...(req.aiUser.isAdmin ? { member: t.member ? nameOf(t.member) : null } : {}),
      category: CATEGORY_LABELS[t.category],
      flow: FLOW_LABELS[t.flow],
      amount: money(t.amount),
      ...(t.description ? { description: t.description } : {}),
      ...(req.aiUser.isAdmin && t.bank ? { bank: t.bank.name } : {}),
    })),
  });
});

aiGet('/loans', async (req) => {
  const where: Record<string, unknown> = {};
  if (searchOf(req) || !req.aiUser.isAdmin) {
    const { members, noMatch } = await membersFor(req, 'loans', 5);
    if (noMatch) return noMatch;
    where.memberId = { in: members.map((m) => m.id) };
  }
  const status = String(req.query.status ?? 'active').toLowerCase();
  if (!['active', 'closed', 'all'].includes(status)) throw badRequest('status: active, closed or all');
  if (status !== 'all') where.status = status.toUpperCase();
  const loans = await prisma.loan.findMany({
    where,
    include: {
      member: { select: { memberCode: true, name: true } },
      transactions: { where: { category: 'LOAN_REPAYMENT' }, orderBy: { date: 'desc' }, take: 1, select: { date: true, amount: true } },
    },
    orderBy: { disbursedDate: 'desc' },
  });
  return inRupees({
    ...(req.aiUser.isAdmin ? {} : { scope: ONLY_YOURS('loans') }),
    status,
    count: loans.length,
    totalBalance: money(loans.reduce((t, l) => t.plus(new Decimal(l.balance)), new Decimal(0))),
    loans: loans.map((l) => ({
      member: nameOf(l.member),
      principal: money(l.principalAmount),
      balance: money(l.balance),
      repaid: money(new Decimal(l.principalAmount).minus(l.balance)),
      disbursed: dayOf(l.disbursedDate),
      status: l.status.toLowerCase(),
      ...(l.transactions[0] ? { lastRepayment: { date: dayOf(l.transactions[0].date), amount: money(l.transactions[0].amount) } } : {}),
    })),
  });
});

aiGet('/totals', async (req) => {
  adminOnly(req, "KMCC's totals");
  const [s, members] = await Promise.all([dashboardSummary(), membersSummary()]);
  return inRupees({
    asOf: today(),
    note: 'The same figures as the admin dashboard tiles.',
    totalSavings: money(s.totalSavingsAmount),
    totalLoansOutstanding: money(s.totalLoanAmount),
    totalBankBalance: money(s.totalBankBalance),
    totalProfit: money(s.totalProfit),
    netInterest: money(s.totalInterestAmount),
    totalExpense: money(s.totalExpense),
    netZakat: money(s.totalZakat),
    totalInflowAll: money(s.totalIncomeAll),
    totalOutflowAll: money(s.totalExpenseAll),
    members,
  });
});

aiGet('/banks', async (req) => {
  adminOnly(req, 'the bank balances');
  const banks = await banksSummary();
  return inRupees({
    totalBankBalance: money(banks.reduce((t, b) => t.plus(b.balance), new Decimal(0))),
    banks: banks.map((b) => ({ name: b.name, balance: money(b.balance) })),
  });
});

aiGet('/flow-by-category', async (req) => {
  adminOnly(req, "KMCC's inflow and outflow");
  const flow = flowParam(req.query.flow) ?? 'EXPENSE';
  const date = dateRange(req);
  const rows = await flowSummary(flow, date);
  return inRupees({
    flow: FLOW_LABELS[flow],
    from: req.query.from ?? 'the start',
    to: req.query.to ?? 'today',
    total: money(rows.reduce((t, r) => t.plus(r.amount), new Decimal(0))),
    categories: rows.map((r) => ({ category: CATEGORY_LABELS[r.category], amount: money(r.amount) })),
  });
});

// Money in and out per month or per day, from the transactions themselves -
// for charts over time. A member gets their own transactions only.
async function inOutBy(req: AiRequest, gte: Date, lt: Date, keyOf: (d: Date) => string) {
  const rows = await prisma.transaction.findMany({
    where: { date: { gte, lt }, ...(req.aiUser.isAdmin ? {} : { memberId: req.aiUser.memberId }) },
    select: { date: true, flow: true, amount: true, category: true },
  });
  const buckets = new Map<string, { in: Decimal; out: Decimal; savings: Decimal }>();
  for (const r of rows) {
    const key = keyOf(r.date);
    const b = buckets.get(key) ?? { in: new Decimal(0), out: new Decimal(0), savings: new Decimal(0) };
    if (r.flow === 'INCOME') b.in = b.in.plus(r.amount);
    else b.out = b.out.plus(r.amount);
    if (r.category === 'SAVING_DEPOSIT' && r.flow === 'INCOME') b.savings = b.savings.plus(r.amount);
    buckets.set(key, b);
  }
  return buckets;
}

aiGet('/finance-by-month', async (req) => {
  const year = yearOf(req);
  const months = Math.max(monthsDueIn(year), 1);
  const buckets = await inOutBy(req, startOfDay(`${year}-01-01`), startOfDay(`${year + 1}-01-01`), (d) => String(yearMonthOf(d).month));
  const items = Array.from({ length: months }, (_, i) => {
    const b = buckets.get(String(i + 1));
    return { month: monthLabel(i + 1, year), in: money(b?.in), out: money(b?.out), savingDeposits: money(b?.savings) };
  });
  return inRupees({
    ...(req.aiUser.isAdmin ? {} : { scope: ONLY_YOURS('transactions') }),
    year,
    note: 'in = money coming in to KMCC (deposits, repayments, profit...), out = money going out (loans given, withdrawals, expenses...). No categories here - see flow_by_category.',
    totalIn: money(items.reduce((t, x) => t + x.in, 0)),
    totalOut: money(items.reduce((t, x) => t + x.out, 0)),
    items,
  });
});

aiGet('/finance-by-day', async (req) => {
  adminOnly(req, "KMCC's daily inflow and outflow");
  const days = clampInt(req.query.days, 1, 92, 30);
  const last = today();
  const list: string[] = [last];
  while (list.length < days) list.unshift(new Date(Date.parse(`${list[0]}T12:00:00Z`) - 86400000).toISOString().slice(0, 10));
  const buckets = await inOutBy(req, startOfDay(list[0]), startOfDay(nextDay(last)), dayOf);
  const items = list.map((day) => ({ date: day, in: money(buckets.get(day)?.in), out: money(buckets.get(day)?.out) }));
  return inRupees({
    from: list[0],
    to: last,
    note: 'in = money coming in to KMCC, out = money going out. No categories here - see flow_by_category.',
    totalIn: money(items.reduce((t, x) => t + x.in, 0)),
    totalOut: money(items.reduce((t, x) => t + x.out, 0)),
    items,
  });
});

// The same endpoints as MCP tools (mcp.ts). Stateless: POST only - no event
// stream to hold open in a serverless function.
router.post('/mcp', aiMcpHandler({
  openapi: AI_OPENAPI,
  handlers,
  userFrom: (req) => aiUserFrom(req.get('x-user-token')),
  info: { name: 'kmcc-jeddah', title: 'KMCC Jeddah', version: '1.0.0' },
}));
router.all('/mcp', (_req, res) => res.status(405).set('Allow', 'POST').json({ error: 'POST only (stateless MCP server)' }));

export default router;
