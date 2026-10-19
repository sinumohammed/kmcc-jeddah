import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth';
import memberRoutes from './routes/members';
import bankRoutes from './routes/banks';
import transactionRoutes from './routes/transactions';
import loanRoutes from './routes/loans';
import dashboardRoutes from './routes/dashboard';
import aiRoutes from './ai/routes';
import assistantRoutes from './ai/assistant';
import telegramRoutes from './ai/telegram';

const app = express();

// Vercel sits behind a proxy: without this req.protocol is http, and the
// Telegram webhook would be set to an http:// address.
app.set('trust proxy', true);

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/banks', bankRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/dashboard', dashboardRoutes);
// The AI assistant (server/src/ai/): the read-only API the AI service reads,
// the app's chat, and the Telegram bot.
app.use('/api/ai', aiRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/telegram', telegramRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
