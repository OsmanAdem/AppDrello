import { Router } from 'express';
import { PoolClient } from 'pg';
import { pool, withTransaction } from '../db';
import { asyncHandler, HttpError, requireText } from '../http';
import { assertBoardAccess, assertBoardOwner, canAccessBoard, userIdOf } from '../auth';
import { toActivity, toAutomation, toBoard, toCard, toColumn, toField, toSprint } from '../mappers';

/**
 * The endpoints the Angular app uses to keep a whole board in sync.
 * Each PUT saves one part of a board: rows in the list are inserted or updated, and
 * only the rows the app lists as removed are deleted. Rows that are simply missing stay,
 * because on a shared board someone else may have just added them.
 * Everything runs in a transaction, so a board is never left half-saved.
 */
export const boardStateRouter = Router();

const PRIORITIES = new Set(['', 'Low', 'Medium', 'High']);
/** Same limit as the title fields in the app; longer titles are cut, so a huge paste can't break a card. */
const MAX_CARD_TITLE = 160;

/** Empty strings and missing values become NULL in the database. */
function orNull(value: unknown): unknown {
  return value === undefined || value === '' ? null : value;
}

/** The ids the app says the user removed. Only these are deleted, so on a shared board
 *  a save never deletes what someone else just added. */
function removedIds(body: any): string[] {
  return Array.isArray(body?.removedIds) ? body.removedIds.map(String) : [];
}

function asArray(value: unknown, fieldName: string): any[] {
  if (!Array.isArray(value)) throw new HttpError(400, `${fieldName} must be a list.`);
  return value;
}

/**
 * Locks the board row so two saves of the same board happen one after the other
 * (important now that several people can edit it), and checks the user may edit it.
 */
async function lockBoard(client: PoolClient, boardId: string, userId: string): Promise<void> {
  const { rows } = await client.query(
    `SELECT boards.id FROM boards WHERE boards.id = $1 AND ${canAccessBoard('$2')} FOR UPDATE OF boards`,
    [boardId, userId]
  );
  if (!rows[0]) throw new HttpError(404, 'Board not found.');
}

/** A board row with the user's role and the owner's name, for the app. */
async function loadBoardFor(boardId: string, userId: string) {
  const { rows } = await pool.query(
    `SELECT boards.*, owners.name AS owner_name,
            CASE WHEN boards.owner_id = $2 THEN 'owner' ELSE 'member' END AS role
     FROM boards LEFT JOIN users owners ON owners.id = boards.owner_id
     WHERE boards.id = $1 AND ${canAccessBoard('$2')}`,
    [boardId, userId]
  );
  return rows[0];
}

// PUT /api/boards/:id { name, createdAt? } → create the board, or rename it if it exists
boardStateRouter.put('/:id', asyncHandler(async (req, res) => {
  const name = requireText(req.body.name, 'name');
  const userId = userIdOf(res);

  // A board shared with you: members may "save" it unchanged (the app does that when it
  // retries), but only the owner may rename it.
  const existing = await loadBoardFor(req.params['id'], userId);
  if (existing && existing.role === 'member') {
    if (existing.name !== name) throw new HttpError(403, "Only the board's owner can rename it.");
    res.json(toBoard(existing));
    return;
  }

  const { rows } = await pool.query(
    `INSERT INTO boards (id, name, background_color, created_at, updated_at, owner_id)
     VALUES ($1, $2, $3, COALESCE($4::timestamptz, now()), now(), $5)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, background_color = EXCLUDED.background_color, updated_at = now()
     WHERE boards.owner_id = EXCLUDED.owner_id
     RETURNING *`,
    [req.params['id'], name, orNull(req.body.backgroundColor), orNull(req.body.createdAt), userIdOf(res)]
  );
  // No row back means the id belongs to someone else's board.
  if (!rows[0]) throw new HttpError(404, 'Board not found.');
  res.json(toBoard({ ...rows[0], role: 'owner' }));
}));

// GET /api/boards/:id/state → everything the app needs to show one board
boardStateRouter.get('/:id/state', asyncHandler(async (req, res) => {
  const boardId = req.params['id'];
  const boardRow = await loadBoardFor(boardId, userIdOf(res));
  if (!boardRow) throw new HttpError(404, 'Board not found.');

  const [columns, cards, sprints, fields, automations, activity] = await Promise.all([
    pool.query('SELECT * FROM columns WHERE board_id = $1 ORDER BY position', [boardId]),
    pool.query('SELECT * FROM cards WHERE board_id = $1 ORDER BY position', [boardId]),
    pool.query('SELECT * FROM sprints WHERE board_id = $1 ORDER BY created_at', [boardId]),
    pool.query('SELECT * FROM custom_field_definitions WHERE board_id = $1 ORDER BY position', [boardId]),
    pool.query('SELECT * FROM automations WHERE board_id = $1 ORDER BY position', [boardId]),
    pool.query('SELECT * FROM activity WHERE board_id = $1 ORDER BY created_at DESC LIMIT 200', [boardId])
  ]);

  res.json({
    board: toBoard(boardRow),
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

// PUT /api/boards/:id/columns { columns: [...], removedColumnIds?: [...], removedCardIds?: [...] }
// Saves columns and cards. Only the columns and cards listed as removed are deleted: anything else
// missing from the list may have just been added by someone else on a shared board, so it stays.
boardStateRouter.put('/:id/columns', asyncHandler(async (req, res) => {
  const boardId = req.params['id'];
  const columns = asArray(req.body.columns, 'columns');

  await withTransaction(async client => {
    await lockBoard(client, boardId, userIdOf(res));

    const cards = columns.flatMap(column =>
      asArray(column.cards ?? [], 'cards').map((card, position) => ({ ...card, columnId: column.id, position }))
    );
    const removedColumnIds = (Array.isArray(req.body.removedColumnIds) ? req.body.removedColumnIds : []).map(String);
    const removedCardIds = (Array.isArray(req.body.removedCardIds) ? req.body.removedCardIds : []).map(String);

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

    // 2. Remove the cards the user deleted first, so their issue keys are free again.
    await client.query('DELETE FROM cards WHERE board_id = $1 AND id = ANY($2::text[])', [boardId, removedCardIds]);

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
          String(card.title ?? '').slice(0, MAX_CARD_TITLE), PRIORITIES.has(card.priority) ? card.priority : '', String(card.label ?? ''),
          orNull(card.description), orNull(card.assignee), orNull(card.startDate), orNull(card.dueDate),
          JSON.stringify(card.checklist ?? []), JSON.stringify(card.customFields ?? {}), card.position
        ]
      );
    }

    // 4. Remove the columns the user deleted (the database deletes any cards still in them).
    await client.query('DELETE FROM columns WHERE board_id = $1 AND id = ANY($2::text[])', [boardId, removedColumnIds]);
  });

  res.status(204).end();
}));

// PUT /api/boards/:id/sprints { sprints: [...], removedIds?: [...] }
boardStateRouter.put('/:id/sprints', asyncHandler(async (req, res) => {
  const boardId = req.params['id'];
  const sprints = asArray(req.body.sprints, 'sprints');

  await withTransaction(async client => {
    await lockBoard(client, boardId, userIdOf(res));
    await client.query('DELETE FROM sprints WHERE board_id = $1 AND id = ANY($2::text[])',
      [boardId, removedIds(req.body)]);

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

// PUT /api/boards/:id/fields { fields: [...], removedIds?: [...] }
boardStateRouter.put('/:id/fields', asyncHandler(async (req, res) => {
  const boardId = req.params['id'];
  const fields = asArray(req.body.fields, 'fields');

  await withTransaction(async client => {
    await lockBoard(client, boardId, userIdOf(res));
    await client.query('DELETE FROM custom_field_definitions WHERE board_id = $1 AND id = ANY($2::text[])',
      [boardId, removedIds(req.body)]);

    for (const [position, field] of fields.entries()) {
      await client.query(
        `INSERT INTO custom_field_definitions (id, board_id, name, type, options, position)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (board_id, id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type,
           options = EXCLUDED.options, position = EXCLUDED.position`,
        [field.id, boardId, requireText(field.name, 'field name'), field.type,
         field.options ? JSON.stringify(field.options) : null, position]
      );
    }
  });

  res.status(204).end();
}));

// PUT /api/boards/:id/automations { automations: [...], removedIds?: [...] }
boardStateRouter.put('/:id/automations', asyncHandler(async (req, res) => {
  const boardId = req.params['id'];
  const rules = asArray(req.body.automations, 'automations');

  await withTransaction(async client => {
    await lockBoard(client, boardId, userIdOf(res));
    await client.query('DELETE FROM automations WHERE board_id = $1 AND id = ANY($2::text[])',
      [boardId, removedIds(req.body)]);

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
    await lockBoard(client, boardId, userIdOf(res));
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
  await assertBoardOwner(req.params['id'], userIdOf(res), 'clear its history');
  await pool.query('DELETE FROM activity WHERE board_id = $1', [req.params['id']]);
  res.status(204).end();
}));
