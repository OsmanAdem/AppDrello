import 'dotenv/config';
import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from './db';
import { HttpError } from './http';

const secret = process.env['JWT_SECRET'];
if (!secret) {
  throw new Error('JWT_SECRET is missing. Add it to .env (see .env.example).');
}
const JWT_SECRET: string = secret;

/** How long a login lasts before the user has to log in again. */
const TOKEN_LIFETIME = '7d';

/**
 * Creates a signed login token (a JWT). It says "this is user X" and expires after 7 days.
 * The server can check the signature later, so the token can't be faked or changed.
 */
export function createToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: TOKEN_LIFETIME });
}

/**
 * Middleware for every protected route: reads "Authorization: Bearer <token>",
 * checks it, and stores the user's id in res.locals.userId. Without a valid token → 401.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (typeof payload !== 'object' || typeof payload.sub !== 'string') throw new Error('Bad token');
    res.locals['userId'] = payload.sub;
    next();
  } catch {
    next(new HttpError(401, 'Please log in.'));
  }
}

/** The logged-in user's id (set by requireAuth). */
export function userIdOf(res: Response): string {
  return res.locals['userId'];
}

/**
 * Throws 404 unless the board exists and the user may use it.
 * 404 instead of 403, so nobody can find out which board ids exist.
 */
export async function assertBoardAccess(boardId: string, userId: string): Promise<void> {
  const { rows } = await pool.query('SELECT id FROM boards WHERE id = $1 AND owner_id = $2', [boardId, userId]);
  if (!rows[0]) throw new HttpError(404, 'Board not found.');
}
