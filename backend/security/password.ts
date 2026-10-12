/**
 * CLINILYNC Cryptographic Password Service
 * 
 * Secure PBKDF2 password hashing with cryptographically secure salts.
 * Constant-time comparison to protect against timing attacks.
 */

import crypto from 'node:crypto';

export interface PasswordHashResult {
  hash: string;
  salt: string;
}

const ITERATIONS = 100000;
const KEY_LENGTH = 64;
const DIGEST = 'sha256';

export function hashPassword(password: string, existingSalt?: string): PasswordHashResult {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
  return {
    hash: derivedKey.toString('hex'),
    salt
  };
}

export function verifyPassword(password: string, storedHash: string, salt: string): boolean {
  const derivedKey = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
  const derivedBuffer = Buffer.from(derivedKey.toString('hex'), 'hex');
  const storedBuffer = Buffer.from(storedHash, 'hex');

  if (derivedBuffer.length !== storedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(derivedBuffer, storedBuffer);
}
