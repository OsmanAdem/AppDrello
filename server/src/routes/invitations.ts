import { Router } from 'express';
import { pool } from '../db';
import { userIdOf } from '../auth';
import { asyncHandler, HttpError } from '../http';
import { toBoard } from '../mappers';
import { addListener, notifyBoardChanged, userChannel } from '../live';

/**
 * Invitations to boards. When an owner shares a board, the other person gets an
 * invitation first. They see it on their Boards page and choose Accept or Decline.
 */
export const invitationsRouter = Router();

// GET /api/invitations/events → stays open; says "changed" when the user is invited or removed somewhere
invitationsRouter.get('/events', (req, res) => {
  addListener(userChannel(userIdOf(res)), String(req.header('x-client-id') ?? ''), req, res);
});

// GET /api/invitations → the invitations waiting for the logged-in user
invitationsRouter.get('/', asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT boards.id AS board_id, boards.name AS board_name, owners.name AS owner_name, board_members.added_at
       FROM board_members
       JOIN boards ON boards.id = board_members.board_id
       JOIN users owners ON owners.id = boards.owner_id
      WHERE board_members.user_id = $1 AND board_members.status = 'pending'
      ORDER BY board_members.added_at DESC`,
    [userIdOf(res)]
  );
  res.json(rows.map(row => ({
    boardId: row.board_id,
    boardName: row.board_name,
    ownerName: row.owner_name,
    invitedAt: row.added_at
  })));
}));

// POST /api/invitations/:boardId/accept → join the board. Answers with the board.
invitationsRouter.post('/:boardId/accept', asyncHandler(async (req, res) => {
  const boardId = req.params['boardId'];
  const { rowCount } = await pool.query(
    `UPDATE board_members SET status = 'accepted', added_at = now()
      WHERE board_id = $1 AND user_id = $2 AND status = 'pending'`,
    [boardId, userIdOf(res)]
  );
  if (!rowCount) throw new HttpError(404, 'This invitation no longer exists.');

  const { rows } = await pool.query(
    `SELECT boards.*, owners.name AS owner_name, 'member' AS role
       FROM boards JOIN users owners ON owners.id = boards.owner_id WHERE boards.id = $1`,
    [boardId]
  );
  notifyBoardChanged(boardId); // the owner's open board shows the new member
  res.json(toBoard(rows[0]));
}));

// POST /api/invitations/:boardId/decline → say no. The invitation disappears.
invitationsRouter.post('/:boardId/decline', asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query(
    `DELETE FROM board_members WHERE board_id = $1 AND user_id = $2 AND status = 'pending'`,
    [req.params['boardId'], userIdOf(res)]
  );
  if (!rowCount) throw new HttpError(404, 'This invitation no longer exists.');
  notifyBoardChanged(req.params['boardId']); // the owner's share panel updates
  res.status(204).end();
}));
