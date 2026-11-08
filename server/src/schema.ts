import { readFileSync } from 'fs';
import { join } from 'path';
import { pool } from './db';

/**
 * Creates or updates the tables from db/schema.sql.
 * Every statement there is safe to run again ("IF NOT EXISTS"), so the server runs this
 * each time it starts. That way the database always matches the code, also after an update.
 */
export async function applySchema(): Promise<void> {
  const schema = readFileSync(join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  // Hide PostgreSQL's "already exists, skipping" notices.
  const client = await pool.connect();
  try {
    await client.query('SET client_min_messages TO warning');
    await client.query(schema);
  } finally {
    client.release();
  }
}
