import { Router } from 'express';
import { pool } from '../db';
import { asyncHandler, HttpError, requireText } from '../http';
import { userIdOf } from '../auth';
import { toTemplate } from '../mappers';

/** Templates the user saved with "Save as template". */
export const templatesRouter = Router();

// GET /api/templates
templatesRouter.get('/', asyncHandler(async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM templates WHERE owner_id = $1 ORDER BY created_at', [userIdOf(res)]);
  res.json(rows.map(toTemplate));
}));

// PUT /api/templates/:id { name, description, columns, fields } → create or replace
templatesRouter.put('/:id', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `INSERT INTO templates (id, name, description, columns, fields, owner_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
       columns = EXCLUDED.columns, fields = EXCLUDED.fields
     WHERE templates.owner_id = EXCLUDED.owner_id
     RETURNING *`,
    [req.params['id'], requireText(req.body.name, 'name'), String(req.body.description ?? ''),
     JSON.stringify(req.body.columns ?? []), JSON.stringify(req.body.fields ?? []), userIdOf(res)]
  );
  if (!rows[0]) throw new HttpError(404, 'Template not found.');
  res.json(toTemplate(rows[0]));
}));

// DELETE /api/templates/:id
templatesRouter.delete('/:id', asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM templates WHERE id = $1 AND owner_id = $2', [req.params['id'], userIdOf(res)]);
  res.status(204).end();
}));
