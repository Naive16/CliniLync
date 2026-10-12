/**
 * Test Suite: RBAC Permission Gates
 */

import { RBACService } from '../backend/security/rbac.js';
import { Permissions, SystemRoles, RolePermissionsMap } from '../backend/security/permissions.js';
import { SecurityContext } from '../backend/types/domain.js';

export async function runRBACTests(): Promise<{ name: string; passed: boolean; error?: string }[]> {
  const results: { name: string; passed: boolean; error?: string }[] = [];

  const doctorContext: SecurityContext = {
    user: { id: 'usr_sarah', email: 'dr.sarah@clinilync.com', firstName: 'Sarah', lastName: 'Chen', isSuperAdmin: false },
    activeOrganization: {
      id: 'org_st_jude', name: 'St. Jude', slug: 'st-jude', country_code: 'GBR', currency_code: 'GBP',
      timezone: 'Europe/London', is_active: true, created_at: '', updated_at: ''
    },
    roles: [{ id: 'role_doctor', name: 'Doctor', code: 'DOCTOR', is_system_role: true, created_at: '' }],
    permissions: RolePermissionsMap[SystemRoles.DOCTOR],
    sessionToken: 'token_123'
  };

  const receptionistContext: SecurityContext = {
    user: { id: 'usr_elena', email: 'elena@clinilync.com', firstName: 'Elena', lastName: 'Ramos', isSuperAdmin: false },
    activeOrganization: {
      id: 'org_st_jude', name: 'St. Jude', slug: 'st-jude', country_code: 'GBR', currency_code: 'GBP',
      timezone: 'Europe/London', is_active: true, created_at: '', updated_at: ''
    },
    roles: [{ id: 'role_receptionist', name: 'Receptionist', code: 'RECEPTIONIST', is_system_role: true, created_at: '' }],
    permissions: RolePermissionsMap[SystemRoles.RECEPTIONIST],
    sessionToken: 'token_456'
  };

  // Test 1: Doctor allowed to author clinical notes & e-prescribe
  try {
    if (!RBACService.hasPermission(doctorContext, Permissions.CLINICAL_CREATE)) {
      throw new Error('Doctor should have clinical.create permission');
    }
    if (!RBACService.hasPermission(doctorContext, Permissions.PRESCRIPTION_CREATE)) {
      throw new Error('Doctor should have prescription.create permission');
    }
    results.push({ name: 'RBAC - Clinician Authorized Permissions Granted', passed: true });
  } catch (err) {
    results.push({ name: 'RBAC - Clinician Authorized Permissions Granted', passed: false, error: (err as Error).message });
  }

  // Test 2: Receptionist strictly forbidden from authoring clinical notes or e-prescribing
  try {
    if (RBACService.hasPermission(receptionistContext, Permissions.CLINICAL_CREATE)) {
      throw new Error('Receptionist must NOT have clinical.create permission');
    }
    if (RBACService.hasPermission(receptionistContext, Permissions.PRESCRIPTION_CREATE)) {
      throw new Error('Receptionist must NOT have prescription.create permission');
    }

    let errorThrown = false;
    try {
      RBACService.assertPermission(receptionistContext, Permissions.CLINICAL_CREATE);
    } catch {
      errorThrown = true;
    }

    if (!errorThrown) {
      throw new Error('assertPermission did not throw for missing capability');
    }

    results.push({ name: 'RBAC - Unauthorized Persona Access Rejected', passed: true });
  } catch (err) {
    results.push({ name: 'RBAC - Unauthorized Persona Access Rejected', passed: false, error: (err as Error).message });
  }

  // Test 3: Platform administration is not a clinical permission bypass
  try {
    const platformContext = { ...receptionistContext, user: { ...receptionistContext.user, isSuperAdmin: true } };
    if (RBACService.hasPermission(platformContext, Permissions.CLINICAL_CREATE)) {
      throw new Error('Platform administrators must not implicitly receive clinical permissions');
    }
    results.push({ name: 'RBAC - Platform Administration Does Not Bypass Clinical Permissions', passed: true });
  } catch (err) {
    results.push({ name: 'RBAC - Platform Administration Does Not Bypass Clinical Permissions', passed: false, error: (err as Error).message });
  }

  return results;
}
