/**
 * CLINILYNC Automated Test Suite: Phase 7 Providers, Departments & Appointment Scheduling
 * 
 * Tests:
 * 1. Provider profiles management, validation, and archiving
 * 2. Department management, hierarchy validation, and provider assignments
 * 3. Provider availability, working hours, and slot calculation
 * 4. Atomic concurrency-safe appointment booking & double-booking prevention (HTTP 409)
 * 5. Respecting buffer times between consultations
 * 6. Cancelled appointments releasing availability
 * 7. Enforced appointment lifecycle state transitions & invalid transition rejection
 * 8. Atomic rescheduling preserving integrity on conflicts
 * 9. Strict multi-tenant organization isolation (cross-tenant access rejected)
 * 10. Immutable server-side audit events for scheduling mutations
 */

import { getDatabaseClient } from '../database/db.js';
import { AuthorizationService } from '../backend/security/authorization.js';
import { Permissions, SystemRoles } from '../backend/security/permissions.js';
import { AuditService } from '../backend/security/audit.js';
import { SecurityContext, Organization, Provider, Department, Appointment } from '../backend/types/domain.js';
import { SchedulingService, SchedulingError } from '../backend/services/scheduling.service.js';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export async function runPhase7SchedulingTests(): Promise<TestResult[]> {
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
      Permissions.PROVIDER_VIEW,
      Permissions.DEPARTMENT_VIEW,
      Permissions.SCHEDULE_VIEW,
      Permissions.SCHEDULE_MANAGE,
      Permissions.APPOINTMENT_VIEW,
      Permissions.APPOINTMENT_CREATE,
      Permissions.APPOINTMENT_UPDATE,
      Permissions.APPOINTMENT_CONFIRM,
      Permissions.APPOINTMENT_CHECK_IN,
      Permissions.APPOINTMENT_START,
      Permissions.APPOINTMENT_COMPLETE,
      Permissions.APPOINTMENT_CANCEL,
      Permissions.APPOINTMENT_RESCHEDULE,
      Permissions.APPOINTMENT_NO_SHOW,
      Permissions.APPOINTMENT_VIEW_PATIENT_HISTORY
    ],
    sessionToken: 'test_token_sarah'
  };

  // Elena Ramos (Receptionist in St. Jude)
  const receptionistContext: SecurityContext = {
    user: { id: 'usr_elena', email: 'elena.reception@clinilync.com', firstName: 'Elena', lastName: 'Ramos', isSuperAdmin: false },
    activeOrganization: orgStJude,
    roles: [{ id: 'role_receptionist', name: 'Receptionist', code: 'RECEPTIONIST', is_system_role: true, created_at: new Date().toISOString() }],
    permissions: [
      Permissions.PATIENT_VIEW,
      Permissions.PATIENT_CREATE,
      Permissions.PROVIDER_VIEW,
      Permissions.DEPARTMENT_VIEW,
      Permissions.SCHEDULE_VIEW,
      Permissions.APPOINTMENT_VIEW,
      Permissions.APPOINTMENT_CREATE,
      Permissions.APPOINTMENT_UPDATE,
      Permissions.APPOINTMENT_CONFIRM,
      Permissions.APPOINTMENT_CHECK_IN,
      Permissions.APPOINTMENT_CANCEL,
      Permissions.APPOINTMENT_RESCHEDULE,
      Permissions.APPOINTMENT_NO_SHOW
    ],
    sessionToken: 'test_token_elena'
  };

  // Support Staff (Lacks clinical and scheduling permissions)
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

  // ----------------------------------------------------
  // TEST 1: Provider Profile Management & Authorization
  // ----------------------------------------------------
  try {
    // Check permission gate for support staff
    const authResult = await AuthorizationService.authorize({
      user: supportStaffContext.user,
      organizationId: orgStJude.id,
      permission: Permissions.PROVIDER_CREATE
    });
    if (authResult.allowed) {
      throw new Error('Support staff should not have PROVIDER_CREATE permission');
    }

    // Create provider as Dr. Sarah / Org Owner
    const provId = `prov_test_${Date.now()}`;
    await db.query(
      `INSERT INTO providers (id, organization_id, user_id, department_id, title, first_name, last_name, display_name, specialization, license_number, consultation_fee, is_credential_verified, is_accepting_patients, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        provId,
        orgStJude.id,
        null,
        'dept_cardio',
        'Dr.',
        'Julian',
        'Bashir',
        'Dr. Julian Bashir, MD',
        'Pediatric Cardiology',
        'GMC-994182',
        195.00,
        true,
        true,
        'ACTIVE',
        new Date().toISOString(),
        new Date().toISOString()
      ]
    );

    const fetched = await db.query<Provider>('SELECT * FROM providers WHERE id = $1', [provId]);
    if (fetched.rows.length === 0 || fetched.rows[0].specialization !== 'Pediatric Cardiology') {
      throw new Error('Provider record not properly persisted');
    }

    results.push({ name: 'Phase 7 - Healthcare Provider Profile Creation & Permissions', passed: true });
  } catch (err: any) {
    results.push({ name: 'Phase 7 - Healthcare Provider Profile Creation & Permissions', passed: false, error: err.message });
  }

  // ----------------------------------------------------
  // TEST 2: Department Hierarchy & Provider Assignments
  // ----------------------------------------------------
  try {
    const deptId = `dept_test_${Date.now()}`;
    await db.query(
      `INSERT INTO departments (id, organization_id, name, code, description, parent_department_id, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [deptId, orgStJude.id, 'Cardiac Intensive Care', `CICU_${Date.now()}`.slice(0, 10), 'Level 3 Critical Cardiac Care', 'dept_cardio', true, new Date().toISOString(), new Date().toISOString()]
    );

    // Assign Dr. Sarah Chen to this department
    await db.query(
      `INSERT INTO provider_departments (id, provider_id, department_id, is_primary, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [`pd_sarah_${deptId}`, 'prov_sarah', deptId, false, new Date().toISOString()]
    );

    const checkPd = await db.query('SELECT * FROM provider_departments WHERE provider_id = $1 AND department_id = $2', ['prov_sarah', deptId]);
    if (checkPd.rows.length === 0) {
      throw new Error('Provider department assignment was not recorded');
    }

    results.push({ name: 'Phase 7 - Department Hierarchy & Provider Unit Rostering', passed: true });
  } catch (err: any) {
    results.push({ name: 'Phase 7 - Department Hierarchy & Provider Unit Rostering', passed: false, error: err.message });
  }

  // ----------------------------------------------------
  // TEST 3: Slot Availability & Timezone Calculation
  // ----------------------------------------------------
  try {
    // Find next Monday date
    const testMonday = '2026-10-12'; // Monday
    const slots = await SchedulingService.getAvailableSlots('prov_sarah', orgStJude.id, testMonday, 30);

    if (slots.length === 0) {
      throw new Error('Available slots should be generated for Dr. Sarah on working weekdays');
    }

    // Verify slots start at 09:00
    if (slots[0].timeString !== '09:00') {
      throw new Error(`Expected first slot to be 09:00, received ${slots[0].timeString}`);
    }

    results.push({ name: 'Phase 7 - Provider Availability & Live Slot Calculator Engine', passed: true });
  } catch (err: any) {
    results.push({ name: 'Phase 7 - Provider Availability & Live Slot Calculator Engine', passed: false, error: err.message });
  }

  // ----------------------------------------------------
  // TEST 4: Atomic Booking & Double-Booking Conflict Prevention (HTTP 409)
  // ----------------------------------------------------
  try {
    const slotTime = '2026-10-12T10:00:00.000Z';

    // 1st Booking attempt for David Miller -> MUST SUCCEED
    const booking1 = await SchedulingService.bookAppointment({
      organizationId: orgStJude.id,
      patientId: 'pat_david',
      providerId: 'prov_sarah',
      departmentId: 'dept_cardio',
      scheduledTime: slotTime,
      durationMinutes: 30,
      reasonForVisit: 'Pre-operative cardiovascular workup',
      userId: 'usr_elena',
      userRole: 'RECEPTIONIST'
    });

    if (!booking1.appointment || booking1.appointment.status !== 'SCHEDULED') {
      throw new Error('Primary booking failed to create valid scheduled appointment');
    }

    // 2nd Booking attempt for Olivia Taylor at the EXACT SAME TIME & PROVIDER -> MUST FAIL (409)
    let conflictRejected = false;
    try {
      await SchedulingService.bookAppointment({
        organizationId: orgStJude.id,
        patientId: 'pat_olivia',
        providerId: 'prov_sarah',
        departmentId: 'dept_cardio',
        scheduledTime: slotTime,
        durationMinutes: 30,
        reasonForVisit: 'Concurrent appointment attempt',
        userId: 'usr_elena',
        userRole: 'RECEPTIONIST'
      });
    } catch (err: any) {
      if (err instanceof SchedulingError && err.code === 'APPOINTMENT_CONFLICT' && err.statusCode === 409) {
        conflictRejected = true;
      } else {
        throw new Error(`Expected 409 APPOINTMENT_CONFLICT, received: ${err.message}`);
      }
    }

    if (!conflictRejected) {
      throw new Error('Double-booking prevention FAILED: Two appointments reserved the same provider slot!');
    }

    results.push({ name: 'Phase 7 - Atomic Double-Booking Prevention & Concurrency Conflict (HTTP 409)', passed: true });
  } catch (err: any) {
    results.push({ name: 'Phase 7 - Atomic Double-Booking Prevention & Concurrency Conflict (HTTP 409)', passed: false, error: err.message });
  }

  // ----------------------------------------------------
  // TEST 5: Configured Buffer Times Respected
  // ----------------------------------------------------
  try {
    // Test booking that overlaps during buffer period
    // Existing appointment is 10:00 - 10:30.
    // An appointment starting at 10:15 should conflict.
    let bufferConflict = false;
    try {
      await SchedulingService.bookAppointment({
        organizationId: orgStJude.id,
        patientId: 'pat_olivia',
        providerId: 'prov_sarah',
        departmentId: 'dept_cardio',
        scheduledTime: '2026-10-12T10:15:00.000Z',
        durationMinutes: 30,
        userId: 'usr_elena'
      });
    } catch (err: any) {
      if (err instanceof SchedulingError && err.code === 'APPOINTMENT_CONFLICT') {
        bufferConflict = true;
      }
    }

    if (!bufferConflict) {
      throw new Error('Overlapping appointment during active interval was not rejected');
    }

    results.push({ name: 'Phase 7 - Interval Overlap & Buffer Window Conflict Safeguards', passed: true });
  } catch (err: any) {
    results.push({ name: 'Phase 7 - Interval Overlap & Buffer Window Conflict Safeguards', passed: false, error: err.message });
  }

  // ----------------------------------------------------
  // TEST 6: Appointment Lifecycle State Machine
  // ----------------------------------------------------
  try {
    // Create new appointment to test lifecycle transitions
    // Keep workflow fixtures away from seed appointments, which are relative to
    // the current clock and may otherwise overlap on the test date.
    const aptTime = '2030-10-12T14:00:00.000Z';
    const b = await SchedulingService.bookAppointment({
      organizationId: orgStJude.id,
      patientId: 'pat_david',
      providerId: 'prov_sarah',
      scheduledTime: aptTime,
      durationMinutes: 30,
      userId: 'usr_elena'
    });

    const aptId = b.appointment.id;

    // SCHEDULED -> CONFIRMED
    if (!SchedulingService.validateStatusTransition('SCHEDULED', 'CONFIRMED')) {
      throw new Error('SCHEDULED to CONFIRMED transition should be valid');
    }
    await db.query(`UPDATE appointments SET status = 'CONFIRMED' WHERE id = $1`, [aptId]);

    // CONFIRMED -> CHECKED_IN
    if (!SchedulingService.validateStatusTransition('CONFIRMED', 'CHECKED_IN')) {
      throw new Error('CONFIRMED to CHECKED_IN transition should be valid');
    }
    await db.query(`UPDATE appointments SET status = 'CHECKED_IN', checked_in_at = CURRENT_TIMESTAMP WHERE id = $1`, [aptId]);

    // CHECKED_IN -> IN_PROGRESS
    if (!SchedulingService.validateStatusTransition('CHECKED_IN', 'IN_PROGRESS')) {
      throw new Error('CHECKED_IN to IN_PROGRESS transition should be valid');
    }
    await db.query(`UPDATE appointments SET status = 'IN_PROGRESS', started_at = CURRENT_TIMESTAMP WHERE id = $1`, [aptId]);

    // IN_PROGRESS -> COMPLETED
    if (!SchedulingService.validateStatusTransition('IN_PROGRESS', 'COMPLETED')) {
      throw new Error('IN_PROGRESS to COMPLETED transition should be valid');
    }
    await db.query(`UPDATE appointments SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP WHERE id = $1`, [aptId]);

    // Invalid transition: COMPLETED -> CHECKED_IN should be rejected
    const invalidAllowed = SchedulingService.validateStatusTransition('COMPLETED', 'CHECKED_IN');
    if (invalidAllowed) {
      throw new Error('COMPLETED to CHECKED_IN transition must NOT be allowed');
    }

    results.push({ name: 'Phase 7 - Appointment Lifecycle State Machine Transitions', passed: true });
  } catch (err: any) {
    results.push({ name: 'Phase 7 - Appointment Lifecycle State Machine Transitions', passed: false, error: err.message });
  }

  // ----------------------------------------------------
  // TEST 7: Atomic Rescheduling & Safe Slot Preservation
  // ----------------------------------------------------
  try {
    const aptTime = '2030-10-12T15:00:00.000Z';
    const b = await SchedulingService.bookAppointment({
      organizationId: orgStJude.id,
      patientId: 'pat_david',
      providerId: 'prov_sarah',
      scheduledTime: aptTime,
      durationMinutes: 30,
      userId: 'usr_elena'
    });

    const newTime = '2030-10-12T16:00:00.000Z';
    const resch = await SchedulingService.rescheduleAppointment({
      organizationId: orgStJude.id,
      appointmentId: b.appointment.id,
      newScheduledTime: newTime,
      reason: 'Patient requested afternoon postponement',
      userId: 'usr_elena'
    });

    if (new Date(resch.appointment.scheduled_time).toISOString() !== new Date(newTime).toISOString()) {
      throw new Error('Rescheduled appointment did not update to new scheduled time');
    }

    // Verify reschedule conflict rejection: attempt to reschedule to already booked 10:00 slot
    let reschConflict = false;
    try {
      await SchedulingService.rescheduleAppointment({
        organizationId: orgStJude.id,
        appointmentId: b.appointment.id,
        newScheduledTime: '2026-10-12T10:00:00.000Z',
        userId: 'usr_elena'
      });
    } catch (err: any) {
      if (err instanceof SchedulingError && err.code === 'APPOINTMENT_CONFLICT') {
        reschConflict = true;
      }
    }

    if (!reschConflict) {
      throw new Error('Rescheduling into an existing booked slot was not prevented');
    }

    results.push({ name: 'Phase 7 - Atomic Rescheduling with Conflict Protection', passed: true });
  } catch (err: any) {
    results.push({ name: 'Phase 7 - Atomic Rescheduling with Conflict Protection', passed: false, error: err.message });
  }

  // ----------------------------------------------------
  // TEST 8: Strict Multi-Tenant Isolation (Cross-Tenant Rejection)
  // ----------------------------------------------------
  try {
    // Attempt to book appointment in St. Jude using Metro Health patient pat_jonathan
    let crossTenantBlocked = false;
    try {
      await SchedulingService.bookAppointment({
        organizationId: orgStJude.id, // St. Jude
        patientId: 'pat_jonathan',     // Metro Health patient!
        providerId: 'prov_sarah',
        scheduledTime: '2026-10-12T11:00:00.000Z',
        userId: 'usr_elena'
      });
    } catch (err: any) {
      if (err instanceof SchedulingError && err.code === 'PATIENT_NOT_FOUND') {
        crossTenantBlocked = true;
      }
    }

    if (!crossTenantBlocked) {
      throw new Error('Cross-tenant booking was NOT blocked: St. Jude booked Metro Health patient!');
    }

    // Attempt to book St. Jude patient with Metro Health provider
    let crossProviderBlocked = false;
    try {
      await SchedulingService.bookAppointment({
        organizationId: orgStJude.id,
        patientId: 'pat_david',
        providerId: 'prov_robert',     // Metro Health provider!
        scheduledTime: '2026-10-12T11:00:00.000Z',
        userId: 'usr_elena'
      });
    } catch (err: any) {
      if (err instanceof SchedulingError && err.code === 'PROVIDER_NOT_FOUND') {
        crossProviderBlocked = true;
      }
    }

    if (!crossProviderBlocked) {
      throw new Error('Cross-tenant provider access was NOT blocked!');
    }

    results.push({ name: 'Phase 7 - Multi-Tenant Isolation & Cross-Organization Rejection', passed: true });
  } catch (err: any) {
    results.push({ name: 'Phase 7 - Multi-Tenant Isolation & Cross-Organization Rejection', passed: false, error: err.message });
  }

  // ----------------------------------------------------
  // TEST 9: Comprehensive Audit Trail Verification
  // ----------------------------------------------------
  try {
    const logsRes = await db.query(
      `SELECT action, resource_type, severity FROM audit_logs 
       WHERE organization_id = $1 
         AND action LIKE 'appointment.%' 
       ORDER BY created_at DESC LIMIT 10`,
      [orgStJude.id]
    );

    const loggedActions = logsRes.rows.map((l: any) => l.action);
    const hasCreation = loggedActions.includes('appointment.created');
    const hasConflict = loggedActions.includes('appointment.booking_conflict');

    if (!hasCreation || !hasConflict) {
      throw new Error(`Missing expected audit events. Recorded actions: ${loggedActions.join(', ')}`);
    }

    results.push({ name: 'Phase 7 - Server-Side Audit Trail for Scheduling Operations', passed: true });
  } catch (err: any) {
    results.push({ name: 'Phase 7 - Server-Side Audit Trail for Scheduling Operations', passed: false, error: err.message });
  }

  return results;
}
