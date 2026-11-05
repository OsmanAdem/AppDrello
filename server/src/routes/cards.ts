import { Router } from 'express';
import { pool, withTransaction } from '../db';
import { asyncHandler, HttpError } from '../http';
import { canAccessBoard, userIdOf } from '../auth';
import { toCard } from '../mappers';

export const cardsRouter = Router();

// Only continue if the card is on a board the user owns or is a member of.
cardsRouter.param('id', (req, res, next, id) => {
  pool.query(
    `SELECT cards.id FROM cards JOIN boards ON boards.id = cards.board_id WHERE cards.id = $1 AND ${canAccessBoard('$2')}`,
    [String(id), userIdOf(res)]
  ).then(({ rows }) => next(rows[0] ? undefined : new HttpError(404, 'Card not found.')), next);
});

// Which fields the app may change, and which database column each one maps to.
const EDITABLE_FIELDS: Record<string, string> = {
  title: 'title',
  priority: 'priority',
  label: 'label',
  description: 'description',
  assignee: 'assignee',
  startDate: 'start_date',
  dueDate: 'due_date',
  sprintId: 'sprint_id',
  checklist: 'checklist',
  customFields: 'custom_fields'
};
const JSON_FIELDS = new Set(['checklist', 'customFields']);

// PATCH /api/cards/:id { title?, priority?, dueDate?, ... } → update only the fields sent
cardsRouter.patch('/:id', asyncHandler(async (req, res) => {
  const updates: string[] = [];
  const values: unknown[] = [];

  for (const [field, column] of Object.entries(EDITABLE_FIELDS)) {
    if (!(field in req.body)) continue;

    let value = req.body[field];
    if (value === '' && field !== 'priority' && field !== 'label') value = null; // empty → no value
    if (JSON_FIELDS.has(field)) value = JSON.stringify(value ?? (field === 'checklist' ? [] : {}));

    values.push(value);
    // Values are always sent as $1, $2... parameters, never pasted into the SQL (prevents SQL injection).
    updates.push(`${column} = $${values.length}`);
  }

  if (updates.length === 0) throw new HttpError(400, 'Send at least one field to update.');
  if ('title' in req.body && !String(req.body.title ?? '').trim()) {
    throw new HttpError(400, 'title cannot be empty.');
  }

  values.push(req.params['id']);
  const { rows } = await pool.query(
    `UPDATE cards SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  if (!rows[0]) throw new HttpError(404, 'Card not found.');
  res.json(toCard(rows[0]));
}));

// POST /api/cards/:id/move { columnId, position } → drag and drop
cardsRouter.post('/:id/move', asyncHandler(async (req, res) => {
  const { columnId } = req.body;
  const position = Number(req.body.position);
  if (typeof columnId !== 'string' || !Number.isInteger(position) || position < 0) {
    throw new HttpError(400, 'columnId and a position of 0 or more are required.');
  }

  const card = await withTransaction(async client => {
    const current = await client.query('SELECT * FROM cards WHERE id = $1 FOR UPDATE', [req.params['id']]);
    if (!current.rows[0]) throw new HttpError(404, 'Card not found.');

    const target = await client.query('SELECT board_id FROM columns WHERE id = $1', [columnId]);
    if (!target.rows[0] || target.rows[0].board_id !== current.rows[0].board_id) {
      throw new HttpError(400, 'The target column must be on the same board.');
    }

    // Take the card's new place, then renumber both columns 0, 1, 2... so positions never have gaps.
    const others = await client.query(
      'SELECT id FROM cards WHERE column_id = $1 AND id <> $2 ORDER BY position',
      [columnId, current.rows[0].id]
    );
    const ordered = others.rows.map(row => row.id);
    ordered.splice(Math.min(position, ordered.length), 0, current.rows[0].id);

    for (const [index, id] of ordered.entries()) {
      await client.query('UPDATE cards SET column_id = $1, position = $2 WHERE id = $3', [columnId, index, id]);
    }

    if (current.rows[0].column_id !== columnId) {
      await client.query(
        `UPDATE cards SET position = sub.new_position
         FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY position) - 1 AS new_position
               FROM cards WHERE column_id = $1) sub
         WHERE cards.id = sub.id`,
        [current.rows[0].column_id]
      );
    }

    const { rows } = await client.query('SELECT * FROM cards WHERE id = $1', [current.rows[0].id]);
    return rows[0];
  });

  res.json(toCard(card));
}));

// DELETE /api/cards/:id
cardsRouter.delete('/:id', asyncHandler(async (req, res) => {
  const result = await pool.query('DELETE FROM cards WHERE id = $1', [req.params['id']]);
  if (result.rowCount === 0) throw new HttpError(404, 'Card not found.');
  res.status(204).end();
}));
