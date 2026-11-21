/**
 * CLINILYNC Node server entry point.
 *
 * Owns process startup, migrations/seed policy, development tooling,
 * static-file hosting, listening, and graceful shutdown. Shared API route
 * composition lives in backend/app.ts for reuse by other runtimes.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { seedDatabase } from './database/seed.js';
import { config, validateRuntimeConfig } from './backend/config/index.js';
import { getDatabaseClient } from './database/db.js';
import { MigrationEngine } from './database/migrator.js';
import { createApp } from './backend/app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = config.port;
const HOST = process.env.HOST || '0.0.0.0';
const isHostedRuntime = config.isProduction || config.env === 'staging';

async function bootstrap() {
  validateRuntimeConfig();

  // Schema changes are operational commands, not an implicit production boot action.
  // Development/test keep the existing fixture workflow; hosted environments require
  // migrations to have been applied separately and never auto-seed synthetic data.
  if (config.isDevelopment || config.isTest || process.env.ALLOW_DEMO_SEED === 'true') {
    await seedDatabase();
  } else {
    const applied = await new MigrationEngine().getAppliedMigrations();
    if (applied.length === 0) throw new Error('No database migrations are applied. Run `bun run db:migrate` before starting the hosted API.');
    console.log(`[CLINILYNC] Verified ${applied.length} applied database migrations; startup will not modify schema.`);
  }

  const app = createApp({ trustProxy: process.env.TRUST_PROXY === 'true' });

  // Static assets and Vite development middleware are Node-host responsibilities.
  if (!isHostedRuntime) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  const httpServer = app.listen(PORT, HOST, () => {
    console.log(`[CLINILYNC] Core platform server online at http://${HOST}:${PORT}`);
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[CLINILYNC] Received ${signal}; shutting down gracefully.`);
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await getDatabaseClient().close();
  };
  process.once('SIGTERM', () => { void shutdown('SIGTERM').finally(() => process.exit(0)); });
  process.once('SIGINT', () => { void shutdown('SIGINT').finally(() => process.exit(0)); });
}

bootstrap().catch(err => {
  console.error('[CLINILYNC BOOTSTRAP FAILURE]', err);
  process.exit(1);
});
