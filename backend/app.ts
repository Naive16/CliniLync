/**
 * CLINILYNC shared Express application.
 *
 * Route composition is deliberately separated from process startup so the
 * Node server and a future Cloudflare HTTP adapter can mount the same API.
 * This module must remain free of listen(), migrations, demo seeding, and
 * filesystem/static-file startup behavior.
 */
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import { requestIdMiddleware } from './middleware/request-id.js';
import { apiErrorHandler } from './middleware/error.js';
import { v1ApiRouter } from './api/v1/index.js';
import { authRouter } from './api/auth.router.js';
import { patientsRouter } from './api/patients.router.js';
import { appointmentsRouter } from './api/appointments.router.js';
import { clinicalRouter } from './api/clinical.router.js';
import { billingRouter } from './api/billing.router.js';
import { portalRouter } from './api/portal.router.js';
import { adminRouter } from './api/admin.router.js';
import { orgsRouter } from './api/orgs.router.js';
import { requireStaffAccount } from './middleware/auth.js';
import { hyperdriveDatabaseMiddleware } from '../database/db.js';

export interface CreateAppOptions {
  trustProxy?: boolean;
  databaseConnectionString?: () => string;
  configureRuntime?: () => void;
  allowedOrigins?: () => string[];
}

/**
 * Build the API application without starting a listener or performing
 * infrastructure side effects. Runtime-specific static asset handling is
 * intentionally left to the Node/Workers entry point.
 */
export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();
  app.set('trust proxy', options.trustProxy ?? false);

  app.use(requestIdMiddleware);
  app.use((_req, _res, next) => {
    try { options.configureRuntime?.(); next(); } catch (error) { next(error); }
  });
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    next();
  });

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowed = options.allowedOrigins?.() || [];
    if (origin && allowed.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Organization-Id, X-Request-Id');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    next();
  });

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'healthy', service: 'CLINILYNC API', timestamp: new Date().toISOString() });
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'healthy',
      platform: 'CLINILYNC Healthcare Operating System',
      version: '1.0.0-phase5',
      timestamp: new Date().toISOString()
    });
  });

  if (options.databaseConnectionString) {
    app.use('/api', hyperdriveDatabaseMiddleware(options.databaseConnectionString));
  }

  app.use('/api/v1', v1ApiRouter);

  // Backwards-compatible legacy route aliases.
  app.use('/api/auth', authRouter);
  app.use('/api/patients', requireStaffAccount, patientsRouter);
  app.use('/api/appointments', requireStaffAccount, appointmentsRouter);
  app.use('/api/clinical', requireStaffAccount, clinicalRouter);
  app.use('/api/billing', requireStaffAccount, billingRouter);
  app.use('/api/portal', portalRouter);
  app.use('/api/admin', requireStaffAccount, adminRouter);
  app.use('/api/organizations', requireStaffAccount, orgsRouter);

  app.use('/api', apiErrorHandler);
  return app;
}
