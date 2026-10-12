/**
 * CLINILYNC Centralized Secure Error Handler
 * 
 * Intercepts uncaught exceptions and rejected promises.
 * Masks sensitive database details, internal paths, and stack traces.
 * Emits uniform JSON error structures with the correlation Request ID.
 */

import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';

export interface AppErrorOptions {
  status?: number;
  code?: string;
  details?: unknown;
}

export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message);
    this.name = 'AppError';
    this.status = options.status || 400;
    this.code = options.code || 'BAD_REQUEST';
    this.details = options.details;
  }
}

export function apiErrorHandler(
  err: Error & { status?: number; code?: string; details?: unknown },
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const status = err.status && Number.isInteger(err.status) && err.status >= 400 && err.status < 600
    ? err.status
    : 500;

  const isInternal = status >= 500;
  const requestId = req.id || req.correlationId || 'unknown';

  // Log internal errors server-side with correlation ID
  if (isInternal) {
    console.error(`[CLINILYNC ERROR][${requestId}] Unhandled exception:`, err);
  }

  // Safe client response (no stack traces or SQL internals in production)
  const clientCode = err.code || (isInternal ? 'INTERNAL_SERVER_ERROR' : 'APPLICATION_ERROR');
  const clientMessage = isInternal && config.isProduction
    ? 'An internal error occurred. Please reference the request ID when contacting support.'
    : err.message || 'Operation failed';

  res.status(status).json({
    error: {
      code: clientCode,
      message: clientMessage,
      status,
      requestId,
      ...(config.isDevelopment && !config.isProduction ? { details: err.details, stack: err.stack } : {}),
    },
  });
}
