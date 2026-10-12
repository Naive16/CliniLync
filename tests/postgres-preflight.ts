/**
 * PostgreSQL integration-test entrypoint.
 *
 * This intentionally refuses the in-process adapter. Use only with a
 * disposable database specified by DATABASE_URL.
 */
import { getDatabaseClient } from '../database/db.js';
import { MigrationEngine } from '../database/migrator.js';
import { seedDatabase } from '../database/seed.js';
import { cleanPostgresTestDatabase } from './postgres-cleanup.js';
import { runPostgresDurableSessionChecks } from './postgres-session.test.js';

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for PostgreSQL integration tests. Use an isolated disposable test database.');
  }

  const db = getDatabaseClient();
  if (!db.isLivePostgres()) {
    throw new Error('PostgreSQL integration tests refused: the configured database client is not live PostgreSQL.');
  }

  const version = await db.query<{ version: string }>('SELECT current_setting(\'server_version\') AS version');
  console.log(`[PostgreSQL Integration] Connected to PostgreSQL ${version.rows[0]?.version || 'unknown'}`);

  const migrationEngine = new MigrationEngine(db);
  const applied = await migrationEngine.runPendingMigrations();
  console.log(`[PostgreSQL Integration] Applied ${applied.length} pending migration(s).`);

  if (process.argv.includes('--clean')) {
    const deletedRows = await cleanPostgresTestDatabase(db);
    console.log(`[PostgreSQL Cleanup] Deleted ${deletedRows} application fixture row(s); migration history preserved.`);
  }

  await seedDatabase();
  const durableSessionChecks = await runPostgresDurableSessionChecks();
  console.log(`[PostgreSQL Integration] Durable-session checks passed: ${durableSessionChecks}.`);

  // The existing comprehensive suite now runs against the same live client.
  await import('./run-tests.js');
}

main().catch((error) => {
  console.error(`[PostgreSQL Integration] BLOCKED: ${(error as Error).message}`);
  process.exitCode = 1;
});
