/**
 * Test Suite: Organization Isolation Foundation (Critical Security Requirement)
 * 
 * Verifies that a user from Organization A CANNOT access, query, or mutate
 * resources belonging to Organization B.
 */

import { ResourceAccessService } from '../backend/security/resource-access.js';
import { SecurityContext } from '../backend/types/domain.js';
import { SystemRoles, RolePermissionsMap } from '../backend/security/permissions.js';

export async function runOrganizationIsolationTests(): Promise<{ name: string; passed: boolean; error?: string }[]> {
  const results: { name: string; passed: boolean; error?: string }[] = [];

  // Dr. Sarah Chen in Organization A (St. Jude)
  const stJudeDoctorContext: SecurityContext = {
    user: { id: 'usr_sarah', email: 'dr.sarah@clinilync.com', firstName: 'Sarah', lastName: 'Chen', isSuperAdmin: false },
    activeOrganization: {
      id: 'org_st_jude', name: 'St. Jude Global Health Center', slug: 'st-jude-london', country_code: 'GBR',
      currency_code: 'GBP', timezone: 'Europe/London', is_active: true, created_at: '', updated_at: ''
    },
    roles: [{ id: 'role_doctor', name: 'Doctor', code: 'DOCTOR', is_system_role: true, created_at: '' }],
    permissions: RolePermissionsMap[SystemRoles.DOCTOR],
    sessionToken: 'sess_sarah'
  };

  // Test 1: Accessing own organization resource is permitted
  try {
    const verdict = ResourceAccessService.canAccessResource({
      context: stJudeDoctorContext,
      resourceType: 'Patient',
      resourceId: 'pat_david',
      resourceOrganizationId: 'org_st_jude'
    });

    if (!verdict.allowed) {
      throw new Error(`Legitimate intra-organization access was denied: ${verdict.reason}`);
    }

    results.push({ name: 'Tenancy - Authorized Intra-Organization Access Allowed', passed: true });
  } catch (err) {
    results.push({ name: 'Tenancy - Authorized Intra-Organization Access Allowed', passed: false, error: (err as Error).message });
  }

  // Test 2: Attempting to access Organization B's patient (Metro Health) is strictly BLOCKED
  try {
    const verdict = ResourceAccessService.canAccessResource({
      context: stJudeDoctorContext,
      resourceType: 'Patient',
      resourceId: 'pat_jonathan',
      resourceOrganizationId: 'org_metro_health' // Foreign organization
    });

    if (verdict.allowed) {
      throw new Error('SECURITY VIOLATION: User from Organization A was allowed to access Organization B patient data!');
    }

    let errorThrown = false;
    try {
      ResourceAccessService.assertResourceAccess({
        context: stJudeDoctorContext,
        resourceType: 'Patient',
        resourceId: 'pat_jonathan',
        resourceOrganizationId: 'org_metro_health'
      });
    } catch {
      errorThrown = true;
    }

    if (!errorThrown) {
      throw new Error('assertResourceAccess failed to throw 403 on cross-tenant breach');
    }

    results.push({ name: 'Tenancy - Cross-Organization Resource Access Strictly Blocked (403 Forbidden)', passed: true });
  } catch (err) {
    results.push({ name: 'Tenancy - Cross-Organization Resource Access Strictly Blocked (403 Forbidden)', passed: false, error: (err as Error).message });
  }

  return results;
}
