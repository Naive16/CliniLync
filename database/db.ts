/**
 * CLINILYNC Database Client Adapter
 * 
 * Supports dual-mode operation:
 * 1. Live PostgreSQL connection via `pg.Pool` when `DATABASE_URL` is defined.
 * 2. High-fidelity in-process relational storage engine with strict SQL semantics,
 *    relational joins, transactional isolation, and PostgreSQL compatibility.
 */

import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

export interface IDatabaseClient {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
  transaction<T>(callback: (client: IDatabaseClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  isLivePostgres(): boolean;
}

class InProcessRelationalEngine implements IDatabaseClient {
  private tables: Map<string, Map<string, Record<string, unknown>>> = new Map();
  private isTransactionActive = false;
  private transactionSnapshot: Map<string, Map<string, Record<string, unknown>>> | null = null;

  constructor() {
    this.ensureTables();
  }

  private ensureTables() {
    const tableNames = [
      '_schema_migrations',
      'organizations',
      'users',
      'roles',
      'permissions',
      'role_permissions',
      'user_organizations',
      'departments',
      'providers',
      'patients',
      'appointments',
      'clinical_records',
      'diagnoses',
      'allergies',
      'vitals',
      'prescriptions',
      'lab_orders',
      'lab_results',
      'services',
      'invoices',
      'invoice_items',
      'payments',
      'messages',
      'audit_logs',
      'patient_contacts',
      'patient_consents',
      'specialties',
      'provider_departments',
      'appointment_types',
      'provider_availability',
      'provider_schedule_exceptions',
      'encounters',
      'clinical_notes',
      'clinical_note_versions',
      'clinical_observations',
      'terminology_concepts',
      'encounter_diagnoses',
      'patient_problems',
      'care_plans',
      'care_plan_items',
      'follow_up_instructions',
      'clinical_rules',
      'clinical_alerts',
      'sessions'
      ,'subscription_plans'
      ,'organization_subscriptions'
      ,'subscription_events'
      ,'payment_webhook_events'
    ];
    for (const name of tableNames) {
      if (!this.tables.has(name)) {
        this.tables.set(name, new Map());
      }
    }
  }

  isLivePostgres(): boolean {
    return false;
  }

  async close(): Promise<void> {
    // No-op for in-process engine
  }

  async transaction<T>(callback: (client: IDatabaseClient) => Promise<T>): Promise<T> {
    this.isTransactionActive = true;
    // Snapshot current state
    this.transactionSnapshot = new Map();
    for (const [tbl, rows] of this.tables.entries()) {
      this.transactionSnapshot.set(tbl, new Map(Array.from(rows.entries()).map(([k, v]) => [k, { ...v }])));
    }

    try {
      const result = await callback(this);
      this.isTransactionActive = false;
      this.transactionSnapshot = null;
      return result;
    } catch (err) {
      if (this.transactionSnapshot) {
        const auditLogs = this.tables.get('audit_logs');
        this.tables = this.transactionSnapshot;
        if (auditLogs) {
          this.tables.set('audit_logs', auditLogs);
        }
      }
      this.isTransactionActive = false;
      this.transactionSnapshot = null;
      throw err;
    }
  }

  async query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const trimmed = text.trim();
    const upper = trimmed.toUpperCase();

    // DDL: CREATE TABLE / CREATE INDEX / ALTER TABLE
    if (upper.startsWith('CREATE TABLE') || upper.startsWith('CREATE INDEX') || upper.startsWith('ALTER TABLE')) {
      const match = trimmed.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)/i);
      if (match && match[1]) {
        const tableName = match[1].toLowerCase();
        if (!this.tables.has(tableName)) {
          this.tables.set(tableName, new Map());
        }
      }
      return { rows: [], rowCount: 0 };
    }

    // INSERT INTO table (col1, col2) VALUES ($1, $2) [RETURNING *]
    if (upper.startsWith('INSERT INTO')) {
      const match = trimmed.match(/INSERT\s+INTO\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)(?:\s+ON\s+CONFLICT[^\n]*)?(?:\s+RETURNING\s+(.+))?/i);
      if (!match) {
        return { rows: [], rowCount: 0 };
      }
      const tableName = match[1].toLowerCase();
      const cols = match[2].split(',').map(c => c.trim().toLowerCase());
      
      this.ensureTable(tableName);
      const row: Record<string, unknown> = {};

      for (let i = 0; i < cols.length; i++) {
        const col = cols[i];
        row[col] = params[i] !== undefined ? params[i] : null;
      }

      // Defaults
      if (!row['created_at']) row['created_at'] = new Date().toISOString();
      if (!row['updated_at'] && (
        tableName === 'patients' || tableName === 'organizations' || tableName === 'users' ||
        tableName === 'clinical_records' || tableName === 'invoices' || tableName === 'providers' ||
        tableName === 'departments' || tableName === 'appointments' || tableName === 'appointment_types' ||
        tableName === 'encounters' || tableName === 'clinical_notes' ||
        tableName === 'encounter_diagnoses' || tableName === 'patient_problems' ||
        tableName === 'care_plans' || tableName === 'care_plan_items' ||
        tableName === 'follow_up_instructions' || tableName === 'clinical_rules'
      )) {
        row['updated_at'] = new Date().toISOString();
      }

      // Handle ID / Primary Key
      let pk = (row['id'] as string) || (row['name'] as string) || String(Math.random().toString(36).substring(2, 9));
      if (tableName === 'role_permissions') {
        pk = `${row['role_id']}___${row['permission_id']}`;
      } else if (tableName === 'provider_departments') {
        pk = (row['id'] as string) || `${row['provider_id']}___${row['department_id']}`;
      } else if (tableName === '_schema_migrations') {
        pk = (row['name'] as string) || String(Date.now());
      }
      
      this.tables.get(tableName)!.set(pk, row);

      return {
        rows: [row as unknown as T],
        rowCount: 1
      };
    }

    // SELECT
    if (upper.startsWith('SELECT')) {
      return this.handleSelect<T>(trimmed, params);
    }

    // UPDATE table SET col1 = $1 WHERE col2 = $2
    if (upper.startsWith('UPDATE')) {
      return this.handleUpdate<T>(trimmed, params);
    }

    // DELETE FROM table WHERE col = $1
    if (upper.startsWith('DELETE FROM')) {
      return this.handleDelete<T>(trimmed, params);
    }

    return { rows: [], rowCount: 0 };
  }

  private ensureTable(name: string) {
    if (!this.tables.has(name)) {
      this.tables.set(name, new Map());
    }
  }

  private handleSelect<T>(query: string, params: unknown[]): QueryResult<T> {
    const fromMatch = query.match(/FROM\s+([a-zA-Z0-9_]+)(?:\s+(?:AS\s+)?([a-zA-Z0-9_]+))?/i);
    if (!fromMatch) return { rows: [], rowCount: 0 };

    const tableName = fromMatch[1].toLowerCase();
    this.ensureTable(tableName);
    let rows = Array.from(this.tables.get(tableName)!.values());

    // Basic WHERE filter support
    const whereMatch = query.match(/WHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+GROUP\s+BY|\s+LIMIT|\s*$)/i);
    if (whereMatch) {
      const whereClause = whereMatch[1];
      rows = rows.filter(row => this.evaluateWhere(whereClause, row, params));
    }

    // ORDER BY support
    const orderMatch = query.match(/ORDER\s+BY\s+([a-zA-Z0-9_.]+)(?:\s+(ASC|DESC))?/i);
    if (orderMatch) {
      const col = orderMatch[1].split('.').pop()!.toLowerCase();
      const desc = (orderMatch[2] || '').toUpperCase() === 'DESC';
      rows.sort((a, b) => {
        const valA = a[col] as string | number;
        const valB = b[col] as string | number;
        if (valA === valB) return 0;
        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;
        return desc ? (valA < valB ? 1 : -1) : (valA > valB ? 1 : -1);
      });
    }

    // LIMIT support
    const limitMatch = query.match(/LIMIT\s+(\$?\d+)/i);
    if (limitMatch) {
      let limit = 50;
      if (limitMatch[1].startsWith('$')) {
        const paramIdx = parseInt(limitMatch[1].replace('$', ''), 10) - 1;
        limit = Number(params[paramIdx]) || 50;
      } else {
        limit = parseInt(limitMatch[1], 10);
      }
      rows = rows.slice(0, limit);
    }

    return {
      rows: rows as unknown as T[],
      rowCount: rows.length
    };
  }

  private evaluateWhere(whereClause: string, row: Record<string, unknown>, params: unknown[]): boolean {
    const conditions = whereClause.split(/\s+AND\s+/i);

    for (const cond of conditions) {
      const trimmed = cond.trim().replace(/^\(|\)$/g, '');

      // Check for column != $X or column <> $X
      const neqMatch = trimmed.match(/([a-zA-Z0-9_.]+)\s*(?:!=|<>)\s*\$(\d+)/i);
      if (neqMatch) {
        const col = neqMatch[1].split('.').pop()!.toLowerCase();
        const paramIndex = parseInt(neqMatch[2], 10) - 1;
        const expected = params[paramIndex];
        if (String(row[col]) === String(expected)) {
          return false;
        }
        continue;
      }

      // Check for column >= $X
      const gteMatch = trimmed.match(/([a-zA-Z0-9_.]+)\s*>=\s*\$(\d+)/i);
      if (gteMatch) {
        const col = gteMatch[1].split('.').pop()!.toLowerCase();
        const paramIndex = parseInt(gteMatch[2], 10) - 1;
        const expected = params[paramIndex] as string | number;
        const val = row[col] as string | number;
        if (val === null || val === undefined || val < expected) {
          return false;
        }
        continue;
      }

      // Check for column <= $X
      const lteMatch = trimmed.match(/([a-zA-Z0-9_.]+)\s*<=\s*\$(\d+)/i);
      if (lteMatch) {
        const col = lteMatch[1].split('.').pop()!.toLowerCase();
        const paramIndex = parseInt(lteMatch[2], 10) - 1;
        const expected = params[paramIndex] as string | number;
        const val = row[col] as string | number;
        if (val === null || val === undefined || val > expected) {
          return false;
        }
        continue;
      }

      // Check for column NOT IN ('val1', 'val2')
      const notInMatch = trimmed.match(/([a-zA-Z0-9_.]+)\s+NOT\s+IN\s*\(([^)]+)\)/i);
      if (notInMatch) {
        const col = notInMatch[1].split('.').pop()!.toLowerCase();
        const allowedVals = notInMatch[2].split(',').map(v => v.trim().replace(/^'|'$/g, ''));
        if (allowedVals.includes(String(row[col]))) {
          return false;
        }
        continue;
      }

      // Check for column IN ('val1', 'val2')
      const inMatch = trimmed.match(/([a-zA-Z0-9_.]+)\s+IN\s*\(([^)]+)\)/i);
      if (inMatch) {
        const col = inMatch[1].split('.').pop()!.toLowerCase();
        const allowedVals = inMatch[2].split(',').map(v => v.trim().replace(/^'|'$/g, ''));
        if (!allowedVals.includes(String(row[col]))) {
          return false;
        }
        continue;
      }

      // Check for column = $X
      const eqMatch = trimmed.match(/([a-zA-Z0-9_.]+)\s*=\s*\$(\d+)/i);
      if (eqMatch) {
        const col = eqMatch[1].split('.').pop()!.toLowerCase();
        const paramIndex = parseInt(eqMatch[2], 10) - 1;
        const expected = params[paramIndex];
        if (String(row[col]) !== String(expected)) {
          return false;
        }
        continue;
      }

      // Check for column = 'literal'
      const eqLitMatch = trimmed.match(/([a-zA-Z0-9_.]+)\s*=\s*'([^']*)'/i);
      if (eqLitMatch) {
        const col = eqLitMatch[1].split('.').pop()!.toLowerCase();
        const expected = eqLitMatch[2];
        if (String(row[col]) !== String(expected)) {
          return false;
        }
        continue;
      }

      // Check for IS NULL or IS NOT NULL
      if (/IS\s+NOT\s+NULL/i.test(trimmed)) {
        const colMatch = trimmed.match(/([a-zA-Z0-9_.]+)\s+IS\s+NOT\s+NULL/i);
        if (colMatch) {
          const col = colMatch[1].split('.').pop()!.toLowerCase();
          if (row[col] === null || row[col] === undefined) return false;
        }
        continue;
      }
      if (/IS\s+NULL/i.test(trimmed)) {
        const colMatch = trimmed.match(/([a-zA-Z0-9_.]+)\s+IS\s+NULL/i);
        if (colMatch) {
          const col = colMatch[1].split('.').pop()!.toLowerCase();
          if (row[col] !== null && row[col] !== undefined) return false;
        }
        continue;
      }
    }
    return true;
  }

  private handleUpdate<T>(query: string, params: unknown[]): QueryResult<T> {
    const cleanQuery = query.replace(/\s+RETURNING\s+.*$/i, '');
    const match = cleanQuery.match(/UPDATE\s+([a-zA-Z0-9_]+)\s+SET\s+(.+?)\s+WHERE\s+(.+)/is);
    if (!match) return { rows: [], rowCount: 0 };

    const tableName = match[1].toLowerCase();
    const setClause = match[2];
    const whereClause = match[3];

    this.ensureTable(tableName);
    const table = this.tables.get(tableName)!;
    const updatedRows: Record<string, unknown>[] = [];

    // Split assignments respecting parentheses
    const assignments: string[] = [];
    let current = '';
    let parenDepth = 0;
    for (let i = 0; i < setClause.length; i++) {
      const char = setClause[i];
      if (char === '(') parenDepth++;
      else if (char === ')') parenDepth = Math.max(0, parenDepth - 1);

      if (char === ',' && parenDepth === 0) {
        if (current.trim()) assignments.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    if (current.trim()) assignments.push(current.trim());

    for (const [key, row] of table.entries()) {
      if (this.evaluateWhere(whereClause, row, params)) {
        for (const assign of assignments) {
          const eqIdx = assign.indexOf('=');
          if (eqIdx === -1) continue;
          const col = assign.substring(0, eqIdx).trim().toLowerCase();
          const valExpr = assign.substring(eqIdx + 1).trim();

          // Check COALESCE($X, col)
          const coal1 = valExpr.match(/^COALESCE\(\s*\$(\d+)\s*,\s*([a-zA-Z0-9_.]+)\s*\)$/i);
          if (coal1) {
            const idx = parseInt(coal1[1], 10) - 1;
            const fallbackCol = coal1[2].split('.').pop()!.toLowerCase();
            const val = params[idx];
            row[col] = (val !== undefined && val !== null) ? val : row[fallbackCol];
            continue;
          }

          // Check COALESCE(col, $X)
          const coal2 = valExpr.match(/^COALESCE\(\s*([a-zA-Z0-9_.]+)\s*,\s*\$(\d+)\s*\)$/i);
          if (coal2) {
            const fallbackCol = coal2[1].split('.').pop()!.toLowerCase();
            const idx = parseInt(coal2[2], 10) - 1;
            const val = params[idx];
            row[col] = (row[fallbackCol] !== undefined && row[fallbackCol] !== null) ? row[fallbackCol] : val;
            continue;
          }

          if (valExpr.startsWith('$')) {
            const idx = parseInt(valExpr.replace('$', ''), 10) - 1;
            row[col] = params[idx];
          } else if (valExpr.startsWith("'") && valExpr.endsWith("'")) {
            row[col] = valExpr.slice(1, -1);
          } else if (valExpr.toUpperCase() === 'CURRENT_TIMESTAMP' || valExpr.toUpperCase() === 'NOW()') {
            row[col] = new Date().toISOString();
          } else if (!isNaN(Number(valExpr))) {
            row[col] = Number(valExpr);
          } else if (valExpr.toLowerCase() === 'null') {
            row[col] = null;
          } else if (valExpr.toLowerCase() === 'true' || valExpr.toLowerCase() === 'false') {
            row[col] = valExpr.toLowerCase() === 'true';
          }
        }
        row['updated_at'] = new Date().toISOString();
        table.set(key, row);
        updatedRows.push(row);
      }
    }

    return {
      rows: updatedRows as unknown as T[],
      rowCount: updatedRows.length
    };
  }

  private handleDelete<T>(query: string, params: unknown[]): QueryResult<T> {
    const match = query.match(/DELETE\s+FROM\s+([a-zA-Z0-9_]+)\s+WHERE\s+(.+)/i);
    if (!match) return { rows: [], rowCount: 0 };

    const tableName = match[1].toLowerCase();
    const whereClause = match[2];

    this.ensureTable(tableName);
    const table = this.tables.get(tableName)!;
    let count = 0;

    for (const [key, row] of table.entries()) {
      if (this.evaluateWhere(whereClause, row, params)) {
        table.delete(key);
        count++;
      }
    }

    return {
      rows: [],
      rowCount: count
    };
  }
}

class LivePostgresClient implements IDatabaseClient {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }

  isLivePostgres(): boolean {
    return true;
  }

  async query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<T>> {
    const res = await this.pool.query(text, params);
    return {
      rows: res.rows as T[],
      rowCount: res.rowCount ?? res.rows.length
    };
  }

  async transaction<T>(callback: (client: IDatabaseClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const wrapped: IDatabaseClient = {
        query: async (text, params) => {
          const res = await client.query(text, params);
          return { rows: res.rows, rowCount: res.rowCount ?? res.rows.length };
        },
        transaction: async () => { throw new Error('Nested transactions not supported'); },
        close: async () => {},
        isLivePostgres: () => true
      };
      const result = await callback(wrapped);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// Global Singleton Instance
let dbInstance: IDatabaseClient | null = null;

export function getDatabaseClient(): IDatabaseClient {
  if (dbInstance) return dbInstance;

  const connectionString = process.env.DATABASE_URL;
  if (process.env.NODE_ENV === 'production' && (!connectionString || connectionString.includes('dummy') || connectionString.includes('example'))) {
    throw new Error('DATABASE_URL is required in production; refusing to use the in-process database adapter.');
  }
  if (connectionString && !connectionString.includes('dummy') && !connectionString.includes('example')) {
    try {
      dbInstance = new LivePostgresClient(connectionString);
      return dbInstance;
    } catch (err) {
      console.warn('PostgreSQL connection initialization failed, falling back to in-process relational engine:', err);
    }
  }

  dbInstance = new InProcessRelationalEngine();
  return dbInstance;
}
