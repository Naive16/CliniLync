import { IDatabaseClient, QueryResult, getDatabaseClient, runWithRequestDatabaseClient } from '../database/db.js';

function fakeClient(label: string): IDatabaseClient {
  return {
    async query<T = Record<string, unknown>>(): Promise<QueryResult<T>> {
      return { rows: [{ label } as T], rowCount: 1 };
    },
    async transaction<T>(callback: (client: IDatabaseClient) => Promise<T>): Promise<T> {
      return callback(this);
    },
    async close(): Promise<void> {},
    isLivePostgres: () => true
  };
}

export async function runCloudflareDatabaseContextTests(): Promise<{ name: string; passed: boolean; error?: string }[]> {
  const name = 'Cloudflare DB context - concurrent requests remain isolated';
  try {
    const [first, second] = await Promise.all([
      runWithRequestDatabaseClient(fakeClient('request-A'), async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        const result = await getDatabaseClient().query<{ label: string }>('SELECT 1');
        return result.rows[0]?.label;
      }),
      runWithRequestDatabaseClient(fakeClient('request-B'), async () => {
        await new Promise(resolve => setTimeout(resolve, 1));
        const result = await getDatabaseClient().query<{ label: string }>('SELECT 1');
        return result.rows[0]?.label;
      })
    ]);

    if (first !== 'request-A' || second !== 'request-B') {
      throw new Error(`Database context crossed requests: A=${first}, B=${second}`);
    }
    return [{ name, passed: true }];
  } catch (error) {
    return [{ name, passed: false, error: (error as Error).message }];
  }
}
