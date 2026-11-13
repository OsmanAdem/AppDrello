import 'dotenv/config';
import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import { pool } from './db';
import { applySchema } from './schema';
import { HttpError } from './http';
import { requireAuth } from './auth';
import { authRouter } from './routes/auth';
import { boardsRouter } from './routes/boards';
import { boardStateRouter } from './routes/board-state';
import { templatesRouter } from './routes/templates';
import { membersRouter } from './routes/members';
import { invitationsRouter } from './routes/invitations';
import { announceBoardChanges, liveRouter } from './live';

const app = express();
const port = Number(process.env['PORT'] || 3000);

// On a hosting service, requests pass through its proxy first. This makes req.ip the
// visitor's real address, which the rate limits rely on.
app.set('trust proxy', 1);

// Don't tell visitors which server software runs here ("X-Powered-By: Express").
app.disable('x-powered-by');

// Standard security headers on every answer:
// - nosniff: the browser must trust the stated file type, never guess it
// - Referrer-Policy: don't send full addresses (with board ids) to other sites
// - DENY: the API may not be shown inside someone else's page (clickjacking)
// - HSTS: always use HTTPS for this server from now on (ignored on http://localhost)
app.use((_req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Strict-Transport-Security': 'max-age=15552000'
  });
  next();
});

// Allow the Angular app to call this API from the browser. CLIENT_ORIGIN can hold several
// addresses separated by commas, e.g. the live site and localhost.
const allowedOrigins = (process.env['CLIENT_ORIGIN'] || 'http://localhost:4200')
  .split(',')
  .map(origin => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins }));
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
// Live updates: open boards are told when someone else saves a change.
app.use('/api/boards', requireAuth, liveRouter);
app.use('/api/boards', announceBoardChanges);
app.use('/api/boards', requireAuth, boardsRouter);
app.use('/api/boards', requireAuth, boardStateRouter);
app.use('/api/boards', requireAuth, membersRouter);
app.use('/api/invitations', requireAuth, invitationsRouter);
app.use('/api/templates', requireAuth, templatesRouter);

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

// Bring the database up to date first (new tables or columns), then start answering requests.
applySchema()
  .catch(error => console.error('Could not update the database tables:', error.message))
  .finally(() => {
    app.listen(port, () => {
      console.log(`AppDrello API running on http://localhost:${port}`);
    });
  });
