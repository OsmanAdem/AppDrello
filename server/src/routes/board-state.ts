import { Router } from 'express';
import { PoolClient } from 'pg';
import { pool, withTransaction } from '../db';
import { asyncHandler, HttpError, requireText } from '../http';
import { toActivity, toAutomation, toBoard, toCard, toColumn, toField, toSprint } from '../mappers';

/**
 * The endpoints the Angular app uses to keep a whole board in sync.
 * Each PUT replaces one part of a board with the list the app sends:
 * rows in the list are inserted or updated, rows missing from it are deleted.
 * Everything runs in a transaction, so a board is never left half-saved.
 */
export const boardStateRouter = Router();

const PRIORITIES = new Set(['', 'Low', 'Medium', 'High']);

/** Empty strings and missing values become NULL in the database. */
function orNull(value: unknown): unknown {
  return value === undefined || value === '' ? null : value;
}

function asArray(value: unknown, fieldName: string): any[] {
  if (!Array.isArray(value)) throw new HttpError(400, `${fieldName} must be a list.`);
  return value;
}

/** Locks the board row so two saves of the same board happen one after the other. */
async function lockBoard(client: PoolClient, boardId: string): Promise<void> {
  const { rows } = await client.query('SELECT id FROM boards WHERE id = $1 FOR UPDATE', [boardId]);
  if (!rows[0]) throw new HttpError(404, 'Board not found.');
}

// PUT /api/boards/:id { name, createdAt? } → create the board, or rename it if it exists
boardStateRouter.put('/:id', asyncHandler(async (req, res) => {
  const name = requireText(req.body.name, 'name');
  const { rows } = await pool.query(
    `INSERT INTO boards (id, name, background_color, created_at, updated_at)
     VALUES ($1, $2, $3, COALESCE($4::timestamptz, now()), now())
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, background_color = EXCLUDED.background_color, updated_at = now()
     RETURNING *`,
    [req.params['id'], name, orNull(req.body.backgroundColor), orNull(req.body.createdAt)]
  );
  res.json(toBoard(rows[0]));
}));

// GET /api/boards/:id/state → everything the app needs to show one board
boardStateRouter.get('/:id/state', asyncHandler(async (req, res) => {
  const boardId = req.params['id'];
  const board = await pool.query('SELECT * FROM boards WHERE id = $1', [boardId]);
  if (!board.rows[0]) throw new HttpError(404, 'Board not found.');

  const [columns, cards, sprints, fields, automations, activity] = await Promise.all([
    pool.query('SELECT * FROM columns WHERE board_id = $1 ORDER BY position', [boardId]),
    pool.query('SELECT * FROM cards WHERE board_id = $1 ORDER BY position', [boardId]),
    pool.query('SELECT * FROM sprints WHERE board_id = $1 ORDER BY created_at', [boardId]),
    pool.query('SELECT * FROM custom_field_definitions WHERE board_id = $1 ORDER BY position', [boardId]),
    pool.query('SELECT * FROM automations WHERE board_id = $1 ORDER BY position', [boardId]),
    pool.query('SELECT * FROM activity WHERE board_id = $1 ORDER BY created_at DESC LIMIT 200', [boardId])
  ]);

  res.json({
    board: toBoard(board.rows[0]),
    columns: columns.rows.map(column => ({
      ...toColumn(column),
      cards: cards.rows.filter(card => card.column_id === column.id).map(toCard)
    })),
    sprints: sprints.rows.map(toSprint),
    fields: fields.rows.map(toField),
    automations: automations.rows.map(toAutomation),
    activity: activity.rows.map(toActivity)
  });
}));

// PUT /api/boards/:id/columns { columns: [{ id, title, cards: [...] }] } → save columns and cards
boardStateRouter.put('/:id/columns', asyncHandler(async (req, res) => {
  const boardId = req.params['id'];
  const columns = asArray(req.body.columns, 'columns');

  await withTransaction(async client => {
    await lockBoard(client, boardId);

    const columnIds = columns.map(column => String(column.id));
    const cards = columns.flatMap(column =>
      asArray(column.cards ?? [], 'cards').map((card, position) => ({ ...card, columnId: column.id, position }))
    );
    const cardIds = cards.map(card => String(card.id));

    // 1. Columns: insert new ones, update the rest (title and order).
    for (const [position, column] of columns.entries()) {
      await client.query(
        `INSERT INTO columns (id, board_id, title, position, is_backlog)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, position = EXCLUDED.position, is_backlog = EXCLUDED.is_backlog
         WHERE columns.board_id = EXCLUDED.board_id`,
        [column.id, boardId, String(column.title ?? ''), position, !!column.isBacklog]
      );
    }

    // 2. Remove deleted cards first, so their issue keys are free again.
    await client.query('DELETE FROM cards WHERE board_id = $1 AND NOT (id = ANY($2::text[]))', [boardId, cardIds]);

    // 3. Cards: insert or update. A sprint that doesn't exist (yet) becomes NULL instead of an error.
    for (const card of cards) {
      await client.query(
        `INSERT INTO cards (id, board_id, column_id, sprint_id, issue_key, title, priority, label,
                            description, assignee, start_date, due_date, checklist, custom_fields, position)
         VALUES ($1, $2, $3, (SELECT id FROM sprints WHERE id = $4 AND board_id = $2), $5, $6, $7, $8,
                 $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT (id) DO UPDATE SET
           column_id = EXCLUDED.column_id, sprint_id = EXCLUDED.sprint_id, issue_key = EXCLUDED.issue_key,
           title = EXCLUDED.title, priority = EXCLUDED.priority, label = EXCLUDED.label,
           description = EXCLUDED.description, assignee = EXCLUDED.assignee,
           start_date = EXCLUDED.start_date, due_date = EXCLUDED.due_date,
           checklist = EXCLUDED.checklist, custom_fields = EXCLUDED.custom_fields, position = EXCLUDED.position
         WHERE cards.board_id = EXCLUDED.board_id`,
        [
          card.id, boardId, card.columnId, orNull(card.sprintId), String(card.issueKey || card.id),
          String(card.title ?? ''), PRIORITIES.has(card.priority) ? card.priority : '', String(card.label ?? ''),
          orNull(card.description), orNull(card.assignee), orNull(card.startDate), orNull(card.dueDate),
          JSON.stringify(card.checklist ?? []), JSON.stringify(card.customFields ?? {}), card.position
        ]
      );
    }

    // 4. Remove deleted columns (their cards were already handled above).
    await client.query('DELETE FROM columns WHERE board_id = $1 AND NOT (id = ANY($2::text[]))', [boardId, columnIds]);
  });

  res.status(204).end();
}));

// PUT /api/boards/:id/sprints { sprints: [...] }
boardStateRouter.put('/:id/sprints', asyncHandler(async (req, res) => {
  const boardId = req.params['id'];
  const sprints = asArray(req.body.sprints, 'sprints');

  await withTransaction(async client => {
    await lockBoard(client, boardId);
    await client.query('DELETE FROM sprints WHERE board_id = $1 AND NOT (id = ANY($2::text[]))',
      [boardId, sprints.map(sprint => String(sprint.id))]);

    for (const sprint of sprints) {
      await client.query(
        `INSERT INTO sprints (id, board_id, name, goal, start_date, end_date, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, now()))
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, goal = EXCLUDED.goal, start_date = EXCLUDED.start_date,
           end_date = EXCLUDED.end_date, status = EXCLUDED.status
         WHERE sprints.board_id = EXCLUDED.board_id`,
        [sprint.id, boardId, requireText(sprint.name, 'sprint name'), orNull(sprint.goal),
         orNull(sprint.startDate), orNull(sprint.endDate), sprint.status, orNull(sprint.createdAt)]
      );
    }
  });

  res.status(204).end();
}));

// PUT /api/boards/:id/fields { fields: [...] }
boardStateRouter.put('/:id/fields', asyncHandler(async (req, res) => {
  const boardId = req.params['id'];
  const fields = asArray(req.body.fields, 'fields');

  await withTransaction(async client => {
    await lockBoard(client, boardId);
    await client.query('DELETE FROM custom_field_definitions WHERE board_id = $1 AND NOT (id = ANY($2::text[]))',
      [boardId, fields.map(field => String(field.id))]);

    for (const [position, field] of fields.entries()) {
      await client.query(
        `INSERT INTO custom_field_definitions (id, board_id, name, type, options, position)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type,
           options = EXCLUDED.options, position = EXCLUDED.position
         WHERE custom_field_definitions.board_id = EXCLUDED.board_id`,
        [field.id, boardId, requireText(field.name, 'field name'), field.type,
         field.options ? JSON.stringify(field.options) : null, position]
      );
    }
  });

  res.status(204).end();
}));

// PUT /api/boards/:id/automations { automations: [...] }
boardStateRouter.put('/:id/automations', asyncHandler(async (req, res) => {
  const boardId = req.params['id'];
  const rules = asArray(req.body.automations, 'automations');

  await withTransaction(async client => {
    await lockBoard(client, boardId);
    await client.query('DELETE FROM automations WHERE board_id = $1 AND NOT (id = ANY($2::text[]))',
      [boardId, rules.map(rule => String(rule.id))]);

    for (const [position, rule] of rules.entries()) {
      await client.query(
        `INSERT INTO automations (id, board_id, enabled, trigger_type, trigger_column_id, action_type, action_value, position, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, now()))
         ON CONFLICT (id) DO UPDATE SET enabled = EXCLUDED.enabled, trigger_type = EXCLUDED.trigger_type,
           trigger_column_id = EXCLUDED.trigger_column_id, action_type = EXCLUDED.action_type,
           action_value = EXCLUDED.action_value, position = EXCLUDED.position
         WHERE automations.board_id = EXCLUDED.board_id`,
        [rule.id, boardId, rule.enabled !== false, rule.trigger, orNull(rule.triggerColumnId),
         rule.action, String(rule.actionValue ?? ''), position, orNull(rule.createdAt)]
      );
    }
  });

  res.status(204).end();
}));

// POST /api/boards/:id/activity { events: [...] } → add history entries (duplicates are ignored)
boardStateRouter.post('/:id/activity', asyncHandler(async (req, res) => {
  const boardId = req.params['id'];
  const events = asArray(req.body.events, 'events');

  await withTransaction(async client => {
    await lockBoard(client, boardId);
    for (const event of events) {
      await client.query(
        `INSERT INTO activity (id, board_id, action, description, card_id, issue_key, card_title, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, now()))
         ON CONFLICT (id) DO NOTHING`,
        [event.id, boardId, requireText(event.action, 'action'), String(event.description ?? ''),
         orNull(event.cardId), orNull(event.issueKey), orNull(event.cardTitle), orNull(event.createdAt)]
      );
    }
  });

  res.status(204).end();
}));

// DELETE /api/boards/:id/activity → clear the board's history
boardStateRouter.delete('/:id/activity', asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM activity WHERE board_id = $1', [req.params['id']]);
  res.status(204).end();
}));
