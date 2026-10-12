/**
 * Test Suite: Authentication Foundation
 */

import { hashPassword, verifyPassword } from '../backend/security/password.js';
import { sessionManager } from '../backend/security/session.js';

export async function runAuthTests(): Promise<{ name: string; passed: boolean; error?: string }[]> {
  const results: { name: string; passed: boolean; error?: string }[] = [];

  // Test 1: Password Hashing & Salt Uniqueness
  try {
    const raw = 'SecretClinicianPass#2026';
    const hash1 = hashPassword(raw);
    const hash2 = hashPassword(raw);

    if (hash1.hash === hash2.hash) {
      throw new Error('Salts must be unique across hash calls for identical passwords');
    }
    if (!verifyPassword(raw, hash1.hash, hash1.salt)) {
      throw new Error('Valid password failed verification against its hash/salt');
    }
    if (verifyPassword('WrongPassword!', hash1.hash, hash1.salt)) {
      throw new Error('Invalid password falsely verified as valid');
    }

    results.push({ name: 'Auth - PBKDF2 Hashing and Constant-Time Verification', passed: true });
  } catch (err) {
    results.push({ name: 'Auth - PBKDF2 Hashing and Constant-Time Verification', passed: false, error: (err as Error).message });
  }

  // Test 2: Session Token Generation and Invalidation
  try {
    const userId = 'usr_sarah';
    const orgId = 'org_st_jude';
    const token = sessionManager.createSession(userId, orgId);

    const session = sessionManager.getSession(token);
    if (!session || session.userId !== userId || session.activeOrganizationId !== orgId) {
      throw new Error('Created session could not be retrieved with matching attributes');
    }

    sessionManager.invalidateSession(token);
    const expired = sessionManager.getSession(token);
    if (expired !== null) {
      throw new Error('Invalidated session was still retrievable');
    }

    results.push({ name: 'Auth - Session Store Creation and Invalidation', passed: true });
  } catch (err) {
    results.push({ name: 'Auth - Session Store Creation and Invalidation', passed: false, error: (err as Error).message });
  }

  return results;
}
