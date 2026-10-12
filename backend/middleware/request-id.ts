/**
 * CLINILYNC Request Identification Middleware
 * 
 * Generates or propagates a unique correlation ID (UUIDv4) for every request.
 * Attaches the ID to headers, error envelopes, and audit context.
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';

declare global {
  namespace Express {
    interface Request {
      id?: string;
      correlationId?: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId = (req.headers['x-request-id'] || req.headers['x-correlation-id']) as string | undefined;
  const requestId = incomingId && /^[a-zA-Z0-9_-]{8,64}$/.test(incomingId)
    ? incomingId
    : crypto.randomUUID();

  req.id = requestId;
  req.correlationId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
