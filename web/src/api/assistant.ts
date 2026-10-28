import axios from 'axios';
import { api } from './client';

// The AI assistant (server: server/src/ai/assistant.ts and telegram.ts).

export interface AssistantSource {
  n: number;
  source: string;
  section?: string;
}

export interface AssistantQuota {
  limit: number | null;
  remaining: number | null;
}

export interface AssistantReply extends AssistantQuota {
  answer: string;
  sources: AssistantSource[];
  // offer: nothing in KMCC's data answered it - the chat offers "Ask a person".
  handover?: { offer: boolean; reason?: string };
}

export interface AssistantStatus extends Partial<AssistantQuota> {
  available: boolean;
  askingAs?: { role: 'admin' | 'member'; memberCode: string; name: string };
  // Who answers "Ask a person", and their unread replies (null: not known now).
  handover?: { person: string; newReplies: number | null } | null;
}

// An assistant error that still says how many questions are left.
export class AssistantError extends Error {
  quota?: AssistantQuota;
  constructor(message: string, quota?: AssistantQuota) {
    super(message);
    this.quota = quota;
  }
}

const quotaOf = (r: { limit?: number | null; remaining?: number | null } | undefined): AssistantQuota | undefined =>
  r && r.limit !== undefined ? { limit: r.limit ?? null, remaining: r.remaining ?? null } : undefined;

// The server's message, or `fallback`.
function failure(err: unknown, fallback: string): AssistantError {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string; limit?: number | null; remaining?: number | null } | undefined;
    return new AssistantError(data?.error || fallback, quotaOf(data));
  }
  return new AssistantError(fallback);
}

export async function getAssistantStatus(): Promise<AssistantStatus> {
  const { data } = await api.get<AssistantStatus>('/assistant/status');
  return data;
}

export async function askAssistant(question: string, chatId: string): Promise<AssistantReply> {
  try {
    // The AI may take a while (it reads this server's data first).
    const { data } = await api.post<AssistantReply>('/assistant/ask', { question, chatId }, { timeout: 130000 });
    return data;
  } catch (err) {
    throw failure(err, 'The assistant could not answer - please try again');
  }
}

export async function transcribeAssistant(audio: Blob, language?: string): Promise<string> {
  try {
    const { data } = await api.post<{ text: string }>('/assistant/transcribe', audio, {
      params: language ? { lang: language } : undefined,
      headers: { 'Content-Type': audio.type || 'audio/webm' },
      timeout: 70000,
    });
    return data.text ?? '';
  } catch (err) {
    throw failure(err, 'Could not turn the recording into text');
  }
}

export async function clearAssistantChat(chatId: string): Promise<void> {
  await api.delete(`/assistant/chat/${encodeURIComponent(chatId)}`);
}

// Settings (admin): questions per day for members and the admin (0 = no limit).
export interface AssistantDailyLimits {
  member: number;
  admin: number;
}

export async function getAssistantSettings(): Promise<{ dailyLimits: AssistantDailyLimits; defaults: AssistantDailyLimits; max: number }> {
  try {
    return (await api.get('/assistant/settings')).data;
  } catch (err) {
    throw failure(err, 'Failed to load the assistant settings');
  }
}

export async function saveAssistantSettings(dailyLimits: AssistantDailyLimits): Promise<{ dailyLimits: AssistantDailyLimits }> {
  try {
    return (await api.put('/assistant/settings', { dailyLimits })).data;
  } catch (err) {
    throw failure(err, 'Failed to save the assistant settings');
  }
}

// The Telegram bot: the person's own link, and for the admin the bot's status.
export interface TelegramLinkStatus {
  available: boolean;
  botUsername?: string;
  links?: { displayName: string | null; createdAt: string }[];
}

export interface TelegramBotStatus {
  configured: boolean;
  assistant: boolean;
  botUsername?: string;
  webhookUrl?: string | null;
  pendingUpdates?: number;
  lastError?: { message: string; at: string } | null;
  linkedAccounts?: number;
}

async function telegramCall<T>(request: () => Promise<{ data: T }>, fallback: string): Promise<T> {
  try {
    return (await request()).data;
  } catch (err) {
    throw failure(err, fallback);
  }
}

export const getTelegramLink = () => telegramCall<TelegramLinkStatus>(() => api.get('/telegram/link'), 'Failed to load the Telegram link');
// A one-time t.me link (10 minutes) that links the Telegram account that opens it.
export const createTelegramLinkCode = () => telegramCall<{ url: string; expiresAt: string }>(() => api.post('/telegram/link-code'), 'Failed to make a Telegram link');
export const unlinkTelegram = () => telegramCall<{ ok: true }>(() => api.delete('/telegram/link'), 'Failed to unlink Telegram');
export const getTelegramBotStatus = () => telegramCall<TelegramBotStatus>(() => api.get('/telegram/admin'), 'Failed to load the Telegram bot status');
export const connectTelegramBot = () => telegramCall<{ webhookUrl: string; botUsername: string }>(() => api.post('/telegram/admin/webhook'), 'Failed to connect the bot');

// "Ask a person" (server: server/src/ai/handover.ts): a question the assistant
// could not answer, sent to a person, and their replies.
export interface HandoverMessage {
  id: number;
  at: string;
  from: 'user' | 'owner';
  text: string;
}
export interface HandoverTicket {
  id: number;
  question: string;
  status: 'open' | 'answered' | 'closed';
  createdAt: string;
  updatedAt: string;
  newReplies: number;
  messages: HandoverMessage[];
}
const handoverCall = <T,>(request: () => Promise<{ data: T }>) => telegramCall<T>(request, 'Could not reach a person just now - please try again');
// question: left out, the chat's last question is sent. note: anything the user adds.
export const askPerson = (chatId: string, opts: { question?: string; note?: string; reason?: string } = {}) =>
  handoverCall<HandoverTicket>(() => api.post('/assistant/handover', { chatId, ...opts }));
export const getHandovers = () => handoverCall<{ tickets: HandoverTicket[]; newReplies: number }>(() => api.get('/assistant/handovers'));
export const writeToPerson = (id: number, text: string) => handoverCall<HandoverTicket>(() => api.post(`/assistant/handovers/${id}/messages`, { text }));
export const markHandoverSeen = (id: number) => handoverCall<{ ok: boolean }>(() => api.post(`/assistant/handovers/${id}/seen`, {}));
