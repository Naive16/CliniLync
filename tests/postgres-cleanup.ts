import { IDatabaseClient } from '../database/db.js';
import { MigrationEngine } from '../database/migrator.js';

/**
 * Clears application fixture rows while preserving every schema object and
 * migration record. This is intentionally opt-in and restricted to a
 * Supabase pooler test database.
 */
export async function cleanPostgresTestDatabase(db: IDatabaseClient): Promise<number> {
  if (process.env.CLINILYNC_ALLOW_TEST_CLEANUP !== 'true') {
    throw new Error('Refusing PostgreSQL fixture cleanup: set CLINILYNC_ALLOW_TEST_CLEANUP=true explicitly.');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing PostgreSQL fixture cleanup in production.');
  }

  const databaseUrl = new URL(process.env.DATABASE_URL || '');
  if (!databaseUrl.hostname.endsWith('.pooler.supabase.com')) {
    throw new Error('Refusing cleanup: DATABASE_URL is not a Supabase pooler test connection.');
  }

  const identity = await db.query<{ database: string; user: string; version: string }>(
    `SELECT current_database() AS database, current_user AS user,
            current_setting('server_version') AS version`
  );
  console.log(`[PostgreSQL Cleanup] Target ${identity.rows[0]?.database || 'unknown'} on PostgreSQL ${identity.rows[0]?.version || 'unknown'}.`);

  const migrations = await new MigrationEngine(db).getAppliedMigrations();
  if (migrations.length < 11 || !migrations.includes('010_durable_sessions.sql')) {
    throw new Error('Refusing cleanup: expected Clinilync migration history was not found.');
  }

  return db.transaction(async (tx) => {
    const tables = (await tx.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_type = 'BASE TABLE'
         AND table_name <> '_schema_migrations'
       ORDER BY table_name`
    )).rows.map(row => row.table_name);

    const tableSet = new Set(tables);
    const dependents = new Map(tables.map(table => [table, new Set<string>()]));
    const foreignKeys = await tx.query<{ child: string; parent: string }>(
      `SELECT conrelid::regclass::text AS child,
              confrelid::regclass::text AS parent
       FROM pg_constraint
       WHERE contype = 'f' AND connamespace = 'public'::regnamespace`
    );

    for (const edge of foreignKeys.rows) {
      const child = edge.child.replace(/^public\./, '');
      const parent = edge.parent.replace(/^public\./, '');
      if (child !== parent && tableSet.has(child) && tableSet.has(parent)) {
        dependents.get(parent)?.add(child);
      }
    }

    const deletionOrder: string[] = [];
    const remaining = new Set(tables);
    while (remaining.size > 0) {
      let progressed = false;
      for (const table of remaining) {
        if ([...(dependents.get(table) || [])].every(child => !remaining.has(child))) {
          deletionOrder.push(table);
          remaining.delete(table);
          progressed = true;
        }
      }
      if (!progressed) {
        throw new Error(`Unable to derive a safe foreign-key deletion order for: ${[...remaining].join(', ')}`);
      }
    }

    let deletedRows = 0;
    for (const table of deletionOrder) {
      const result = await tx.query(`DELETE FROM public."${table.replaceAll('"', '""')}"`);
      deletedRows += result.rowCount;
    }

    const remainingMigrations = await tx.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM _schema_migrations'
    );
    if (remainingMigrations.rows[0]?.count !== migrations.length) {
      throw new Error('Cleanup would have altered migration history; rolling back.');
    }

    return deletedRows;
  });
}
