// Applies prisma/sql/rls.sql to the database in DATABASE_URL.
// Idempotent — safe to run after every migration.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import 'dotenv/config';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, '..', 'prisma', 'sql', 'rls.sql');
const sql = readFileSync(sqlPath, 'utf8');

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set (put it in packages/db/.env).');
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
try {
  await client.query(sql);
  console.log('✔ RLS policies applied.');
} catch (err) {
  console.error('x Failed to apply RLS policies:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
