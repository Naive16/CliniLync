/**
 * CLINILYNC Centralized Validation Engine
 * 
 * Authoritative server-side validation for request parameters, bodies, and query strings.
 * Reusable schema validator preventing untrusted inputs from reaching domain services.
 */

import { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/error.js';

export type ValidatorFn<T> = (data: unknown) => { valid: true; value: T } | { valid: false; errors: string[] };

export function validateBody<T>(validator: ValidatorFn<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = validator(req.body);
    if (!result.valid) {
      throw new AppError(`Validation failed: ${result.errors.join(', ')}`, {
        status: 400,
        code: 'VALIDATION_ERROR',
        details: result.errors,
      });
    }
    req.body = result.value;
    next();
  };
}

export function validateQuery<T>(validator: ValidatorFn<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = validator(req.query);
    if (!result.valid) {
      throw new AppError(`Query validation failed: ${result.errors.join(', ')}`, {
        status: 400,
        code: 'VALIDATION_ERROR',
        details: result.errors,
      });
    }
    req.query = result.value as any;
    next();
  };
}

export const Validators = {
  isUuid(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  },

  isEmail(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  },

  isIsoDate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const d = new Date(value);
    return !isNaN(d.getTime());
  },

  isNonEmptyString(value: unknown, maxLength = 255): boolean {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
  },

  isPositiveNumber(value: unknown): boolean {
    return typeof value === 'number' && !isNaN(value) && value > 0;
  },
};
