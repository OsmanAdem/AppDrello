import { Router } from 'express';
import { pool } from '../db';
import { assertBoardAccess, assertBoardOwner, userIdOf } from '../auth';
import { asyncHandler, HttpError, requireText } from '../http';
import { sendEmail } from '../email';
import { rateLimit } from '../rate-limit';

/** Who has access to a board, and inviting or removing people. */
export const membersRouter = Router();

function toMember(row: any) {
  return { id: row.id, name: row.name, email: row.email, role: row.role, addedAt: row.added_at ?? undefined };
}

/** The owner first, then members in the order they were added. */
async function listMembers(boardId: string) {
  const { rows } = await pool.query(
    `SELECT users.id, users.name, users.email, 'owner' AS role, NULL::timestamptz AS added_at, 0 AS sort
       FROM boards JOIN users ON users.id = boards.owner_id
      WHERE boards.id = $1
     UNION ALL
     SELECT users.id, users.name, users.email, board_members.role, board_members.added_at, 1 AS sort
       FROM board_members JOIN users ON users.id = board_members.user_id
      WHERE board_members.board_id = $1
     ORDER BY sort, added_at`,
    [boardId]
  );
  return rows.map(toMember);
}

// GET /api/boards/:id/members → everyone who can open the board
membersRouter.get('/:id/members', asyncHandler(async (req, res) => {
  await assertBoardAccess(req.params['id'], userIdOf(res));
  res.json(await listMembers(req.params['id']));
}));

// Inviting sends emails, so limit it like the other email features.
const inviteLimit = rateLimit({
  max: 20, windowMinutes: 60, key: (req) => 'invite:' + String(req.params['id']),
  message: "You've invited many people in a short time. Please wait a while and try again."
});

// POST /api/boards/:id/members { email } → the owner shares the board with someone who has an account
membersRouter.post('/:id/members', inviteLimit, asyncHandler(async (req, res) => {
  const boardId = req.params['id'];
  const ownerId = userIdOf(res);
  await assertBoardOwner(boardId, ownerId, 'invite people');

  const email = requireText(req.body.email, 'email').toLowerCase();
  const found = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  const invitee = found.rows[0];
  if (!invitee) {
    throw new HttpError(404, 'No Drello account uses that email. Ask them to sign up first, then invite them again.');
  }
  if (invitee.id === ownerId) throw new HttpError(400, "That's you. You already own this board.");

  const added = await pool.query(
    'INSERT INTO board_members (board_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
    [boardId, invitee.id]
  );
  if (!added.rows[0]) throw new HttpError(409, `${invitee.name} already has access to this board.`);

  // Tell them by email. If sending fails, the invitation still works.
  const details = await pool.query(
    'SELECT boards.name AS board_name, users.name AS owner_name FROM boards JOIN users ON users.id = boards.owner_id WHERE boards.id = $1',
    [boardId]
  );
  const { board_name: boardName, owner_name: ownerName } = details.rows[0];
  const appUrl = process.env['CLIENT_ORIGIN'] || 'http://localhost:4200';
  try {
    await sendEmail(
      invitee.email,
      `${ownerName} shared "${boardName}" with you`,
      `Hi ${invitee.name},\n\n${ownerName} shared the board "${boardName}" with you on Drello.\n\n` +
      `Open it here: ${appUrl}/boards/${boardId}\n\nYou'll also find it under "Shared with you" on your Boards page.`
    );
  } catch (error: any) {
    console.error('Could not send the invitation email:', error?.message ?? error);
  }

  res.status(201).json(await listMembers(boardId));
}));

// DELETE /api/boards/:id/members/:userId → the owner removes someone, or a member leaves
membersRouter.delete('/:id/members/:userId', asyncHandler(async (req, res) => {
  const boardId = req.params['id'];
  const me = userIdOf(res);
  const target = req.params['userId'];
  const role = await assertBoardAccess(boardId, me);

  if (role === 'owner' && target === me) {
    throw new HttpError(400, "The owner can't leave the board. Delete it instead, if you don't need it anymore.");
  }
  if (role === 'member' && target !== me) {
    throw new HttpError(403, "Only the board's owner can remove other people.");
  }

  await pool.query('DELETE FROM board_members WHERE board_id = $1 AND user_id = $2', [boardId, target]);
  res.json(target === me ? [] : await listMembers(boardId));
}));
