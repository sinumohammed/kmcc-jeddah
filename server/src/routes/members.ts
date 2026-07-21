import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { hashPassword } from '../lib/auth';
import { nextMemberCode } from '../lib/memberCode';
import { ensureContributionsUpTo } from '../lib/contributions';

const router = Router();
router.use(requireAuth);

router.get('/', requireAdmin, async (req, res) => {
  const { type } = req.query;
  const where: any = { active: true, role: 'MEMBER' };
  if (type === 'saving') where.isSavingMember = true;
  if (type === 'loan') where.isLoanMember = true;

  const members = await prisma.member.findMany({
    where,
    orderBy: { memberCode: 'asc' },
    select: {
      id: true,
      memberCode: true,
      name: true,
      mobile: true,
      address: true,
      role: true,
      isSavingMember: true,
      isLoanMember: true,
      joinDate: true,
      active: true,
    },
  });
  res.json(members);
});

router.get('/:id', async (req, res) => {
  const id = req.params.id as string;
  if (req.user!.role !== 'ADMIN' && req.user!.memberId !== id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const member = await prisma.member.findUnique({
    where: { id },
    select: {
      id: true,
      memberCode: true,
      name: true,
      mobile: true,
      address: true,
      role: true,
      isSavingMember: true,
      isLoanMember: true,
      joinDate: true,
      active: true,
      monthlyAmounts: true,
      loans: true,
    },
  });
  if (!member) return res.status(404).json({ error: 'Not found' });
  res.json(member);
});

router.post('/', requireAdmin, async (req, res) => {
  const { name, mobile, address, password, isSavingMember, isLoanMember, joinDate, monthlyAmount } =
    req.body ?? {};
  if (!name || !mobile || !password) {
    return res.status(400).json({ error: 'name, mobile and password are required' });
  }
  if (isSavingMember && isLoanMember) {
    return res.status(400).json({ error: 'A member can only be a saving member or a loan member, not both' });
  }

  const memberCode = await nextMemberCode();
  const passwordHash = await hashPassword(password);
  const join = joinDate ? new Date(joinDate) : new Date();

  const member = await prisma.member.create({
    data: {
      memberCode,
      name,
      mobile,
      address: address || null,
      passwordHash,
      isSavingMember: !!isSavingMember,
      isLoanMember: !!isLoanMember,
      joinDate: join,
    },
  });

  if (member.isSavingMember && monthlyAmount) {
    await prisma.monthlyAmountHistory.create({
      data: { memberId: member.id, year: join.getFullYear(), amount: monthlyAmount },
    });
    const now = new Date();
    await ensureContributionsUpTo(member.id, now.getFullYear(), now.getMonth() + 1);
  }

  res.status(201).json({ id: member.id, memberCode: member.memberCode });
});

router.put('/:id', requireAdmin, async (req, res) => {
  const id = req.params.id as string;
  const { name, mobile, address, isSavingMember, isLoanMember, password } = req.body ?? {};
  if (isSavingMember && isLoanMember) {
    return res.status(400).json({ error: 'A member can only be a saving member or a loan member, not both' });
  }
  const data: any = { name, mobile, address, isSavingMember, isLoanMember };
  if (password) data.passwordHash = await hashPassword(password);

  const member = await prisma.member.update({ where: { id }, data });
  res.json({ id: member.id });
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const id = req.params.id as string;
  await prisma.member.update({ where: { id }, data: { active: false } });
  res.status(204).send();
});

router.post('/:id/monthly-amount', requireAdmin, async (req, res) => {
  const memberId = req.params.id as string;
  const { year, amount } = req.body ?? {};
  if (!year || !amount) return res.status(400).json({ error: 'year and amount are required' });

  await prisma.monthlyAmountHistory.upsert({
    where: { memberId_year: { memberId, year } },
    update: { amount },
    create: { memberId, year, amount },
  });
  res.status(204).send();
});

router.get('/:id/contributions', async (req, res) => {
  const memberId = req.params.id as string;
  if (req.user!.role !== 'ADMIN' && req.user!.memberId !== memberId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const year = parseInt((req.query.year as string) ?? '', 10) || new Date().getFullYear();
  const now = new Date();
  if (year === now.getFullYear()) {
    await ensureContributionsUpTo(memberId, year, now.getMonth() + 1);
  }

  const rows = await prisma.monthlyContribution.findMany({
    where: { memberId, year },
    orderBy: { month: 'asc' },
  });
  res.json(rows);
});

export default router;
