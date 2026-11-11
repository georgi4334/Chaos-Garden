import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/**
 * Applies pending migrations, then exits. Uses drizzle-orm's runtime migrator,
 * so it works in the production image where the drizzle-kit dev tool is not
 * installed. Run before starting the service: `node dist/database/migrate.js`.
 */
const migrationsFolder =
  process.env.MIGRATIONS_DIR ?? fileURLToPath(new URL('../../src/database/migrations', import.meta.url));

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await migrate(drizzle(pool), { migrationsFolder });
  console.log(JSON.stringify({ level: 'log', msg: 'Migrations applied', migrationsFolder }));
} catch (err) {
  console.error(JSON.stringify({ level: 'error', msg: 'Migrations failed', error: (err as Error).message }));
  process.exitCode = 1;
} finally {
  await pool.end();
}
