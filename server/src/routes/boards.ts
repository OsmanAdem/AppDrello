import { Router } from 'express';
import { pool, withTransaction } from '../db';
import { HttpError, MAX_BOARD_NAME, MAX_COLUMN_TITLE, asyncHandler, requireText } from '../http';
import { assertBoardAccess, assertBoardOwner, canAccessBoard, userIdOf } from '../auth';
import { toBoard, toCard, toColumn } from '../mappers';

export const boardsRouter = Router();

// Every route below with :id first checks that the user owns the board or is a member of it.
boardsRouter.param('id', (req, res, next, id) => {
  assertBoardAccess(String(id), userIdOf(res)).then(() => next(), next);
});

const DEFAULT_COLUMNS = ['To Do', 'In Progress', 'Done'];

// GET /api/boards → all boards
boardsRouter.get('/', asyncHandler(async (_req, res) => {
  // Your own boards and boards shared with you, with your role and the owner's name.
  const { rows } = await pool.query(
    `SELECT boards.*, owners.name AS owner_name,
            CASE WHEN boards.owner_id = $1 THEN 'owner' ELSE 'member' END AS role
     FROM boards
     LEFT JOIN users owners ON owners.id = boards.owner_id
     WHERE ${canAccessBoard('$1')}
     ORDER BY boards.created_at`,
    [userIdOf(res)]
  );
  res.json(rows.map(toBoard));
}));

// POST /api/boards { name, columns? } → creates a board with its columns
boardsRouter.post('/', asyncHandler(async (req, res) => {
  const name = requireText(req.body.name, 'name').slice(0, MAX_BOARD_NAME);
  const columnTitles: string[] = Array.isArray(req.body.columns) && req.body.columns.length
    ? req.body.columns.map((title: unknown) => requireText(title, 'column title').slice(0, MAX_COLUMN_TITLE))
    : DEFAULT_COLUMNS;

  // A transaction: if creating a column fails, the board isn't saved either.
  const board = await withTransaction(async client => {
    const { rows } = await client.query(
      'INSERT INTO boards (name, owner_id) VALUES ($1, $2) RETURNING *',
      [name, userIdOf(res)]
    );
    const created = rows[0];

    for (const [position, title] of columnTitles.entries()) {
      await client.query(
        'INSERT INTO columns (board_id, title, position) VALUES ($1, $2, $3)',
        [created.id, title, position]
      );
    }
    return created;
  });

  res.status(201).json(toBoard(board));
}));

// GET /api/boards/:id → one board
boardsRouter.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM boards WHERE id = $1', [req.params['id']]);
  if (!rows[0]) throw new HttpError(404, 'Board not found.');
  res.json(toBoard(rows[0]));
}));

// PATCH /api/boards/:id { name } → rename a board
boardsRouter.patch('/:id', asyncHandler(async (req, res) => {
  await assertBoardOwner(req.params['id'], userIdOf(res), 'rename it');
  const name = requireText(req.body.name, 'name').slice(0, MAX_BOARD_NAME);
  const { rows } = await pool.query(
    'UPDATE boards SET name = $1, updated_at = now() WHERE id = $2 RETURNING *',
    [name, req.params['id']]
  );
  if (!rows[0]) throw new HttpError(404, 'Board not found.');
  res.json(toBoard(rows[0]));
}));

// DELETE /api/boards/:id → deletes the board; the database deletes its columns and cards (CASCADE)
boardsRouter.delete('/:id', asyncHandler(async (req, res) => {
  await assertBoardOwner(req.params['id'], userIdOf(res), 'delete it');
  const result = await pool.query('DELETE FROM boards WHERE id = $1', [req.params['id']]);
  if (result.rowCount === 0) throw new HttpError(404, 'Board not found.');
  res.status(204).end();
}));

// GET /api/boards/:id/columns → the board's columns, each with its cards in order
boardsRouter.get('/:id/columns', asyncHandler(async (req, res) => {
  const boardId = req.params['id'];
  const columns = await pool.query(
    'SELECT * FROM columns WHERE board_id = $1 ORDER BY position',
    [boardId]
  );
  const cards = await pool.query(
    'SELECT * FROM cards WHERE board_id = $1 ORDER BY position',
    [boardId]
  );

  res.json(columns.rows.map(column => ({
    ...toColumn(column),
    cards: cards.rows.filter(card => card.column_id === column.id).map(toCard)
  })));
}));

// POST /api/boards/:id/columns { title } → adds a column at the end
boardsRouter.post('/:id/columns', asyncHandler(async (req, res) => {
  const title = requireText(req.body.title, 'title');
  const boardId = req.params['id'];

  const board = await pool.query('SELECT id FROM boards WHERE id = $1', [boardId]);
  if (!board.rows[0]) throw new HttpError(404, 'Board not found.');

  const { rows } = await pool.query(
    `INSERT INTO columns (board_id, title, position)
     VALUES ($1, $2, (SELECT COALESCE(MAX(position) + 1, 0) FROM columns WHERE board_id = $1))
     RETURNING *`,
    [boardId, title]
  );
  res.status(201).json({ ...toColumn(rows[0]), cards: [] });
}));
