import { readFileSync } from 'fs';
import { join } from 'path';
import { pool } from './db';

/** Creates the tables from db/schema.sql. Safe to run more than once. */
async function setup(): Promise<void> {
  const schema = readFileSync(join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('Database tables are ready.');
  await pool.end();
}

setup().catch(async error => {
  console.error('Could not set up the database:', error.message);
  await pool.end();
  process.exit(1);
});
