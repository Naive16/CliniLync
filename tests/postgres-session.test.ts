import crypto from 'node:crypto';
import pg from 'pg';
import { getDatabaseClient } from '../database/db.js';
import { sessionManager } from '../backend/security/session.js';

const hashToken = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');

export async function runPostgresDurableSessionChecks(): Promise<number> {
  const db = getDatabaseClient();
  const tokens: string[] = [];
  const cleanup = async (): Promise<void> => {
    if (tokens.length > 0) {
      await db.query('DELETE FROM sessions WHERE token_hash = ANY($1::text[])', [tokens.map(hashToken)]);
    }
  };

  try {
    const token = await sessionManager.createSessionAsync('usr_sarah', 'org_st_jude');
    tokens.push(token);
    const persisted = await db.query<{ user_id: string; active_organization_id: string }>(
      'SELECT user_id, active_organization_id FROM sessions WHERE token_hash = $1',
      [hashToken(token)]
    );
    if (persisted.rows[0]?.user_id !== 'usr_sarah') {
      throw new Error('Durable session was not persisted in PostgreSQL.');
    }

    const independentPool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
    try {
      const reconnected = await independentPool.query<{ user_id: string }>(
        'SELECT user_id FROM sessions WHERE token_hash = $1',
        [hashToken(token)]
      );
      if (reconnected.rows[0]?.user_id !== 'usr_sarah') {
        throw new Error('Durable session was not visible through an independent PostgreSQL connection.');
      }
    } finally {
      await independentPool.end();
    }

    const loaded = await sessionManager.getSessionAsync(token);
    if (!loaded || loaded.userId !== 'usr_sarah') throw new Error('Persisted session could not be retrieved.');
    if (!(await sessionManager.updateSessionOrganizationAsync(token, 'org_metro_health'))) {
      throw new Error('Session organization update failed.');
    }
    const switched = await sessionManager.getSessionAsync(token);
    if (!switched || switched.activeOrganizationId !== 'org_metro_health') {
      throw new Error('Session organization update was not persisted.');
    }

    const concurrent = await Promise.all([
      sessionManager.getSessionAsync(token),
      sessionManager.getSessionAsync(token),
      sessionManager.getSessionAsync(token)
    ]);
    if (concurrent.some(session => !session)) throw new Error('Concurrent session reads were not consistent.');

    const expiredToken = await sessionManager.createSessionAsync('usr_sarah', 'org_st_jude');
    tokens.push(expiredToken);
    await db.query('UPDATE sessions SET expires_at = CURRENT_TIMESTAMP - INTERVAL \'1 second\' WHERE token_hash = $1', [hashToken(expiredToken)]);
    if (await sessionManager.getSessionAsync(expiredToken)) throw new Error('Expired session was accepted.');

    const revokedToken = await sessionManager.createSessionAsync('usr_sarah', 'org_st_jude');
    tokens.push(revokedToken);
    await sessionManager.invalidateSessionAsync(revokedToken);
    if (await sessionManager.getSessionAsync(revokedToken)) throw new Error('Revoked session was accepted.');

    return 7;
  } finally {
    await cleanup();
  }
}
