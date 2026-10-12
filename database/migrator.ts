/**
 * CLINILYNC Migration Engine
 * 
 * Executes forward DDL migrations deterministically, ensuring idempotent database evolution.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getDatabaseClient, IDatabaseClient } from './db.js';

export interface MigrationRecord {
  id: number;
  name: string;
  applied_at: string;
}

export class MigrationEngine {
  private db: IDatabaseClient;
  private migrationsDir: string;

  constructor(db?: IDatabaseClient, migrationsDir?: string) {
    this.db = db || getDatabaseClient();
    this.migrationsDir = migrationsDir || path.resolve(process.cwd(), 'database/migrations');
  }

  async initMigrationTable(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  async getAppliedMigrations(): Promise<string[]> {
    await this.initMigrationTable();
    const result = await this.db.query<{ name: string }>(`
      SELECT name FROM _schema_migrations ORDER BY id ASC
    `);
    return result.rows.map(r => r.name);
  }

  async runPendingMigrations(): Promise<string[]> {
    await this.initMigrationTable();
    const applied = await this.getAppliedMigrations();

    if (!fs.existsSync(this.migrationsDir)) {
      console.warn(`Migrations directory does not exist: ${this.migrationsDir}`);
      return [];
    }

    const files = fs.readdirSync(this.migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    const executed: string[] = [];

    for (const file of files) {
      if (applied.includes(file)) {
        continue;
      }

      const filePath = path.join(this.migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      console.log(`[CLINILYNC Migrations] Applying migration: ${file}...`);

      // Execute migration statements
      await this.db.transaction(async (tx) => {
        // Split DDL statements by semicolon (excluding strings/comments if needed)
        const statements = sql
          .split(/;\s*$/m)
          .map(s => s.trim())
          .filter(s => s.length > 0);

        for (const stmt of statements) {
          await tx.query(stmt);
        }

        await tx.query(
          `INSERT INTO _schema_migrations (name, applied_at) VALUES ($1, $2)`,
          [file, new Date().toISOString()]
        );
      });

      console.log(`[CLINILYNC Migrations] Successfully applied: ${file}`);
      executed.push(file);
    }

    return executed;
  }
}
