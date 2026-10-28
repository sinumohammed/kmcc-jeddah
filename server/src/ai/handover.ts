// "Ask a person": a question the assistant could not answer goes to a person
// (Sino, who runs the AI service), and the reply comes back here. The tickets
// live in the AI service (its /api/ask/handover*, with this app's key); this
// server only says which login is asking - each member as "user:<member id>",
// the same for the app's chat and the Telegram bot, so a question sent from
// one is seen in both. The ticket takes the last turns of that chat, so the
// person sees what was asked and answered.
// When the person replies, the AI service posts it to
// /api/assistant/handover-reply (handoverRoutes.ts) with KMCC_AI_TOKEN, and a
// member linked on Telegram gets it there at once. The chat reads it anyway.
import type { Asker } from './aiUser';

// The person who answers, as the app names them.
export const HANDOVER_PERSON = process.env.HANDOVER_PERSON || 'Sino';

export interface HandoverResult {
  status: number;
  body: Record<string, any>;
}

const base = () => String(process.env.AI_ASK_URL ?? '').replace(/\/$/, '');
export const handoverRef = (user: Asker) => `user:${user.memberId}`;

async function call(method: string, path: string, body?: object): Promise<HandoverResult> {
  try {
    const res = await fetch(`${base()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${process.env.AI_ASK_KEY}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, any>;
    const passOn = [400, 404, 429].includes(res.status);
    return { status: res.ok ? 200 : passOn ? res.status : 502, body: res.ok ? data : { error: data.error ?? 'Could not reach a person just now - please try again' } };
  } catch {
    return { status: 502, body: { error: 'Could not reach a person just now - please try again' } };
  }
}

const roleOf = (user: Asker) => (user.role === 'ADMIN' ? 'admin' : 'member');

// question: the one the assistant could not answer - the AI service takes the chat's last one when it is left out.
export const createHandover = (user: Asker & { name: string }, opts: { conversationId: string; question?: string; note?: string; reason?: string }) =>
  call('POST', '/handover', {
    user: { ref: handoverRef(user), name: user.name, role: roleOf(user) },
    conversationId: opts.conversationId,
    ...(opts.question ? { question: opts.question } : {}),
    ...(opts.note ? { note: opts.note } : {}),
    ...(opts.reason ? { reason: opts.reason } : {}),
  });
export const listHandovers = (user: Asker) => call('GET', `/handovers?user=${encodeURIComponent(handoverRef(user))}`);
export const writeToPerson = (user: Asker, id: string | number, text: string) =>
  call('POST', `/handovers/${encodeURIComponent(String(id))}/messages`, { user: { ref: handoverRef(user) }, text });
export const markHandoverSeen = (user: Asker, id: string | number) =>
  call('POST', `/handovers/${encodeURIComponent(String(id))}/seen`, { user: { ref: handoverRef(user) } });
