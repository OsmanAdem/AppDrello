import { pool } from './db';
import { applySchema } from './schema';

/** Creates the tables from db/schema.sql. Safe to run more than once. (The server also does this when it starts.) */
async function setup(): Promise<void> {
  await applySchema();
  console.log('Database tables are ready.');
  await pool.end();
}

setup().catch(async error => {
  console.error('Could not set up the database:', error.message);
  await pool.end();
  process.exit(1);
});
