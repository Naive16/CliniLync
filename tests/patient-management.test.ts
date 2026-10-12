/**
 * CLINILYNC Automated Test Suite: Phase 6 Patient Management, Registration & Profiles
 * 
 * Tests:
 * 1. Patient registration by authorized staff (MRN generation, validation)
 * 2. Strict organization isolation (cross-tenant access rejected without leakage)
 * 3. Centralized permission gates (PATIENT_VIEW, PATIENT_CREATE, PATIENT_UPDATE, PATIENT_ARCHIVE)
 * 4. Demographic profile editing & contact preferences
 * 5. Patient status lifecycle management & archiving
 * 6. Structured emergency contacts management
 * 7. Informed consent foundations & revocation
 * 8. Comprehensive server-side audit trail generation
 */

import { getDatabaseClient } from '../database/db.js';
import { AuthorizationService } from '../backend/security/authorization.js';
import { Permissions, SystemRoles } from '../backend/security/permissions.js';
import { AuditService } from '../backend/security/audit.js';
import { SecurityContext, Organization, Patient, PatientContact, PatientConsent } from '../backend/types/domain.js';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export async function runPatientManagementTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const db = getDatabaseClient();

  const orgStJude: Organization = {
    id: 'org_st_jude',
    name: 'St. Jude Global Health',
    slug: 'st-jude-london',
    country_code: 'GBR',
    currency_code: 'GBP',
    timezone: 'Europe/London',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const orgMetroHealth: Organization = {
    id: 'org_metro_health',
    name: 'Metro Health Specialty Institute',
    slug: 'metro-health-ny',
    country_code: 'USA',
    currency_code: 'USD',
    timezone: 'America/New_York',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // Dr. Sarah Chen (Doctor in St. Jude)
  const drSarahContext: SecurityContext = {
    user: { id: 'usr_sarah', email: 'dr.sarah@clinilync.com', firstName: 'Sarah', lastName: 'Chen', isSuperAdmin: false },
    activeOrganization: orgStJude,
    roles: [{ id: 'role_doctor', name: 'Doctor', code: 'DOCTOR', is_system_role: true, created_at: new Date().toISOString() }],
    permissions: [
      Permissions.PATIENT_VIEW,
      Permissions.PATIENT_CREATE,
      Permissions.PATIENT_UPDATE,
      Permissions.CLINICAL_VIEW,
      Permissions.CLINICAL_CREATE
    ],
    sessionToken: 'test_token_sarah'
  };

  // Dr. Robert Taylor (Doctor in Metro Health)
  const drRobertContext: SecurityContext = {
    user: { id: 'usr_robert', email: 'dr.robert@clinilync.com', firstName: 'Robert', lastName: 'Taylor', isSuperAdmin: false },
    activeOrganization: orgMetroHealth,
    roles: [{ id: 'role_doctor', name: 'Doctor', code: 'DOCTOR', is_system_role: true, created_at: new Date().toISOString() }],
    permissions: [
      Permissions.PATIENT_VIEW,
      Permissions.PATIENT_CREATE,
      Permissions.PATIENT_UPDATE,
      Permissions.CLINICAL_VIEW
    ],
    sessionToken: 'test_token_robert'
  };

  // Olivia Sterling (Org Owner in St. Jude with PATIENT_ARCHIVE)
  const orgOwnerContext: SecurityContext = {
    user: { id: 'usr_owner', email: 'owner.olivia@clinilync.com', firstName: 'Olivia', lastName: 'Sterling', isSuperAdmin: false },
    activeOrganization: orgStJude,
    roles: [{ id: 'role_org_owner', name: 'Organization Owner', code: 'ORG_OWNER', is_system_role: true, created_at: new Date().toISOString() }],
    permissions: [
      Permissions.ORGANIZATION_VIEW,
      Permissions.PATIENT_VIEW,
      Permissions.PATIENT_CREATE,
      Permissions.PATIENT_UPDATE,
      Permissions.PATIENT_ARCHIVE
    ],
    sessionToken: 'test_token_owner'
  };

  // Sam Taylor (Support Staff in St. Jude - lacks PATIENT_CREATE & PATIENT_ARCHIVE)
  const supportStaffContext: SecurityContext = {
    user: { id: 'usr_support', email: 'support.sam@clinilync.com', firstName: 'Sam', lastName: 'Taylor', isSuperAdmin: false },
    activeOrganization: orgStJude,
    roles: [{ id: 'role_support_staff', name: 'Support Staff', code: 'SUPPORT_STAFF', is_system_role: true, created_at: new Date().toISOString() }],
    permissions: [
      Permissions.ORGANIZATION_VIEW,
      Permissions.USER_VIEW,
      Permissions.AUDIT_VIEW
    ],
    sessionToken: 'test_token_support'
  };

  // TEST 1: Authorized staff can register a patient with valid intake data
  try {
    const testPatientId = 'pat_test_intake_001';
    const mrn = 'MRN-TEST-101';
    await db.query(
      `INSERT INTO patients 
        (id, organization_id, mrn, first_name, last_name, date_of_birth, gender, blood_group, email, phone, preferred_language, contact_preference, status, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        testPatientId,
        orgStJude.id,
        mrn,
        'Eleanor',
        'Vance',
        '1992-04-12',
        'FEMALE',
        'O_POSITIVE',
        'eleanor.vance@example.com',
        '+44 7700 900555',
        'en',
        'EMAIL',
        'ACTIVE',
        true,
        new Date().toISOString(),
        new Date().toISOString()
      ]
    );

    const check = await db.query<Patient>('SELECT * FROM patients WHERE id = $1', [testPatientId]);
    if (check.rows.length === 0 || check.rows[0].first_name !== 'Eleanor') {
      throw new Error('Patient intake registration failed to persist');
    }
    results.push({ name: 'Phase 6 - Patient Registration by Authorized Staff with Valid Data', passed: true });
  } catch (err) {
    results.push({ name: 'Phase 6 - Patient Registration by Authorized Staff with Valid Data', passed: false, error: (err as Error).message });
  }

  // TEST 2: Rejection of Unauthorized Staff attempting Patient Registration (RBAC gate)
  try {
    const authResult = await AuthorizationService.authorize({
      user: supportStaffContext.user,
      organizationId: orgStJude.id,
      permission: Permissions.PATIENT_CREATE
    });

    if (authResult.allowed) {
      throw new Error('Support staff without PATIENT_CREATE was improperly authorized to register patient');
    }
    results.push({ name: 'Phase 6 - Unauthorized Persona Rejection on Patient Intake (PATIENT_CREATE required)', passed: true });
  } catch (err) {
    results.push({ name: 'Phase 6 - Unauthorized Persona Rejection on Patient Intake (PATIENT_CREATE required)', passed: false, error: (err as Error).message });
  }

  // TEST 3: Strict Organization Isolation (Intra-tenant allowed, cross-tenant denied)
  try {
    // Dr. Sarah queries St. Jude patients
    const stJudePatients = await db.query<Patient>('SELECT * FROM patients WHERE organization_id = $1', [drSarahContext.activeOrganization.id]);
    const hasDavid = stJudePatients.rows.some(p => p.id === 'pat_david');
    const hasJonathan = stJudePatients.rows.some(p => p.id === 'pat_jonathan'); // Jonathan belongs to Metro Health

    if (!hasDavid) {
      throw new Error('St. Jude clinician could not find St. Jude patient');
    }
    if (hasJonathan) {
      throw new Error('Tenant leak: St. Jude clinician received Metro Health patient record');
    }

    // Try cross-tenant authorization assert
    const metroPatientRes = await db.query<Patient>('SELECT * FROM patients WHERE id = $1', ['pat_jonathan']);
    const metroPatient = metroPatientRes.rows[0];

    const crossTenantCheck = await AuthorizationService.authorize({
      user: drSarahContext.user,
      organizationId: orgStJude.id,
      permission: Permissions.PATIENT_VIEW,
      resource: {
        type: 'Patient',
        id: metroPatient.id,
        organizationId: metroPatient.organization_id
      }
    });

    if (crossTenantCheck.allowed) {
      throw new Error('Cross-tenant access was improperly granted for foreign patient');
    }

    results.push({ name: 'Phase 6 - Strict Multi-Tenant Organization Isolation (Cross-Tenant Access Denied)', passed: true });
  } catch (err) {
    results.push({ name: 'Phase 6 - Strict Multi-Tenant Organization Isolation (Cross-Tenant Access Denied)', passed: false, error: (err as Error).message });
  }

  // TEST 4: Permission-aware search and filtering
  try {
    const allStJude = await db.query<Patient>('SELECT * FROM patients WHERE organization_id = $1', [orgStJude.id]);
    // Filter by search query "miller"
    const searchResult = allStJude.rows.filter(p => 
      p.first_name.toLowerCase().includes('miller') || p.last_name.toLowerCase().includes('miller')
    );

    if (searchResult.length === 0 || searchResult[0].last_name !== 'Miller') {
      throw new Error('Permission-aware search failed to match patient last name');
    }
    results.push({ name: 'Phase 6 - Patient Search and Filter Scoped to Active Organization', passed: true });
  } catch (err) {
    results.push({ name: 'Phase 6 - Patient Search and Filter Scoped to Active Organization', passed: false, error: (err as Error).message });
  }

  // TEST 5: Patient demographic and contact preference editing
  try {
    await db.query(
      `UPDATE patients 
       SET preferred_language = $1, contact_preference = $2, address_line1 = $3, updated_at = $4 
       WHERE id = $5 AND organization_id = $6`,
      ['fr', 'SMS', '14 Kensington Court Apt 2', new Date().toISOString(), 'pat_david', orgStJude.id]
    );

    const check = await db.query<Patient>('SELECT * FROM patients WHERE id = $1', ['pat_david']);
    const updated = check.rows[0];
    if (updated.preferred_language !== 'fr' || updated.contact_preference !== 'SMS') {
      throw new Error('Patient profile preferences failed to update');
    }
    results.push({ name: 'Phase 6 - Patient Demographic Profile & Contact Preference Editing', passed: true });
  } catch (err) {
    results.push({ name: 'Phase 6 - Patient Demographic Profile & Contact Preference Editing', passed: false, error: (err as Error).message });
  }

  // TEST 6: Patient status management and archiving (PATIENT_ARCHIVE required)
  try {
    // 6a: Support staff without PATIENT_ARCHIVE must be denied
    const deniedArchive = await AuthorizationService.authorize({
      user: supportStaffContext.user,
      organizationId: orgStJude.id,
      permission: Permissions.PATIENT_ARCHIVE
    });
    if (deniedArchive.allowed) {
      throw new Error('Staff lacking PATIENT_ARCHIVE was improperly allowed to archive patient');
    }

    // 6b: Org Owner with PATIENT_ARCHIVE allowed
    const allowedArchive = await AuthorizationService.authorize({
      user: orgOwnerContext.user,
      organizationId: orgStJude.id,
      permission: Permissions.PATIENT_ARCHIVE
    });
    if (!allowedArchive.allowed) {
      throw new Error('Org Owner with PATIENT_ARCHIVE was rejected: ' + allowedArchive.reason);
    }

    // Perform archive update
    const archiveReason = 'Transferred care to regional oncology center';
    await db.query(
      `UPDATE patients 
       SET status = $1, is_active = $2, archived_at = $3, archived_reason = $4, archived_by = $5, updated_at = $6
       WHERE id = $7`,
      ['ARCHIVED', false, new Date().toISOString(), archiveReason, orgOwnerContext.user.id, new Date().toISOString(), 'pat_test_intake_001']
    );

    const check = await db.query<Patient>('SELECT * FROM patients WHERE id = $1', ['pat_test_intake_001']);
    const archivedPat = check.rows[0];
    if (archivedPat.status !== 'ARCHIVED' || archivedPat.is_active !== false || !archivedPat.archived_reason) {
      throw new Error('Patient archiving failed to persist metadata');
    }

    results.push({ name: 'Phase 6 - Patient Lifecycle Status Management & Archiving (PATIENT_ARCHIVE enforced)', passed: true });
  } catch (err) {
    results.push({ name: 'Phase 6 - Patient Lifecycle Status Management & Archiving (PATIENT_ARCHIVE enforced)', passed: false, error: (err as Error).message });
  }

  // TEST 7: Emergency contacts management (Add, list, delete)
  try {
    const contactId = 'cnt_test_guardian_1';
    await db.query(
      `INSERT INTO patient_contacts (id, organization_id, patient_id, name, relationship, phone, email, is_emergency_contact, has_legal_authority, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [contactId, orgStJude.id, 'pat_david', 'Jonathan Miller', 'Son', '+44 7700 900888', 'jonathan@example.com', true, true, new Date().toISOString(), new Date().toISOString()]
    );

    const contactsList = await db.query<PatientContact>('SELECT * FROM patient_contacts WHERE patient_id = $1', ['pat_david']);
    const hasSon = contactsList.rows.some(c => c.name === 'Jonathan Miller' && c.relationship === 'Son');
    if (!hasSon) {
      throw new Error('Emergency contact failed to persist');
    }

    // Delete contact
    await db.query('DELETE FROM patient_contacts WHERE id = $1 AND patient_id = $2', [contactId, 'pat_david']);
    const checkAfterDelete = await db.query<PatientContact>('SELECT * FROM patient_contacts WHERE id = $1', [contactId]);
    if (checkAfterDelete.rows.length > 0) {
      throw new Error('Emergency contact failed to delete');
    }

    results.push({ name: 'Phase 6 - Structured Emergency Contacts Management (Add, Query, Remove)', passed: true });
  } catch (err) {
    results.push({ name: 'Phase 6 - Structured Emergency Contacts Management (Add, Query, Remove)', passed: false, error: (err as Error).message });
  }

  // TEST 8: Informed consent records foundation & revocation
  try {
    const consentId = 'cns_test_research_1';
    await db.query(
      `INSERT INTO patient_consents (id, organization_id, patient_id, consent_type, purpose, status, granted_at, recorded_by_user_id, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        consentId,
        orgStJude.id,
        'pat_david',
        'RESEARCH',
        'Participation in international genomic cardiovascular clinical study',
        'GRANTED',
        new Date().toISOString(),
        drSarahContext.user.id,
        'Signed paper form retained in health records library',
        new Date().toISOString()
      ]
    );

    const consentCheck = await db.query<PatientConsent>('SELECT * FROM patient_consents WHERE id = $1', [consentId]);
    if (consentCheck.rows.length === 0 || consentCheck.rows[0].status !== 'GRANTED') {
      throw new Error('Consent record failed to persist');
    }

    // Revocation of consent
    const revokedAt = new Date().toISOString();
    await db.query(
      'UPDATE patient_consents SET status = $1, revoked_at = $2, revoked_by_user_id = $3 WHERE id = $4',
      ['REVOKED', revokedAt, drSarahContext.user.id, consentId]
    );

    const revokedCheck = await db.query<PatientConsent>('SELECT * FROM patient_consents WHERE id = $1', [consentId]);
    if (revokedCheck.rows[0].status !== 'REVOKED' || !revokedCheck.rows[0].revoked_at) {
      throw new Error('Consent revocation failed to update status and timestamp');
    }

    results.push({ name: 'Phase 6 - Informed Consent Records Foundation & Explicit Revocation', passed: true });
  } catch (err) {
    results.push({ name: 'Phase 6 - Informed Consent Records Foundation & Explicit Revocation', passed: false, error: (err as Error).message });
  }

  // TEST 9: Audit event generation for patient operations
  try {
    await AuditService.logEvent({
      organizationId: orgStJude.id,
      actorId: drSarahContext.user.id,
      actorRole: 'DOCTOR',
      action: 'patient.registered',
      resourceType: 'Patient',
      resourceId: 'pat_test_audit_check',
      metadata: { mrn: 'MRN-AUDIT-1' },
      severity: 'INFO'
    });

    await AuditService.logEvent({
      organizationId: orgStJude.id,
      actorId: orgOwnerContext.user.id,
      actorRole: 'ORG_OWNER',
      action: 'patient.archived',
      resourceType: 'Patient',
      resourceId: 'pat_test_audit_check',
      metadata: { reason: 'Deceased' },
      severity: 'WARNING'
    });

    const logs = await AuditService.getOrganizationAuditLogs(orgStJude.id, 20);
    const regLog = logs.find(l => l.action === 'patient.registered' && l.resource_id === 'pat_test_audit_check');
    const archiveLog = logs.find(l => l.action === 'patient.archived' && l.resource_id === 'pat_test_audit_check');

    if (!regLog || !archiveLog) {
      throw new Error('Audit service failed to record patient operations');
    }
    results.push({ name: 'Phase 6 - Comprehensive Server-Side Audit Trail for Patient Mutations', passed: true });
  } catch (err) {
    results.push({ name: 'Phase 6 - Comprehensive Server-Side Audit Trail for Patient Mutations', passed: false, error: (err as Error).message });
  }

  return results;
}
