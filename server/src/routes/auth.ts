import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { Router } from 'express';
import { pool, withTransaction } from '../db';
import { createToken, requireAuth, userIdOf } from '../auth';
import { asyncHandler, HttpError, requireText } from '../http';
import { sendEmail } from '../email';

export const authRouter = Router();

/** bcrypt "cost": how much work hashing takes. Higher = slower to crack, 12 is a common choice. */
const HASH_ROUNDS = 12;

function toUser(row: any) {
  return { id: row.id, name: row.name, email: row.email };
}

function readNewPassword(value: unknown): string {
  const password = typeof value === 'string' ? value : '';
  if (password.length < 8) throw new HttpError(400, 'The password must be at least 8 characters.');
  return password;
}

/** Reset links contain a random secret; the database only stores this hash of it. */
function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const RESET_LINK_LIFETIME_MINUTES = 60;

function readEmail(value: unknown): string {
  const email = requireText(value, 'email').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  return email;
}

// POST /api/auth/register { name, email, password } → creates an account and logs in
authRouter.post('/register', asyncHandler(async (req, res) => {
  const name = requireText(req.body.name, 'name');
  const email = readEmail(req.body.email);
  const password = readNewPassword(req.body.password);

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

// POST /api/auth/change-password { currentPassword, newPassword } → for a logged-in user
authRouter.post('/change-password', requireAuth, asyncHandler(async (req, res) => {
  const userId = userIdOf(res);
  const newPassword = readNewPassword(req.body.newPassword);
  const currentPassword = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';

  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
  // Asking for the current password stops someone who finds your laptop logged in.
  if (!rows[0] || !(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
    throw new HttpError(400, 'Your current password is wrong.');
  }

  await pool.query(
    'UPDATE users SET password_hash = $1, password_changed_at = now() WHERE id = $2',
    [await bcrypt.hash(newPassword, HASH_ROUNDS), userId]
  );

  // Older tokens stop working (other devices are logged out), so give this device a new one.
  res.json({ token: createToken(userId), user: toUser(rows[0]) });
}));

// POST /api/auth/forgot-password { email } → emails a reset link if the account exists
authRouter.post('/forgot-password', asyncHandler(async (req, res) => {
  const email = readEmail(req.body.email);
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];

  if (user) {
    const token = randomBytes(32).toString('hex');
    await pool.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + make_interval(mins => $3))`,
      [user.id, hashResetToken(token), RESET_LINK_LIFETIME_MINUTES]
    );

    const appUrl = process.env['CLIENT_ORIGIN'] || 'http://localhost:4200';
    await sendEmail(
      user.email,
      'Reset your Drello password',
      `Hi ${user.name},\n\nOpen this link to choose a new password:\n${appUrl}/reset-password?token=${token}\n\n` +
      `The link works once and expires in ${RESET_LINK_LIFETIME_MINUTES} minutes. ` +
      "If you didn't ask for this, you can ignore this email."
    );
  }

  // Same answer whether or not the email has an account, so nobody can test which emails exist.
  res.json({ message: 'If an account exists for that email, a reset link has been sent.' });
}));

// POST /api/auth/reset-password { token, password } → sets a new password with a reset link
authRouter.post('/reset-password', asyncHandler(async (req, res) => {
  const token = requireText(req.body.token, 'token');
  const password = readNewPassword(req.body.password);

  await withTransaction(async client => {
    const { rows } = await client.query(
      `SELECT * FROM password_resets
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
       FOR UPDATE`,
      [hashResetToken(token)]
    );
    const reset = rows[0];
    if (!reset) throw new HttpError(400, 'This reset link is invalid or has expired. Please ask for a new one.');

    await client.query(
      'UPDATE users SET password_hash = $1, password_changed_at = now() WHERE id = $2',
      [await bcrypt.hash(password, HASH_ROUNDS), reset.user_id]
    );
    // Use up this link, and cancel any other open links for the same account.
    await client.query('UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [reset.user_id]);
  });

  res.json({ message: 'Your password has been changed. You can log in now.' });
}));
