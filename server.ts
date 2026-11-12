/**
 * CLINILYNC Unified Server Entry Point
 * 
 * Runs Express backend with mounted Vite middlewares on port 3000.
 * Automatically runs database migrations and seeds initial multi-tenant data.
 */

import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { seedDatabase } from './database/seed.js';
import { requestIdMiddleware } from './backend/middleware/request-id.js';
import { apiErrorHandler } from './backend/middleware/error.js';
import { v1ApiRouter } from './backend/api/v1/index.js';
import { authRouter } from './backend/api/auth.router.js';
import { patientsRouter } from './backend/api/patients.router.js';
import { appointmentsRouter } from './backend/api/appointments.router.js';
import { clinicalRouter } from './backend/api/clinical.router.js';
import { billingRouter } from './backend/api/billing.router.js';
import { portalRouter } from './backend/api/portal.router.js';
import { adminRouter } from './backend/api/admin.router.js';
import { orgsRouter } from './backend/api/orgs.router.js';
import { config, validateRuntimeConfig } from './backend/config/index.js';
import { getDatabaseClient } from './database/db.js';
import { MigrationEngine } from './database/migrator.js';
import { requireStaffAccount } from './backend/middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = config.port;
const HOST = process.env.HOST || '0.0.0.0';
const isProd = config.isProduction;

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

  const app = express();
  app.set('trust proxy', process.env.TRUST_PROXY === 'true');

  // Basic middleware
  app.use(requestIdMiddleware);
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Security headers middleware
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'healthy',
      platform: 'CLINILYNC Healthcare Operating System',
      version: '1.0.0-phase5',
      timestamp: new Date().toISOString()
    });
  });

  // Master Version 1 API Prefix (/api/v1/*)
  app.use('/api/v1', v1ApiRouter);

  // Backwards-compatible legacy route aliases
  app.use('/api/auth', authRouter);
  app.use('/api/patients', requireStaffAccount, patientsRouter);
  app.use('/api/appointments', requireStaffAccount, appointmentsRouter);
  app.use('/api/clinical', requireStaffAccount, clinicalRouter);
  app.use('/api/billing', requireStaffAccount, billingRouter);
  app.use('/api/portal', portalRouter);
  app.use('/api/admin', requireStaffAccount, adminRouter);
  app.use('/api/organizations', requireStaffAccount, orgsRouter);

  // Centralized Error Handler for API
  app.use('/api', apiErrorHandler);

  // Frontend Serving
  if (!isProd) {
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
