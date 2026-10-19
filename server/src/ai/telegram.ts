// The KMCC assistant as a Telegram bot (ported from the masjid app). Telegram
// sends each message to POST /api/telegram/webhook; the bot answers through
// the same askAssistant as the app's chat (assistant.ts), so the roles and
// daily limits are the same: a Telegram account linked to a KMCC login asks
// as that login (the admin everything, a member their own savings, dues,
// loans and transactions). An account that is not linked gets no answers -
// KMCC has no guests - only how to link.
// Linking is done by the person themselves, either way:
//   - in the app (Settings): "Connect Telegram" makes a one-time link
//     (10 minutes); opening it sends /start <code>
//   - in the bot: "Share my phone number" - Telegram sends the number of the
//     account itself (we check contact.user_id), matched to the member's
//     mobile number. Members only: the admin links from the app.
// Voice notes are turned into text (transcribeAudio), shown back, then asked.
// Only private chats are answered: in a group, everyone would see the answer.
//
// Set up: TELEGRAM_BOT_TOKEN (from @BotFather), then the admin presses
// "Connect the bot" in Settings (POST /api/telegram/admin/webhook), which
// points Telegram at this server. The webhook's secret is made from the bot
// token, so there is nothing else to set. Without the token the app hides the
// Telegram card.
//
// Serverless: the webhook answers 200 at once and the work runs in
// runInBackground (waitUntil on Vercel). An update seen before is skipped.
import crypto from 'node:crypto';
import express from 'express';
import { waitUntil } from '@vercel/functions';
import { prisma } from '../lib/prisma';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { assistantAvailable, askAssistant, currentAsker, usageFor, usedToday, transcribeAudio, forgetConversation, VOICE_LANGUAGES } from './assistant';
import type { Asker } from './aiUser';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
// The eval points this at a fake Telegram.
const API = (process.env.TELEGRAM_API_URL ?? 'https://api.telegram.org').replace(/\/$/, '');
const WEBHOOK_SECRET = TOKEN ? crypto.createHmac('sha256', TOKEN).update('kmcc-telegram-webhook').digest('hex') : null;
const CHANNEL = 'telegram';
const LINK_CODE_MINUTES = 10;
const MAX_VOICE_SECONDS = 120;
const MAX_VOICE_BYTES = 4 * 1024 * 1024;
// Telegram's limit is 4096 characters a message.
const MAX_MESSAGE = 4000;
// Most members speak Malayalam; /voice changes it.
const DEFAULT_VOICE_LANGUAGE = 'Malayalam';

const sha256hex = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const sameSecret = (a: unknown, b: unknown) => {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// Work after the response is sent: on Vercel the function may be frozen the
// moment it answers, so waitUntil keeps it alive; elsewhere there is no freeze.
function runInBackground(promise: Promise<unknown>) {
  if (process.env.VERCEL) waitUntil(promise);
  else promise.catch((err) => console.warn(`Background task failed: ${err.message}`));
}

async function telegram(method: string, body?: object): Promise<any> {
  const res = await fetch(`${API}/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(20000),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: unknown; description?: string };
  if (!data.ok) throw Object.assign(new Error(data.description ?? `Telegram ${method}: HTTP ${res.status}`), { status: res.status });
  return data.result;
}

let botUsername: string | null = process.env.TELEGRAM_BOT_USERNAME || null;
async function getBotUsername() {
  if (!botUsername && TOKEN) botUsername = (await telegram('getMe')).username;
  return botUsername;
}

// The answer is Markdown; Telegram takes a small set of HTML tags instead.
// Code blocks and tables (a model may still write one) become <pre>.
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function toTelegramHtml(markdown: string) {
  const blocks: string[] = [];
  const keep = (html: string) => `${blocks.push(html) - 1}`;
  let text = String(markdown ?? '').replace(/```[^\n]*\n([\s\S]*?)```/g, (_, code: string) => keep(`<pre>${escapeHtml(code.trimEnd())}</pre>`));
  text = text.replace(/(?:^\|.*\|[ \t]*(?:\n|$))+/gm, (table) => {
    const rows = table.trimEnd().split('\n').filter((row) => !/^\|[\s:|-]+\|$/.test(row.trim()));
    return keep(`<pre>${escapeHtml(rows.join('\n'))}</pre>`) + '\n';
  });
  text = escapeHtml(text)
    .replace(/`([^`\n]+)`/g, (_, code: string) => keep(`<code>${code}</code>`))
    .replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/__([^_\n]+)__/g, '<b>$1</b>')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/^(\s*)[-*]\s+/gm, '$1• ');
  return text.replace(/(\d+)/g, (_, i: string) => blocks[Number(i)]);
}

// Long answers in pieces, cut between paragraphs where possible.
function pieces(text: string) {
  const out: string[] = [];
  let rest = text;
  while (rest.length > MAX_MESSAGE) {
    let cut = rest.lastIndexOf('\n\n', MAX_MESSAGE);
    if (cut < MAX_MESSAGE / 2) cut = rest.lastIndexOf('\n', MAX_MESSAGE);
    if (cut < MAX_MESSAGE / 2) cut = MAX_MESSAGE;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, '');
  }
  if (rest) out.push(rest);
  return out;
}

// Markdown text to a chat; plain text if Telegram refuses the HTML.
async function reply(chatId: number, markdown: string, extra: object = {}) {
  for (const part of pieces(String(markdown))) {
    try {
      await telegram('sendMessage', { chat_id: chatId, text: toTelegramHtml(part), parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });
    } catch (error) {
      if ((error as { status?: number }).status !== 400) throw error;
      await telegram('sendMessage', { chat_id: chatId, text: part, ...extra });
    }
  }
}

const SHARE_PHONE_KEYBOARD = {
  keyboard: [[{ text: '📱 Share my phone number', request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};
const NO_KEYBOARD = { remove_keyboard: true };

const HELP = [
  'Ask me about your KMCC savings - your balance, monthly dues, pending months, loan and payments. You can also send a voice note.',
  '',
  '/whoami - who you are asking as',
  '/new - start a new conversation',
  '/voice - the language of your voice notes',
  '/unlink - stop asking as your KMCC login',
].join('\n');
const NOT_LINKED =
  'This Telegram account is not linked to a KMCC login yet, so I cannot answer. Members: tap *Share my phone number* below (the number registered with KMCC), or link from the KMCC app (Settings → Telegram).';

interface From { id: number; first_name?: string; last_name?: string; username?: string; is_bot?: boolean }
interface Voice { file_id: string; duration?: number; file_size?: number; mime_type?: string }
interface Update {
  update_id: number;
  message?: {
    chat?: { id: number; type: string };
    from?: From;
    text?: string;
    contact?: { phone_number: string; user_id?: number };
    voice?: Voice;
    audio?: Voice;
  };
}

// The KMCC login a Telegram account asks as, or null (not linked, or no
// longer an active member).
async function linkedUser(telegramId: string) {
  const link = await prisma.channelLink.findUnique({ where: { channel_externalId: { channel: CHANNEL, externalId: telegramId } } });
  return link ? currentAsker(link.memberId) : null;
}

async function link(telegramId: string, memberId: string, from: From) {
  const displayName = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || null;
  await prisma.channelLink.upsert({
    where: { channel_externalId: { channel: CHANNEL, externalId: telegramId } },
    update: { memberId, displayName, createdAt: new Date() },
    create: { channel: CHANNEL, externalId: telegramId, memberId, displayName },
  });
}

const asWho = (user: (Asker & { name: string }) | null) =>
  !user ? 'nobody yet (not linked)' : user.role === 'ADMIN' ? `the admin (${user.name}, ${user.memberCode})` : `member ${user.name} (${user.memberCode})`;
const conversationOf = (user: Asker) => `u-${user.memberId}-tg`;

async function voiceLanguage(telegramId: string) {
  const row = await prisma.channelPref.findUnique({ where: { channel_externalId: { channel: CHANNEL, externalId: telegramId } } });
  return row?.voiceLanguage ?? DEFAULT_VOICE_LANGUAGE;
}

// /start l_<code>: a one-time link made in the app.
async function redeemCode(chatId: number, telegramId: string, from: From, code: string) {
  const row = await prisma.channelLinkCode.delete({ where: { codeHash: sha256hex(code) } }).catch(() => null);
  if (!row || row.expiresAt < new Date()) {
    return reply(chatId, 'That link has expired or was already used. Make a new one in the KMCC app (Settings → Telegram).');
  }
  await link(telegramId, row.memberId, from);
  const user = await linkedUser(telegramId);
  return reply(chatId, `Linked ✅ You are now asking as ${asWho(user)}.\n\n${HELP}`, { reply_markup: NO_KEYBOARD });
}

// The account's own phone number -> the one active member with it.
async function linkByPhone(chatId: number, telegramId: string, from: From, contact: { phone_number: string; user_id?: number }) {
  if (String(contact.user_id ?? '') !== telegramId) {
    return reply(chatId, 'Please share your own number with the button below.', { reply_markup: SHARE_PHONE_KEYBOARD });
  }
  // The last 9 digits: a Saudi mobile is 05XXXXXXXX on the member record but
  // +9665XXXXXXXX from Telegram (the 9 digits after the 0 / 966 are the same);
  // an Indian one is 10 digits with or without +91. Two members with the same
  // last 9 digits are refused below, never guessed.
  const last9 = (s: string) => String(s ?? '').replace(/\D/g, '').slice(-9);
  const wanted = last9(contact.phone_number);
  const members = await prisma.member.findMany({ where: { active: true, role: 'MEMBER' }, select: { id: true, mobile: true } });
  const matches = wanted.length === 9 ? members.filter((m) => last9(m.mobile) === wanted) : [];
  if (matches.length === 0) {
    return reply(chatId, "This number is not on KMCC's member list. Ask the admin to check your mobile number, or link from the KMCC app (Settings → Telegram).", { reply_markup: NO_KEYBOARD });
  }
  if (matches.length > 1) {
    return reply(chatId, 'This number belongs to more than one member, so I cannot tell which one you are. Please link from the KMCC app (Settings → Telegram).', { reply_markup: NO_KEYBOARD });
  }
  await link(telegramId, matches[0].id, from);
  const user = await linkedUser(telegramId);
  return reply(chatId, `Linked ✅ You are now asking as ${asWho(user)}.\n\n${HELP}`, { reply_markup: NO_KEYBOARD });
}

async function command(chatId: number, telegramId: string, from: From, text: string) {
  const [name, ...args] = text.split(/\s+/);
  const arg = args.join(' ').trim();
  const cmd = name.slice(1).replace(/@.*$/, '').toLowerCase();
  const user = await linkedUser(telegramId);
  if (cmd === 'start') {
    if (/^l_[A-Za-z0-9_-]{8,60}$/.test(arg)) return redeemCode(chatId, telegramId, from, arg);
    if (user) return reply(chatId, `Assalamu alaikum! You are asking as ${asWho(user)}.\n\n${HELP}`, { reply_markup: NO_KEYBOARD });
    return reply(chatId, `Assalamu alaikum! I am the KMCC Jeddah assistant.\n\n${NOT_LINKED}`, { reply_markup: SHARE_PHONE_KEYBOARD });
  }
  if (cmd === 'help') return reply(chatId, HELP);
  if (cmd === 'whoami') {
    return user ? reply(chatId, `You are asking as ${asWho(user)}.`) : reply(chatId, NOT_LINKED, { reply_markup: SHARE_PHONE_KEYBOARD });
  }
  if (cmd === 'new') {
    if (user) await forgetConversation(conversationOf(user)).catch(() => {});
    return reply(chatId, 'New conversation started.');
  }
  if (cmd === 'unlink') {
    await prisma.channelLink.deleteMany({ where: { channel: CHANNEL, externalId: telegramId } });
    return reply(chatId, user ? 'Unlinked. /start to link again.' : 'This account was not linked.');
  }
  if (cmd === 'voice') {
    const language = VOICE_LANGUAGES.find((l) => l.toLowerCase() === arg.toLowerCase());
    if (!language) {
      return reply(chatId, `Voice notes are read as ${await voiceLanguage(telegramId)}. To change it: /voice ${VOICE_LANGUAGES.join(' | ')}`);
    }
    await prisma.channelPref.upsert({
      where: { channel_externalId: { channel: CHANNEL, externalId: telegramId } },
      update: { voiceLanguage: language },
      create: { channel: CHANNEL, externalId: telegramId, voiceLanguage: language },
    });
    return reply(chatId, `Voice notes will be read as ${language}.`);
  }
  return reply(chatId, HELP);
}

// A question (typed, or a voice note's text) to the assistant.
async function ask(chatId: number, user: Asker, question: string) {
  // "typing..." lasts 5 seconds; keep it up while the answer is made.
  const typing = () => telegram('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
  typing();
  const timer = setInterval(typing, 4500);
  try {
    const { status, body } = await askAssistant({ user, question, conversationId: conversationOf(user) });
    if (status !== 200) return reply(chatId, String(body.error ?? 'The assistant could not answer - please try again'));
    const sources = [...new Set(((body.sources ?? []) as { source?: string }[]).map((s) => s.source).filter(Boolean))];
    // Said only when it is nearly used up.
    const left = body.limit && Number(body.remaining) <= 1 ? `\n\n(${body.remaining} of ${body.limit} questions left today)` : '';
    await reply(chatId, `${body.answer}${sources.length ? `\n\nSource: ${sources.join(', ')}` : ''}${left}`.trim());
  } finally {
    clearInterval(timer);
  }
}

async function voiceNote(chatId: number, telegramId: string, user: Asker, voice: Voice) {
  if ((voice.duration ?? 0) > MAX_VOICE_SECONDS || (voice.file_size ?? 0) > MAX_VOICE_BYTES) {
    return reply(chatId, `Please keep voice notes under ${MAX_VOICE_SECONDS / 60} minutes.`);
  }
  const usage = await usageFor(user);
  if (usage.limit && (await usedToday(usage)) >= usage.limit) {
    return reply(chatId, `You have used today's ${usage.limit} questions - more tomorrow.`);
  }
  telegram('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
  const file = await telegram('getFile', { file_id: voice.file_id });
  const audioRes = await fetch(`${API}/file/bot${TOKEN}/${file.file_path}`, { signal: AbortSignal.timeout(20000) });
  if (!audioRes.ok) return reply(chatId, 'I could not get that voice note - please try again.');
  const audio = Buffer.from(await audioRes.arrayBuffer());
  const { status, body } = await transcribeAudio(audio, voice.mime_type || 'audio/ogg', await voiceLanguage(telegramId));
  if (status !== 200) return reply(chatId, String(body.error ?? 'Could not turn the voice note into text'));
  const text = String(body.text ?? '').trim();
  if (!text) return reply(chatId, 'I could not hear a question in that voice note. (/voice to change its language)');
  await reply(chatId, `🎙 “${text}”`);
  return ask(chatId, user, text.slice(0, 2000));
}

async function handleUpdate(update: Update) {
  const message = update.message;
  if (!message?.from || message.from.is_bot) return;
  if (message.chat?.type !== 'private') return;
  const chatId = message.chat.id;
  const telegramId = String(message.from.id);
  try {
    if (message.contact) return await linkByPhone(chatId, telegramId, message.from, message.contact);
    const text = String(message.text ?? '').trim();
    if (text.startsWith('/')) return await command(chatId, telegramId, message.from, text);
    const user = await linkedUser(telegramId);
    if (!user) return await reply(chatId, NOT_LINKED, { reply_markup: SHARE_PHONE_KEYBOARD });
    if (message.voice || message.audio) return await voiceNote(chatId, telegramId, user, (message.voice ?? message.audio)!);
    if (!text) return await reply(chatId, 'Send me a question as text or a voice note.');
    if (text.length > 2000) return await reply(chatId, 'Please ask in up to 2000 characters.');
    return await ask(chatId, user, text);
  } catch (error) {
    console.warn(`Telegram update ${update.update_id}: ${(error as Error).message}`);
    await reply(chatId, 'Something went wrong - please try again.').catch(() => {});
  }
}

const configured = () => Boolean(TOKEN) && assistantAvailable();
const router = express.Router();

router.post('/webhook', async (req, res) => {
  if (!TOKEN || !sameSecret(req.get('x-telegram-bot-api-secret-token'), WEBHOOK_SECRET)) return res.status(401).json({ error: 'unknown sender' });
  const update = (req.body ?? {}) as Update;
  if (!Number.isSafeInteger(update.update_id)) return res.json({ ok: true });
  try {
    const fresh = await prisma.telegramUpdate.createMany({ data: [{ updateId: BigInt(update.update_id) }], skipDuplicates: true });
    if (!fresh.count) return res.json({ ok: true });
    if (update.update_id % 100 === 0) {
      await prisma.telegramUpdate.deleteMany({ where: { receivedAt: { lt: new Date(Date.now() - 2 * 86400000) } } });
    }
  } catch (error) {
    // 500: Telegram sends it again later.
    return res.status(500).json({ error: (error as Error).message });
  }
  res.json({ ok: true });
  if (!configured()) return;
  runInBackground(handleUpdate(update));
});

// The person's own Telegram link (Settings).
router.get('/link', requireAuth, async (req, res) => {
  if (!configured()) return res.json({ available: false });
  try {
    const links = await prisma.channelLink.findMany({ where: { channel: CHANNEL, memberId: req.user!.memberId }, orderBy: { createdAt: 'asc' } });
    res.json({ available: true, botUsername: await getBotUsername(), links: links.map((l) => ({ displayName: l.displayName, createdAt: l.createdAt })) });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/link-code', requireAuth, async (req, res) => {
  if (!configured()) return res.status(503).json({ error: 'The Telegram bot is not set up' });
  try {
    const code = `l_${crypto.randomBytes(18).toString('base64url')}`;
    const expiresAt = new Date(Date.now() + LINK_CODE_MINUTES * 60000);
    await prisma.channelLinkCode.deleteMany({ where: { OR: [{ memberId: req.user!.memberId }, { expiresAt: { lt: new Date() } }] } });
    await prisma.channelLinkCode.create({ data: { codeHash: sha256hex(code), memberId: req.user!.memberId, expiresAt } });
    res.status(201).json({ url: `https://t.me/${await getBotUsername()}?start=${code}`, expiresAt });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.delete('/link', requireAuth, async (req, res) => {
  await prisma.channelLink.deleteMany({ where: { channel: CHANNEL, memberId: req.user!.memberId } });
  res.json({ ok: true });
});

// The admin's Settings card: is the bot set up and reaching us?
router.get('/admin', requireAuth, requireAdmin, async (_req, res) => {
  if (!TOKEN) return res.json({ configured: false, assistant: assistantAvailable() });
  try {
    const [info, linkedAccounts] = await Promise.all([
      telegram('getWebhookInfo'),
      prisma.channelLink.count({ where: { channel: CHANNEL } }),
    ]);
    res.json({
      configured: true,
      assistant: assistantAvailable(),
      botUsername: await getBotUsername(),
      webhookUrl: info.url || null,
      pendingUpdates: info.pending_update_count ?? 0,
      lastError: info.last_error_message ? { message: info.last_error_message, at: new Date(info.last_error_date * 1000).toISOString() } : null,
      linkedAccounts,
    });
  } catch (error) {
    res.status(502).json({ error: `Telegram: ${(error as Error).message}` });
  }
});

// Point Telegram at this server (and set the bot's command menu).
router.post('/admin/webhook', requireAuth, requireAdmin, async (req, res) => {
  if (!TOKEN) return res.status(503).json({ error: 'TELEGRAM_BOT_TOKEN is not set on the server' });
  const url = `${req.protocol}://${req.get('host')}/api/telegram/webhook`;
  try {
    await telegram('setWebhook', { url, secret_token: WEBHOOK_SECRET, allowed_updates: ['message'], drop_pending_updates: true });
    await telegram('setMyCommands', {
      commands: [
        { command: 'start', description: 'Start, or link your phone number' },
        { command: 'whoami', description: 'Who you are asking as' },
        { command: 'new', description: 'Start a new conversation' },
        { command: 'voice', description: 'The language of your voice notes' },
        { command: 'unlink', description: 'Stop asking as your KMCC login' },
        { command: 'help', description: 'What I can do' },
      ],
    });
    res.json({ webhookUrl: url, botUsername: await getBotUsername() });
  } catch (error) {
    res.status(502).json({ error: `Telegram: ${(error as Error).message}` });
  }
});

export default router;
