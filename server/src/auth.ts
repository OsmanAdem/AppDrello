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
 * A token created before the user's last password change is rejected too.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  let userId: string;
  let issuedAt: number;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (typeof payload !== 'object' || typeof payload.sub !== 'string' || typeof payload.iat !== 'number') {
      throw new Error('Bad token');
    }
    userId = payload.sub;
    issuedAt = payload.iat; // seconds since 1970
  } catch {
    next(new HttpError(401, 'Please log in.'));
    return;
  }

  pool.query('SELECT password_changed_at FROM users WHERE id = $1', [userId])
    .then(({ rows }) => {
      const user = rows[0];
      const changedAt = user?.password_changed_at ? Math.floor(new Date(user.password_changed_at).getTime() / 1000) : 0;
      if (!user || issuedAt < changedAt) {
        next(new HttpError(401, 'Please log in.'));
        return;
      }
      res.locals['userId'] = userId;
      next();
    })
    .catch(next);
}

/** The logged-in user's id (set by requireAuth). */
export function userIdOf(res: Response): string {
  return res.locals['userId'];
}

/**
 * SQL condition: "the user owns this board or is a member of it".
 * `userParam` is the query parameter that holds the user's id, e.g. '$2'.
 * Used everywhere a board is read or changed, so sharing works the same in every route.
 */
export function canAccessBoard(userParam: string): string {
  return `(boards.owner_id = ${userParam} OR EXISTS (
    SELECT 1 FROM board_members m WHERE m.board_id = boards.id AND m.user_id = ${userParam}))`;
}

export type BoardRole = 'owner' | 'member';

/**
 * Throws 404 unless the board exists and the user is its owner or a member.
 * 404 instead of 403, so nobody can find out which board ids exist.
 * Returns the user's role on the board.
 */
export async function assertBoardAccess(boardId: string, userId: string): Promise<BoardRole> {
  const { rows } = await pool.query(
    `SELECT boards.owner_id FROM boards WHERE boards.id = $1 AND ${canAccessBoard('$2')}`,
    [boardId, userId]
  );
  if (!rows[0]) throw new HttpError(404, 'Board not found.');
  return rows[0].owner_id === userId ? 'owner' : 'member';
}

/** Like assertBoardAccess, but only the owner may continue (403 for members). */
export async function assertBoardOwner(boardId: string, userId: string, action: string): Promise<void> {
  const role = await assertBoardAccess(boardId, userId);
  if (role !== 'owner') throw new HttpError(403, `Only the board's owner can ${action}.`);
}
