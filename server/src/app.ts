import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth';
import memberRoutes from './routes/members';
import bankRoutes from './routes/banks';
import transactionRoutes from './routes/transactions';
import loanRoutes from './routes/loans';
import dashboardRoutes from './routes/dashboard';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/banks', bankRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
