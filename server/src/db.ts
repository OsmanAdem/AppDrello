import 'dotenv/config';
import { Pool, PoolClient, types } from 'pg';

// Return DATE columns as plain 'YYYY-MM-DD' strings (what the Angular app uses),
// instead of JavaScript Date objects that can shift with time zones.
types.setTypeParser(1082, value => value);

if (!process.env['DATABASE_URL']) {
  throw new Error('DATABASE_URL is missing. Copy .env.example to .env and fill it in.');
}

/** A pool keeps a few database connections open and reuses them between requests. */
export const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

/**
 * Runs several queries as one transaction: either all of them succeed,
 * or none of them are saved (ROLLBACK).
 */
export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
