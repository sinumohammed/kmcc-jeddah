import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireAdmin } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const BANK_FIELDS = [
  'name',
  'accountHolderName',
  'accountNumber',
  'branchName',
  'branchSolId',
  'customerId',
  'modeOfOperation',
  'jointHolders',
  'ifscCode',
  'micrCode',
  'swiftCode',
  'currency',
  'nominationRegistered',
  'openingBalance',
] as const;

function pickBankFields(body: any) {
  const data: any = {};
  for (const field of BANK_FIELDS) {
    if (body[field] !== undefined) data[field] = body[field];
  }
  if (body.accountOpenDate) data.accountOpenDate = new Date(body.accountOpenDate);
  return data;
}

router.get('/', async (_req, res) => {
  const banks = await prisma.bank.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
  res.json(banks);
});

router.post('/', requireAdmin, async (req, res) => {
  const { name } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const bank = await prisma.bank.create({ data: pickBankFields(req.body ?? {}) as any });
  res.status(201).json(bank);
});

router.put('/:id', requireAdmin, async (req, res) => {
  const bank = await prisma.bank.update({
    where: { id: String(req.params.id) },
    data: pickBankFields(req.body ?? {}),
  });
  res.json(bank);
});

router.delete('/:id', requireAdmin, async (req, res) => {
  await prisma.bank.update({ where: { id: String(req.params.id) }, data: { active: false } });
  res.status(204).send();
});

export default router;
