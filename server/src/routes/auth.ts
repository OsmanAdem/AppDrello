import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { pool, withTransaction } from '../db';
import { createToken, requireAuth, userIdOf } from '../auth';
import { asyncHandler, HttpError, requireText } from '../http';

export const authRouter = Router();

/** bcrypt "cost": how much work hashing takes. Higher = slower to crack, 12 is a common choice. */
const HASH_ROUNDS = 12;

function toUser(row: any) {
  return { id: row.id, name: row.name, email: row.email };
}

function readEmail(value: unknown): string {
  const email = requireText(value, 'email').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  return email;
}

// POST /api/auth/register { name, email, password } → creates an account and logs in
authRouter.post('/register', asyncHandler(async (req, res) => {
  const name = requireText(req.body.name, 'name');
  const email = readEmail(req.body.email);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (password.length < 8) throw new HttpError(400, 'The password must be at least 8 characters.');

  const passwordHash = await bcrypt.hash(password, HASH_ROUNDS);

  const user = await withTransaction(async client => {
    try {
      const { rows } = await client.query(
        'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING *',
        [name, email, passwordHash]
      );
      // Boards made before accounts existed belong to nobody: give them to this account.
      await client.query('UPDATE boards SET owner_id = $1 WHERE owner_id IS NULL', [rows[0].id]);
      await client.query('UPDATE templates SET owner_id = $1 WHERE owner_id IS NULL', [rows[0].id]);
      return rows[0];
    } catch (error: any) {
      if (error.code === '23505') throw new HttpError(409, 'An account with this email already exists.');
      throw error;
    }
  });

  res.status(201).json({ token: createToken(user.id), user: toUser(user) });
}));

// POST /api/auth/login { email, password } → a token if the password is right
authRouter.post('/login', asyncHandler(async (req, res) => {
  const email = readEmail(req.body.email);
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];
  const passwordMatches = user ? await bcrypt.compare(password, user.password_hash) : false;

  // The same message for "no such email" and "wrong password", so nobody can test which emails have accounts.
  if (!user || !passwordMatches) throw new HttpError(401, 'Wrong email or password.');

  res.json({ token: createToken(user.id), user: toUser(user) });
}));

// GET /api/auth/me → who is logged in
authRouter.get('/me', requireAuth, asyncHandler(async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [userIdOf(res)]);
  if (!rows[0]) throw new HttpError(401, 'Please log in.');
  res.json(toUser(rows[0]));
}));
