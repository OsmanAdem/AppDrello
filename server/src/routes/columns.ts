import { Router } from 'express';
import { pool, withTransaction } from '../db';
import { asyncHandler, HttpError, requireText } from '../http';
import { toCard, toColumn } from '../mappers';

export const columnsRouter = Router();

// PATCH /api/columns/:id { title } → rename a column
columnsRouter.patch('/:id', asyncHandler(async (req, res) => {
  const title = requireText(req.body.title, 'title');
  const { rows } = await pool.query(
    'UPDATE columns SET title = $1 WHERE id = $2 RETURNING *',
    [title, req.params['id']]
  );
  if (!rows[0]) throw new HttpError(404, 'Column not found.');
  res.json(toColumn(rows[0]));
}));

// DELETE /api/columns/:id → deletes the column and its cards
columnsRouter.delete('/:id', asyncHandler(async (req, res) => {
  const result = await pool.query('DELETE FROM columns WHERE id = $1', [req.params['id']]);
  if (result.rowCount === 0) throw new HttpError(404, 'Column not found.');
  res.status(204).end();
}));

// POST /api/columns/:id/cards { title } → adds a card at the bottom of the column
columnsRouter.post('/:id/cards', asyncHandler(async (req, res) => {
  const title = requireText(req.body.title, 'title');
  const columnId = req.params['id'];

  const card = await withTransaction(async client => {
    // Lock the column row so two people adding cards at once can't get the same issue key.
    const column = await client.query('SELECT * FROM columns WHERE id = $1 FOR UPDATE', [columnId]);
    if (!column.rows[0]) throw new HttpError(404, 'Column not found.');
    const boardId = column.rows[0].board_id;

    // Next issue key for this board: DRL-001, DRL-002, ...
    const highest = await client.query(
      `SELECT COALESCE(MAX(CAST(substring(issue_key FROM 5) AS INTEGER)), 0) AS n
       FROM cards WHERE board_id = $1 AND issue_key ~ '^DRL-[0-9]+$'`,
      [boardId]
    );
    const issueKey = `DRL-${String(Number(highest.rows[0].n) + 1).padStart(3, '0')}`;

    const { rows } = await client.query(
      `INSERT INTO cards (board_id, column_id, issue_key, title, position)
       VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(position) + 1, 0) FROM cards WHERE column_id = $2))
       RETURNING *`,
      [boardId, columnId, issueKey, title]
    );
    return rows[0];
  });

  res.status(201).json(toCard(card));
}));
