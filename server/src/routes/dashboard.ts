import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { dashboardSummary, flowSummary, membersSummary, banksSummary } from '../lib/dashboard';

// The sums themselves live in lib/dashboard.ts, shared with the AI assistant.
const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/summary', async (_req, res) => {
  res.json(await dashboardSummary());
});

router.get('/flow-summary', async (req, res) => {
  const flow = req.query.flow === 'EXPENSE' ? 'EXPENSE' : 'INCOME';
  res.json({ flow, breakdown: await flowSummary(flow) });
});

router.get('/members-summary', async (_req, res) => {
  res.json(await membersSummary());
});

router.get('/banks-summary', async (_req, res) => {
  res.json(await banksSummary());
});

export default router;
