/**
 * CLINILYNC Origin and CSRF Protection Middleware
 * 
 * Validates request origin for state-modifying browser sessions to prevent Cross-Site Request Forgery.
 */

import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';

export function originValidationMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Safe HTTP methods do not mutate state
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }

  // If request uses Bearer authorization header (API/mobile client), CSRF is mitigated by preflight/headers
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  // For cookie-based authentication, validate Origin / Referer if present
  const origin = req.headers.origin;
  const host = req.headers.host;

  if (origin && host) {
    try {
      const parsedOrigin = new URL(origin);
      const sameRequestHost = parsedOrigin.host === host;
      const explicitlyAllowed = config.security.corsOrigins.some((allowed) => {
        try { return new URL(allowed).origin === parsedOrigin.origin; } catch { return false; }
      });
      if (!sameRequestHost && !explicitlyAllowed) {
        res.status(403).json({
          error: {
            code: 'FORBIDDEN_CSRF_INVALID_ORIGIN',
            message: 'Cross-site request forgery protection: Untrusted request origin.'
          }
        });
        return;
      }
    } catch {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN_CSRF_MALFORMED_ORIGIN',
          message: 'Cross-site request forgery protection: Invalid request origin header.'
        }
      });
      return;
    }
  }

  next();
}
