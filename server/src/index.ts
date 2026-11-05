import 'dotenv/config';
import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import { pool } from './db';
import { HttpError } from './http';
import { requireAuth } from './auth';
import { authRouter } from './routes/auth';
import { boardsRouter } from './routes/boards';
import { boardStateRouter } from './routes/board-state';
import { cardsRouter } from './routes/cards';
import { columnsRouter } from './routes/columns';
import { templatesRouter } from './routes/templates';
import { membersRouter } from './routes/members';

const app = express();
const port = Number(process.env['PORT'] || 3000);

// Allow the Angular app (another origin, port 4200) to call this API from the browser.
app.use(cors({ origin: process.env['CLIENT_ORIGIN'] || 'http://localhost:4200' }));
// Read JSON request bodies into req.body.
app.use(express.json({ limit: '5mb' }));

// Health check: open http://localhost:3000/api/health to see that the server and database work.
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', database: 'not connected' });
  }
});

// Open to everyone: sign up and log in.
app.use('/api/auth', authRouter);

// Everything else needs a valid login token.
app.use('/api/boards', requireAuth, boardsRouter);
app.use('/api/boards', requireAuth, boardStateRouter);
app.use('/api/boards', requireAuth, membersRouter);
app.use('/api/templates', requireAuth, templatesRouter);
app.use('/api/columns', requireAuth, columnsRouter);
app.use('/api/cards', requireAuth, cardsRouter);

// Unknown address → 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// Every error ends up here and becomes a JSON response.
app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof HttpError) {
    if (error.status !== 401) console.warn(`${req.method} ${req.originalUrl} → ${error.status} ${error.message}`);
    res.status(error.status).json({ error: error.message });
    return;
  }
  console.error(`${req.method} ${req.originalUrl} → 500`, error);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

app.listen(port, () => {
  console.log(`AppDrello API running on http://localhost:${port}`);
});
