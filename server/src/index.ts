import 'dotenv/config';
import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import { pool } from './db';
import { HttpError } from './http';
import { boardsRouter } from './routes/boards';
import { cardsRouter } from './routes/cards';
import { columnsRouter } from './routes/columns';

const app = express();
const port = Number(process.env['PORT'] || 3000);

// Allow the Angular app (another origin, port 4200) to call this API from the browser.
app.use(cors({ origin: process.env['CLIENT_ORIGIN'] || 'http://localhost:4200' }));
// Read JSON request bodies into req.body.
app.use(express.json({ limit: '1mb' }));

// Health check: open http://localhost:3000/api/health to see that the server and database work.
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', database: 'not connected' });
  }
});

app.use('/api/boards', boardsRouter);
app.use('/api/columns', columnsRouter);
app.use('/api/cards', cardsRouter);

// Unknown address → 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// Every error ends up here and becomes a JSON response.
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  console.error(error);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

app.listen(port, () => {
  console.log(`AppDrello API running on http://localhost:${port}`);
});
