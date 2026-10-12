/**
 * Test Suite: Resource-Level Access Control (RLAC)
 * 
 * Tests role-to-resource compatibility:
 * - Billing staff cannot access clinical SOAP notes
 * - Nurses cannot view financial invoices
 */

import { ResourceAccessService } from '../backend/security/resource-access.js';
import { SecurityContext } from '../backend/types/domain.js';
import { SystemRoles, RolePermissionsMap } from '../backend/security/permissions.js';

export async function runResourceAccessTests(): Promise<{ name: string; passed: boolean; error?: string }[]> {
  const results: { name: string; passed: boolean; error?: string }[] = [];

  const billingStaffContext: SecurityContext = {
    user: { id: 'usr_james', email: 'james@clinilync.com', firstName: 'James', lastName: 'Thornton', isSuperAdmin: false },
    activeOrganization: {
      id: 'org_st_jude', name: 'St. Jude', slug: 'st-jude', country_code: 'GBR', currency_code: 'GBP',
      timezone: 'Europe/London', is_active: true, created_at: '', updated_at: ''
    },
    roles: [{ id: 'role_billing', name: 'Billing Staff', code: 'BILLING_STAFF', is_system_role: true, created_at: '' }],
    permissions: RolePermissionsMap[SystemRoles.BILLING_STAFF],
    sessionToken: 'sess_james'
  };

  const nurseContext: SecurityContext = {
    user: { id: 'usr_marcus', email: 'nurse.marcus@clinilync.com', firstName: 'Marcus', lastName: 'Vance', isSuperAdmin: false },
    activeOrganization: {
      id: 'org_st_jude', name: 'St. Jude', slug: 'st-jude', country_code: 'GBR', currency_code: 'GBP',
      timezone: 'Europe/London', is_active: true, created_at: '', updated_at: ''
    },
    roles: [{ id: 'role_nurse', name: 'Nurse', code: 'NURSE', is_system_role: true, created_at: '' }],
    permissions: RolePermissionsMap[SystemRoles.NURSE],
    sessionToken: 'sess_marcus'
  };

  // Test 1: Billing staff cannot read clinical SOAP notes
  try {
    const verdict = ResourceAccessService.canAccessResource({
      context: billingStaffContext,
      resourceType: 'ClinicalRecord',
      resourceId: 'rec_501',
      resourceOrganizationId: 'org_st_jude'
    });

    if (verdict.allowed) {
      throw new Error('Billing staff must not have authorization to view clinical encounter notes');
    }

    results.push({ name: 'RLAC - Billing Staff Restricted from Clinical Notes', passed: true });
  } catch (err) {
    results.push({ name: 'RLAC - Billing Staff Restricted from Clinical Notes', passed: false, error: (err as Error).message });
  }

  // Test 2: Nurse cannot view financial invoices
  try {
    const verdict = ResourceAccessService.canAccessResource({
      context: nurseContext,
      resourceType: 'Invoice',
      resourceId: 'inv_1001',
      resourceOrganizationId: 'org_st_jude'
    });

    if (verdict.allowed) {
      throw new Error('Nursing staff must not have authorization to view financial invoices');
    }

    results.push({ name: 'RLAC - Nursing Staff Restricted from Financial Invoices', passed: true });
  } catch (err) {
    results.push({ name: 'RLAC - Nursing Staff Restricted from Financial Invoices', passed: false, error: (err as Error).message });
  }

  return results;
}
