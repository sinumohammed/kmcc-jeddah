import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { comparePassword, hashPassword, signToken } from '../lib/auth';
import { requireAuth } from '../middleware/auth';

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

router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword and newPassword are required' });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  const member = await prisma.member.findUnique({ where: { id: req.user!.memberId } });
  if (!member) return res.status(404).json({ error: 'Not found' });

  const ok = await comparePassword(currentPassword, member.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

  const passwordHash = await hashPassword(newPassword);
  await prisma.member.update({ where: { id: member.id }, data: { passwordHash } });
  res.status(204).send();
});

export default router;
