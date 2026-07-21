import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { comparePassword, signToken } from '../lib/auth';

const router = Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const normalized = String(username).trim();

  let member = await prisma.member.findFirst({
    where: { memberCode: normalized.toUpperCase(), active: true },
  });

  if (!member) {
    const matches = await prisma.member.findMany({
      where: { mobile: normalized, active: true },
    });
    if (matches.length > 1) {
      return res.status(401).json({
        error: 'Multiple accounts use this mobile number. Please log in with your Member ID instead.',
      });
    }
    member = matches[0] ?? null;
  }

  if (!member) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const ok = await comparePassword(password, member.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = signToken({
    memberId: member.id,
    memberCode: member.memberCode,
    role: member.role,
  });

  res.json({
    token,
    member: {
      id: member.id,
      memberCode: member.memberCode,
      name: member.name,
      role: member.role,
      isSavingMember: member.isSavingMember,
      isLoanMember: member.isLoanMember,
    },
  });
});

export default router;
