/**
 * CLINILYNC Authentication Rate Limiter Middleware
 * 
 * Protects login and sensitive identity endpoints against credential stuffing and brute force.
 * Uses a sliding timestamp window per IP and key.
 */

import { Request, Response, NextFunction } from 'express';

interface AttemptRecord {
  timestamps: number[];
}

const attemptsMap = new Map<string, AttemptRecord>();

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 15;          // 15 attempts per 15 minutes window

export function authRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const key = `rl_${ip}_${req.path}`;
  const now = Date.now();

  let record = attemptsMap.get(key);
  if (!record) {
    record = { timestamps: [] };
    attemptsMap.set(key, record);
  }

  // Filter timestamps within the current window
  record.timestamps = record.timestamps.filter(t => now - t < WINDOW_MS);

  if (record.timestamps.length >= MAX_ATTEMPTS) {
    const oldest = record.timestamps[0];
    const retryAfterSeconds = Math.ceil((WINDOW_MS - (now - oldest)) / 1000);
    
    res.setHeader('Retry-After', retryAfterSeconds);
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please wait before attempting to sign in again.'
      }
    });
    return;
  }

  record.timestamps.push(now);
  next();
}

/**
 * Resets rate limit for a specific IP/path (e.g. upon successful authentication).
 */
export function resetRateLimit(req: Request): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const key = `rl_${ip}_${req.path}`;
  attemptsMap.delete(key);
}
