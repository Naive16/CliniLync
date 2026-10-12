/**
 * Test Suite: Audit Logging Foundation
 */

import { AuditService } from '../backend/security/audit.js';

export async function runAuditLoggingTests(): Promise<{ name: string; passed: boolean; error?: string }[]> {
  const results: { name: string; passed: boolean; error?: string }[] = [];

  try {
    const entry = await AuditService.logEvent({
      organizationId: 'org_st_jude',
      actorId: 'usr_sarah',
      actorRole: 'DOCTOR',
      action: 'clinical.prescription_created',
      resourceType: 'Prescription',
      resourceId: 'rx_test_99',
      metadata: {
        drug: 'Lisinopril 10mg',
        password: 'DoNotLogPassword123' // Should be sanitized out!
      },
      severity: 'INFO'
    });

    if (!entry.id || !entry.created_at) {
      throw new Error('Audit entry missing immutable ID or timestamp');
    }

    if (entry.metadata && (entry.metadata as Record<string, unknown>).password) {
      throw new Error('Audit logger failed to sanitize sensitive password field from metadata');
    }

    const orgLogs = await AuditService.getOrganizationAuditLogs('org_st_jude', 10);
    const found = orgLogs.some(l => l.id === entry.id);

    if (!found) {
      throw new Error('Newly logged audit entry was not found in organization audit stream');
    }

    results.push({ name: 'Audit - Append-Only Logging and Metadata Sanitization', passed: true });
  } catch (err) {
    results.push({ name: 'Audit - Append-Only Logging and Metadata Sanitization', passed: false, error: (err as Error).message });
  }

  return results;
}
