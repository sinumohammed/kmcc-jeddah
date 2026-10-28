// "Ask a person" routes (handover.ts) - mounted before the assistant's own
// router, whose requireAuth would refuse the AI service's reply call.
import crypto from 'node:crypto';
import express from 'express';
import { requireAuth } from '../middleware/auth';
import { currentAsker } from './assistant';
import { createHandover, listHandovers, writeToPerson, markHandoverSeen, HandoverResult } from './handover';
import { notifyMember } from './telegram';

const CHAT_ID = /^[A-Za-z0-9_-]{1,40}$/;
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest();
const send = (res: express.Response, { status, body }: HandoverResult) => res.status(status).json(body);
const textOf = (v: unknown) => String(v ?? '').trim();

const router = express.Router();

async function asker(req: express.Request, res: express.Response) {
  const user = await currentAsker(req.user!.memberId);
  if (!user) res.status(403).json({ error: 'This login is no longer active' });
  return user;
}

router.post('/handover', requireAuth, async (req, res) => {
  const user = await asker(req, res);
  if (!user) return;
  const chatId = String(req.body?.chatId ?? 'main');
  if (!CHAT_ID.test(chatId)) return res.status(400).json({ error: 'Invalid chatId' });
  const question = textOf(req.body?.question);
  const note = textOf(req.body?.note);
  if (question.length > 2000 || note.length > 2000) return res.status(400).json({ error: 'Please write up to 2000 characters' });
  const reason = ['not_found', 'app_failed'].includes(req.body?.reason) ? req.body.reason : undefined;
  // The chat's conversation on the AI side, as assistant.ts names it.
  send(res, await createHandover(user, { conversationId: `u-${user.memberId}-${chatId}`.slice(0, 100), question: question || undefined, note: note || undefined, reason }));
});

router.get('/handovers', requireAuth, async (req, res) => {
  const user = await asker(req, res);
  if (user) send(res, await listHandovers(user));
});

router.post('/handovers/:id/messages', requireAuth, async (req, res) => {
  const user = await asker(req, res);
  if (!user) return;
  const text = textOf(req.body?.text);
  if (!text || text.length > 2000) return res.status(400).json({ error: 'Write a message of up to 2000 characters' });
  send(res, await writeToPerson(user, String(req.params.id), text));
});

router.post('/handovers/:id/seen', requireAuth, async (req, res) => {
  const user = await asker(req, res);
  if (user) send(res, await markHandoverSeen(user, String(req.params.id)));
});

// From the AI service (its token, KMCC_AI_TOKEN): the person replied. A member linked on Telegram gets it there.
router.post('/handover-reply', async (req, res) => {
  const token = process.env.KMCC_AI_TOKEN;
  const given = req.get('authorization')?.match(/^Bearer (.+)$/)?.[1] ?? '';
  if (!token || !crypto.timingSafeEqual(sha256(given), sha256(token))) return res.status(401).json({ error: 'AI access token required' });
  const memberId = textOf(req.body?.user?.ref).match(/^user:(.+)$/)?.[1];
  const text = textOf(req.body?.text);
  if (!memberId || !text) return res.status(400).json({ error: 'user.ref "user:<member id>" and text are needed' });
  try {
    res.json({ delivered: await notifyMember(memberId, { question: textOf(req.body.question), text }) });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
