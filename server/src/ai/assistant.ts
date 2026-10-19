// --- The assistant chat (/api/assistant/*) ---
// The app's chat screen asks here; this server asks the AI service
// (POST AI_ASK_URL with this app's key, AI_ASK_KEY - never sent to the
// browser), with a 5-minute read-only token for the member (aiUser.ts), so the
// AI service reads /api/ai/* as that member. Each member's conversation is
// kept apart on the AI side ("u-<member id>-<chat>"). Unset AI_ASK_URL,
// AI_ASK_KEY or KMCC_AI_TOKEN: 503, and the app hides the chat.
//
// Only logged-in members and the admin - there are no guests. Everyone is
// asked only about KMCC's data (agent connected_apps): the assistant is
// KMCC's, not a general chatbot.
//
// Every question spends the AI service's free quota, so each person has a
// daily limit (KMCC's day): members 4, the admin no limit (0). The admin
// changes them on the Settings page (AppSetting, used at once);
// AI_DAILY_LIMIT_MEMBER / _ADMIN are only the defaults before that. Counted in
// AssistantUsage; a question the AI could not answer is given back.
import express from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { aiUserToken, aiUserRef, Asker } from './aiUser';
import { today } from './time';

const AI_ASK_URL = process.env.AI_ASK_URL;
const AI_ASK_KEY = process.env.AI_ASK_KEY;
const CHAT_ID = /^[A-Za-z0-9_-]{1,40}$/;

export const assistantAvailable = () => Boolean(AI_ASK_URL && AI_ASK_KEY && process.env.KMCC_AI_TOKEN);

const limitSetting = (name: string, fallback: number) => {
  const n = Number(process.env[name] ?? fallback);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
};
type LimitRole = 'member' | 'admin';
const DEFAULT_DAILY_LIMIT: Record<LimitRole, number> = {
  member: limitSetting('AI_DAILY_LIMIT_MEMBER', 4),
  admin: limitSetting('AI_DAILY_LIMIT_ADMIN', 0),
};
const LIMIT_ROLES: LimitRole[] = ['member', 'admin'];
const MAX_DAILY_LIMIT = 100;
const LIMIT_KEY = 'assistant.daily_limit.';

// The limits now: the admin's setting for a role, else its default.
async function dailyLimits() {
  const rows = await prisma.appSetting.findMany({ where: { key: { startsWith: LIMIT_KEY } } });
  const limits = { ...DEFAULT_DAILY_LIMIT };
  for (const { key, value } of rows) {
    const role = key.slice(LIMIT_KEY.length) as LimitRole;
    const n = Number(value);
    if (LIMIT_ROLES.includes(role) && Number.isInteger(n) && n >= 0) limits[role] = n;
  }
  return limits;
}

// The member as they are now - a login token is good for 7 days, but a member
// made inactive, or no longer admin, must not keep asking as before.
export async function currentAsker(memberId: string): Promise<(Asker & { name: string }) | null> {
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { id: true, memberCode: true, role: true, active: true, name: true } });
  if (!m || !m.active) return null;
  return { memberId: m.id, memberCode: m.memberCode, role: m.role, name: m.name.trim() };
}

// Who is counted, and their limit (null = no limit).
export interface Usage {
  key: string;
  limit: number | null;
}
export async function usageFor(user: Asker): Promise<Usage> {
  const limits = await dailyLimits().catch(() => DEFAULT_DAILY_LIMIT);
  return { key: user.memberId, limit: limits[user.role === 'ADMIN' ? 'admin' : 'member'] || null };
}

export async function usedToday(usage: Usage) {
  const row = await prisma.assistantUsage.findUnique({ where: { userKey_day: { userKey: usage.key, day: today() } } });
  return row?.count ?? 0;
}

// One question more, if it is within the limit - in one statement, so two
// questions sent at once cannot both take the last one. Returns the new
// count, or null when the limit is reached.
async function takeQuestion(usage: Usage): Promise<number | null> {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "AssistantUsage" ("userKey", "day", "count") VALUES (${usage.key}, ${today()}, 1)
    ON CONFLICT ("userKey", "day") DO UPDATE SET "count" = "AssistantUsage"."count" + 1
    WHERE ${usage.limit}::int IS NULL OR "AssistantUsage"."count" < ${usage.limit}::int
    RETURNING "count"`;
  return rows.length ? Number(rows[0].count) : null;
}
async function giveQuestionBack(usage: Usage) {
  await prisma.$executeRaw`
    UPDATE "AssistantUsage" SET "count" = GREATEST("count" - 1, 0) WHERE "userKey" = ${usage.key} AND "day" = ${today()}`;
}
const remainingOf = (usage: Usage, used: number) =>
  usage.limit ? { limit: usage.limit, remaining: Math.max(usage.limit - used, 0) } : { limit: null, remaining: null };

interface AskResult {
  status: number;
  body: Record<string, unknown>;
}

// One question to the AI service for `user`. Shared by the app's chat below
// and the Telegram bot (telegram.ts). `display`: what the asker can show (the
// app draws tables and charts; Telegram shows text).
export async function askAssistant({ user, question, conversationId, display }: {
  user: Asker;
  question: string;
  conversationId: string;
  display?: { tables: boolean; charts: boolean };
}): Promise<AskResult> {
  const usage = await usageFor(user);
  let used: number | null;
  try {
    used = await takeQuestion(usage);
  } catch {
    return { status: 500, body: { error: "Could not check today's question count - please try again" } };
  }
  if (used === null) {
    return { status: 429, body: { error: `You have used today's ${usage.limit} questions - more tomorrow`, limit: usage.limit, remaining: 0 } };
  }
  const taken = used;
  const giveBack = async (status: number, body: Record<string, unknown>): Promise<AskResult> => {
    await giveQuestionBack(usage).catch(() => {});
    return { status, body: { ...body, ...remainingOf(usage, taken - 1) } };
  };
  try {
    const aiRes = await fetch(AI_ASK_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AI_ASK_KEY}` },
      body: JSON.stringify({
        question,
        conversationId,
        mode: 'multi',
        agent: 'connected_apps',
        user: { token: aiUserToken(user), ref: aiUserRef(user) },
        ...(display ? { display } : {}),
      }),
      // The AI may wait for this server's own /api/ai/* calls (a cold start of this server).
      signal: AbortSignal.timeout(120000),
    });
    const data = (await aiRes.json().catch(() => ({}))) as { answer?: string; error?: string; sources?: { n: number; source: string; section?: string }[] };
    if (!aiRes.ok) return giveBack(aiRes.status === 429 ? 429 : 502, { error: data.error ?? 'The assistant could not answer - please try again' });
    return {
      status: 200,
      body: { answer: data.answer, sources: (data.sources ?? []).map((s) => ({ n: s.n, source: s.source, section: s.section })), ...remainingOf(usage, taken) },
    };
  } catch (error) {
    return giveBack(502, { error: (error as Error).name === 'TimeoutError' ? 'The assistant took too long - please try again' : 'The assistant could not be reached' });
  }
}

// Voice input: a recording -> { text, language } through the AI service's
// speech-to-text. Used by the app's mic button and the Telegram bot's voice
// notes. `lang` is a hint (VOICE_LANGUAGES), else none.
export const VOICE_LANGUAGES = ['English', 'Malayalam', 'Hindi', 'Tamil', 'Kannada', 'Telugu', 'Arabic', 'Urdu'];

export async function transcribeAudio(audio: Buffer, contentType: string | undefined, lang?: string): Promise<AskResult> {
  const hint = lang && VOICE_LANGUAGES.includes(lang) ? `?lang=${encodeURIComponent(lang)}` : '';
  try {
    const aiRes = await fetch(`${AI_ASK_URL!.replace(/\/$/, '')}/transcribe${hint}`, {
      method: 'POST',
      headers: { 'Content-Type': contentType || 'audio/webm', Authorization: `Bearer ${AI_ASK_KEY}` },
      body: new Uint8Array(audio),
      signal: AbortSignal.timeout(60000),
    });
    const data = (await aiRes.json().catch(() => ({}))) as { text?: string; language?: string; error?: string };
    if (!aiRes.ok) return { status: aiRes.status === 429 ? 429 : 502, body: { error: data.error ?? 'Could not turn the recording into text' } };
    return { status: 200, body: { text: data.text ?? '', language: data.language ?? null } };
  } catch (error) {
    return { status: 502, body: { error: (error as Error).name === 'TimeoutError' ? 'Turning the recording into text took too long' : 'The assistant could not be reached' } };
  }
}

// Forget one conversation on the AI side ("New chat"). Throws when the AI
// service cannot be reached.
export async function forgetConversation(conversationId: string) {
  await fetch(`${AI_ASK_URL!.replace(/\/$/, '')}/conversations/${encodeURIComponent(conversationId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${AI_ASK_KEY}` },
    signal: AbortSignal.timeout(15000),
  });
}

const conversationFor = (user: Asker, chatId: string) => `u-${user.memberId}-${chatId}`.slice(0, 100);

const router = express.Router();
router.use(requireAuth);

// `askingAs`: which login the chat answers for - shown in the chat, so a
// member's view ("only my dues") is never mistaken for the admin's.
router.get('/status', async (req, res) => {
  if (!assistantAvailable()) return res.json({ available: false });
  const user = await currentAsker(req.user!.memberId);
  if (!user) return res.json({ available: false });
  const usage = await usageFor(user);
  const askingAs = { role: user.role === 'ADMIN' ? 'admin' : 'member', memberCode: user.memberCode, name: user.name };
  try {
    res.json({ available: true, askingAs, ...remainingOf(usage, await usedToday(usage)) });
  } catch {
    res.json({ available: true, askingAs, limit: usage.limit, remaining: null });
  }
});

router.post('/ask', async (req, res) => {
  if (!assistantAvailable()) return res.status(503).json({ error: 'The assistant is not set up on this server' });
  const question = String(req.body?.question ?? '').trim();
  const chatId = String(req.body?.chatId ?? 'main');
  if (!question || question.length > 2000) return res.status(400).json({ error: 'Ask a question of up to 2000 characters' });
  if (!CHAT_ID.test(chatId)) return res.status(400).json({ error: 'Invalid chatId' });
  const user = await currentAsker(req.user!.memberId);
  if (!user) return res.status(403).json({ error: 'This login is no longer active' });
  const { status, body } = await askAssistant({
    user,
    question,
    conversationId: conversationFor(user, chatId),
    // The chat shows Markdown tables and draws ```chart blocks (AssistantChat.tsx).
    display: { tables: true, charts: true },
  });
  res.status(status).json(body);
});

// The recording (raw body, up to 4 MB - about 2 minutes) goes to the AI
// service's speech-to-text; the text comes back to check before sending. Not
// counted as a question, but only for someone with questions left today,
// since it spends the same free quota.
router.post('/transcribe', express.raw({ type: () => true, limit: '4mb' }), async (req, res) => {
  if (!assistantAvailable()) return res.status(503).json({ error: 'The assistant is not set up on this server' });
  const user = await currentAsker(req.user!.memberId);
  if (!user) return res.status(403).json({ error: 'This login is no longer active' });
  const usage = await usageFor(user);
  if (usage.limit && (await usedToday(usage)) >= usage.limit) {
    return res.status(429).json({ error: `You have used today's ${usage.limit} questions`, limit: usage.limit, remaining: 0 });
  }
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'No recording received' });
  const { status, body } = await transcribeAudio(req.body, req.get('content-type'), String(req.query.lang ?? ''));
  res.status(status).json(body);
});

router.delete('/chat/:chatId', async (req, res) => {
  if (!assistantAvailable()) return res.status(503).json({ error: 'The assistant is not set up on this server' });
  const chatId = String(req.params.chatId);
  if (!CHAT_ID.test(chatId)) return res.status(400).json({ error: 'Invalid chatId' });
  try {
    await forgetConversation(conversationFor({ memberId: req.user!.memberId, memberCode: req.user!.memberCode, role: req.user!.role }, chatId));
    res.json({ ok: true });
  } catch {
    res.status(502).json({ error: 'The assistant could not be reached' });
  }
});

// The admin's Settings page: read and change the limits (0 = no limit).
router.get('/settings', requireAdmin, async (_req, res) => {
  res.json({ dailyLimits: await dailyLimits(), defaults: DEFAULT_DAILY_LIMIT, max: MAX_DAILY_LIMIT });
});

router.put('/settings', requireAdmin, async (req, res) => {
  const given = (req.body?.dailyLimits ?? {}) as Record<string, unknown>;
  for (const role of Object.keys(given)) {
    const n = given[role];
    if (!LIMIT_ROLES.includes(role as LimitRole) || !Number.isInteger(n) || (n as number) < 0 || (n as number) > MAX_DAILY_LIMIT) {
      return res.status(400).json({ error: `dailyLimits.${role}: a whole number from 0 (no limit) to ${MAX_DAILY_LIMIT}` });
    }
  }
  for (const [role, n] of Object.entries(given)) {
    await prisma.appSetting.upsert({
      where: { key: `${LIMIT_KEY}${role}` },
      update: { value: String(n) },
      create: { key: `${LIMIT_KEY}${role}`, value: String(n) },
    });
  }
  res.json({ dailyLimits: await dailyLimits() });
});

export default router;
