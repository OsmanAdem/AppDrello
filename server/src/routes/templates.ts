import { Router } from 'express';
import { pool } from '../db';
import { asyncHandler, requireText } from '../http';
import { toTemplate } from '../mappers';

/** Templates the user saved with "Save as template". */
export const templatesRouter = Router();

// GET /api/templates
templatesRouter.get('/', asyncHandler(async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM templates ORDER BY created_at');
  res.json(rows.map(toTemplate));
}));

// PUT /api/templates/:id { name, description, columns, fields } → create or replace
templatesRouter.put('/:id', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `INSERT INTO templates (id, name, description, columns, fields)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
       columns = EXCLUDED.columns, fields = EXCLUDED.fields
     RETURNING *`,
    [req.params['id'], requireText(req.body.name, 'name'), String(req.body.description ?? ''),
     JSON.stringify(req.body.columns ?? []), JSON.stringify(req.body.fields ?? [])]
  );
  res.json(toTemplate(rows[0]));
}));

// DELETE /api/templates/:id
templatesRouter.delete('/:id', asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM templates WHERE id = $1', [req.params['id']]);
  res.status(204).end();
}));
