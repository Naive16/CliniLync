/**
 * CLINILYNC Automated Test Suite: Phase 8 Clinical Encounters, Medical Records & Clinical Notes
 * 
 * Verifies:
 * 1. Creating and managing clinical encounters with relationship integrity.
 * 2. Cross-tenant isolation preventing foreign organization references.
 * 3. Permitted and rejected lifecycle transitions for encounters.
 * 4. Clinical notes drafting with optimistic locking (HTTP 409 on version conflict).
 * 5. Note signing, duplicate signing idempotency, and immutable tamper-protection.
 * 6. Defensible clinical amendments preserving original signed snapshot history.
 * 7. Clinical observations & vital signs recording with explicit units and range validation.
 * 8. Aggregated patient medical record history querying.
 * 9. RBAC permission gates: Receptionist & Billing denied confidential notes.
 * 10. Sanitized append-only audit trail verifying zero raw clinical note leakage.
 */

import crypto from 'node:crypto';
import { getDatabaseClient } from '../database/db.js';
import { AuthorizationService } from '../backend/security/authorization.js';
import { Permissions, SystemRoles } from '../backend/security/permissions.js';
import { AuditService } from '../backend/security/audit.js';
import { SecurityContext, Organization, Encounter, ClinicalNote, ClinicalObservation } from '../backend/types/domain.js';
import { ClinicalService, ClinicalError } from '../backend/services/clinical.service.js';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export async function runPhase8ClinicalTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const db = getDatabaseClient();

  const orgStJude: Organization = {
    id: 'org_st_jude',
    name: 'St. Jude Global Health Center',
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
    roles: [{ id: 'role_doctor', code: SystemRoles.DOCTOR, name: 'Doctor', is_system_role: true, created_at: new Date().toISOString() }],
    permissions: [
      Permissions.ENCOUNTER_VIEW,
      Permissions.ENCOUNTER_CREATE,
      Permissions.ENCOUNTER_UPDATE,
      Permissions.ENCOUNTER_COMPLETE,
      Permissions.ENCOUNTER_CANCEL,
      Permissions.CLINICAL_NOTE_VIEW,
      Permissions.CLINICAL_NOTE_CREATE,
      Permissions.CLINICAL_NOTE_UPDATE_DRAFT,
      Permissions.CLINICAL_NOTE_SIGN,
      Permissions.CLINICAL_NOTE_AMEND,
      Permissions.CLINICAL_OBSERVATION_VIEW,
      Permissions.CLINICAL_OBSERVATION_RECORD,
      Permissions.MEDICAL_RECORD_VIEW
    ],
    sessionToken: 'test_token_sarah'
  };

  // Elena Ramos (Receptionist in St. Jude)
  const receptionistElenaContext: SecurityContext = {
    user: { id: 'usr_reception', email: 'elena.reception@clinilync.com', firstName: 'Elena', lastName: 'Ramos', isSuperAdmin: false },
    activeOrganization: orgStJude,
    roles: [{ id: 'role_receptionist', code: SystemRoles.RECEPTIONIST, name: 'Receptionist', is_system_role: true, created_at: new Date().toISOString() }],
    permissions: [
      Permissions.PATIENT_VIEW,
      Permissions.ENCOUNTER_VIEW,
      Permissions.ENCOUNTER_CREATE
      // STRICTLY NO CLINICAL_NOTE_*, NO MEDICAL_RECORD_VIEW, NO CLINICAL_OBSERVATION_*
    ],
    sessionToken: 'test_token_elena'
  };

  // James Thornton (Billing Staff in St. Jude)
  const billingJamesContext: SecurityContext = {
    user: { id: 'usr_james', email: 'billing.james@clinilync.com', firstName: 'James', lastName: 'Thornton', isSuperAdmin: false },
    activeOrganization: orgStJude,
    roles: [{ id: 'role_billing', code: SystemRoles.BILLING_STAFF, name: 'Billing Staff', is_system_role: true, created_at: new Date().toISOString() }],
    permissions: [
      Permissions.BILLING_VIEW,
      Permissions.BILLING_CREATE_INVOICE,
      Permissions.BILLING_RECORD_PAYMENT
      // STRICTLY NO ENCOUNTER_*, NO CLINICAL_NOTE_*, NO MEDICAL_RECORD_VIEW
    ],
    sessionToken: 'test_token_james'
  };

  // 1. Clinical Encounter Creation & Relationship Integrity
  try {
    const enc = await ClinicalService.createEncounter({
      organizationId: orgStJude.id,
      patientId: 'pat_david',
      providerId: 'prov_sarah',
      encounterType: 'IN_PERSON',
      reasonForVisit: 'Severe chest tightness following morning run',
      userId: drSarahContext.user.id,
      userRole: drSarahContext.roles[0].code
    });

    if (enc.status !== 'PLANNED' || enc.patient_id !== 'pat_david' || enc.provider_id !== 'prov_sarah') {
      throw new Error(`Encounter initialized with incorrect properties: status=${enc.status}`);
    }

    results.push({ name: 'Phase 8 - Clinical Encounter Creation and Relationship Integrity', passed: true });
  } catch (err: any) {
    results.push({ name: 'Phase 8 - Clinical Encounter Creation and Relationship Integrity', passed: false, error: err.message });
  }

  // 2. Strict Cross-Tenant Isolation (Foreign Patient or Provider Rejection)
  try {
    let foreignPatientRejected = false;
    try {
      // pat_jonathan belongs to org_metro_health, not org_st_jude
      await ClinicalService.createEncounter({
        organizationId: orgStJude.id,
        patientId: 'pat_jonathan',
        providerId: 'prov_sarah',
        encounterType: 'IN_PERSON',
        reasonForVisit: 'Cross-tenant illegal consultation test',
        userId: drSarahContext.user.id
      });
    } catch (e: any) {
      if (e instanceof ClinicalError && (e.code === 'PATIENT_NOT_FOUND' || e.statusCode === 404)) {
        foreignPatientRejected = true;
      }
    }

    if (!foreignPatientRejected) {
      throw new Error('System allowed creating encounter referencing foreign tenant patient!');
    }

    results.push({ name: 'Phase 8 - Cross-Tenant Encounter Isolation (Foreign Tenant Access Denied)', passed: true });
  } catch (err: any) {
    results.push({ name: 'Phase 8 - Cross-Tenant Encounter Isolation (Foreign Tenant Access Denied)', passed: false, error: err.message });
  }

  // 3. Permitted and Rejected Encounter Lifecycle Transitions
  try {
    // Create fresh encounter
    const enc = await ClinicalService.createEncounter({
      organizationId: orgStJude.id,
      patientId: 'pat_david',
      providerId: 'prov_sarah',
      reasonForVisit: 'Lifecycle transition verification',
      userId: drSarahContext.user.id
    });

    // Valid: PLANNED -> IN_PROGRESS
    const started = await ClinicalService.transitionEncounterStatus(
      orgStJude.id,
      enc.id,
      'IN_PROGRESS',
      drSarahContext.user.id
    );
    if (started.status !== 'IN_PROGRESS' || !started.started_at) {
      throw new Error('Failed to transition to IN_PROGRESS');
    }

    // Valid: IN_PROGRESS -> COMPLETED
    const completed = await ClinicalService.transitionEncounterStatus(
      orgStJude.id,
      enc.id,
      'COMPLETED',
      drSarahContext.user.id
    );
    if (completed.status !== 'COMPLETED' || !completed.completed_at) {
      throw new Error('Failed to transition to COMPLETED');
    }

    // Invalid: COMPLETED -> PLANNED (Terminal status must not transition back!)
    let invalidTransitionRejected = false;
    try {
      await ClinicalService.transitionEncounterStatus(
        orgStJude.id,
        enc.id,
        'PLANNED',
        drSarahContext.user.id
      );
    } catch (e: any) {
      if (e instanceof ClinicalError && e.code === 'INVALID_STATUS_TRANSITION') {
        invalidTransitionRejected = true;
      }
    }

    if (!invalidTransitionRejected) {
      throw new Error('Terminal status COMPLETED illegally allowed transition to PLANNED');
    }

    results.push({ name: 'Phase 8 - Encounter Lifecycle State Transitions & Invalid State Rejection', passed: true });
  } catch (err: any) {
    results.push({ name: 'Phase 8 - Encounter Lifecycle State Transitions & Invalid State Rejection', passed: false, error: err.message });
  }

  // 4. Clinical Note Draft Authoring and Optimistic Concurrency Conflict (HTTP 409)
  try {
    const enc = await ClinicalService.createEncounter({
      organizationId: orgStJude.id,
      patientId: 'pat_david',
      providerId: 'prov_sarah',
      reasonForVisit: 'Note documentation test',
      userId: drSarahContext.user.id
    });

    // Create Draft
    const note = await ClinicalService.createDraftNote({
      organizationId: orgStJude.id,
      encounterId: enc.id,
      patientId: 'pat_david',
      chiefComplaint: 'Intermittent arrhythmia',
      historyOfPresentIllness: 'Episodes began 4 days ago after marathon training.',
      assessment: 'Suspected benign atrial premature beats',
      plan: 'Perform 12-lead ECG and serum electrolyte panel',
      userId: drSarahContext.user.id
    });

    if (note.status !== 'DRAFT' || note.version !== 1) {
      throw new Error(`Draft note initialized incorrectly: status=${note.status}, version=${note.version}`);
    }

    // Test Optimistic Concurrency Conflict: Passing expectedVersion = 99 when actual is 1
    let conflictCaught = false;
    try {
      await ClinicalService.updateDraftNote({
        organizationId: orgStJude.id,
        noteId: note.id,
        expectedVersion: 99,
        assessment: 'Modified assessment with stale version',
        userId: drSarahContext.user.id
      });
    } catch (e: any) {
      if (e instanceof ClinicalError && e.code === 'CONCURRENCY_CONFLICT' && e.statusCode === 409) {
        conflictCaught = true;
      }
    }

    if (!conflictCaught) {
      throw new Error('Expected concurrency conflict (HTTP 409) on mismatched note version was not raised!');
    }

    // Valid update with correct expectedVersion = 1
    const updated = await ClinicalService.updateDraftNote({
      organizationId: orgStJude.id,
      noteId: note.id,
      expectedVersion: 1,
      assessment: 'Updated differential: SVT vs Sinus Tachycardia',
      userId: drSarahContext.user.id
    });

    if (!updated.assessment?.includes('SVT')) {
      throw new Error('Draft update was not persisted correctly');
    }

    results.push({ name: 'Phase 8 - Clinical Note Draft Authoring and Concurrency-Safe Editing (HTTP 409)', passed: true });
  } catch (err: any) {
    results.push({ name: 'Phase 8 - Clinical Note Draft Authoring and Concurrency-Safe Editing (HTTP 409)', passed: false, error: err.message });
  }

  // 5. Note Signing, Tamper-Protection & Direct Overwrite Prevention
  try {
    const enc = await ClinicalService.createEncounter({
      organizationId: orgStJude.id,
      patientId: 'pat_david',
      providerId: 'prov_sarah',
      userId: drSarahContext.user.id
    });

    const draft = await ClinicalService.createDraftNote({
      organizationId: orgStJude.id,
      encounterId: enc.id,
      patientId: 'pat_david',
      chiefComplaint: 'Signing test complaint',
      assessment: 'Acute viral pharyngitis',
      plan: 'Supportive care, hydration',
      userId: drSarahContext.user.id
    });

    // Sign note
    const signed = await ClinicalService.signNote(
      orgStJude.id,
      draft.id,
      drSarahContext.user.id,
      drSarahContext.roles[0].code
    );

    if (signed.status !== 'SIGNED' || !signed.signed_at || signed.signed_by_user_id !== drSarahContext.user.id) {
      throw new Error('Note was not marked SIGNED with valid signature metadata');
    }

    // Tamper-Protection: Direct update of signed note must be rejected!
    let overwriteRejected = false;
    try {
      await ClinicalService.updateDraftNote({
        organizationId: orgStJude.id,
        noteId: signed.id,
        assessment: 'Silently altered clinical assessment without amendment trail',
        userId: drSarahContext.user.id
      });
    } catch (e: any) {
      if (e instanceof ClinicalError && (e.code === 'NOTE_ALREADY_FINALIZED' || e.statusCode === 400)) {
        overwriteRejected = true;
      }
    }

    if (!overwriteRejected) {
      throw new Error('System allowed direct silent modification of signed clinical documentation!');
    }

    // Idempotent Signing: Signing an already signed note returns cleanly without duplicate corruption
    const idempotentSign = await ClinicalService.signNote(
      orgStJude.id,
      signed.id,
      drSarahContext.user.id
    );
    if (idempotentSign.status !== 'SIGNED') {
      throw new Error('Idempotent signing corrupted note status');
    }

    results.push({ name: 'Phase 8 - Note Signing, Tamper-Protection & Direct Overwrite Prevention', passed: true });
  } catch (err: any) {
    results.push({ name: 'Phase 8 - Note Signing, Tamper-Protection & Direct Overwrite Prevention', passed: false, error: err.message });
  }

  // 6. Traceable Clinical Amendment Workflow & Historical Version Archival
  try {
    const enc = await ClinicalService.createEncounter({
      organizationId: orgStJude.id,
      patientId: 'pat_david',
      providerId: 'prov_sarah',
      userId: drSarahContext.user.id
    });

    const draft = await ClinicalService.createDraftNote({
      organizationId: orgStJude.id,
      encounterId: enc.id,
      patientId: 'pat_david',
      chiefComplaint: 'Original version 1 complaint',
      assessment: 'Initial assessment v1',
      plan: 'Initial plan v1',
      userId: drSarahContext.user.id
    });

    const signedV1 = await ClinicalService.signNote(orgStJude.id, draft.id, drSarahContext.user.id);

    // Attempt amendment without reason -> must reject!
    let missingReasonRejected = false;
    try {
      await ClinicalService.amendNote({
        organizationId: orgStJude.id,
        noteId: signedV1.id,
        amendmentReason: '',
        assessment: 'Amended without justification',
        userId: drSarahContext.user.id
      });
    } catch (e: any) {
      if (e instanceof ClinicalError && e.code === 'AMENDMENT_REASON_REQUIRED') {
        missingReasonRejected = true;
      }
    }
    if (!missingReasonRejected) {
      throw new Error('Amendment without clinical justification reason was allowed!');
    }

    // Valid Amendment with justification
    const amendedV2 = await ClinicalService.amendNote({
      organizationId: orgStJude.id,
      noteId: signedV1.id,
      amendmentReason: 'Corrected assessment following echocardiogram review',
      assessment: 'Echocardiogram confirms mild mitral valve prolapse; benign variant',
      plan: 'Reassurance, avoid excessive sympathomimetics',
      userId: drSarahContext.user.id
    });

    if (amendedV2.status !== 'AMENDED' || amendedV2.version !== 2) {
      throw new Error(`Amended note has incorrect status=${amendedV2.status} or version=${amendedV2.version}`);
    }

    // Check version archival history
    const versions = await ClinicalService.getNoteVersions(orgStJude.id, signedV1.id);
    if (versions.length < 1) {
      throw new Error('Version 1 snapshot was not preserved in clinical_note_versions!');
    }

    const archivedV1 = versions[0];
    if (archivedV1.version_number !== 1 || !archivedV1.snapshot_data.includes('Initial assessment v1')) {
      throw new Error('Archived version 1 did not preserve immutable original signed findings!');
    }

    results.push({ name: 'Phase 8 - Traceable Clinical Amendment Workflow & Historical Version Archival', passed: true });
  } catch (err: any) {
    results.push({ name: 'Phase 8 - Traceable Clinical Amendment Workflow & Historical Version Archival', passed: false, error: err.message });
  }

  // 7. Clinical Observations & Vital Signs Range and Unit Validation
  try {
    const enc = await ClinicalService.createEncounter({
      organizationId: orgStJude.id,
      patientId: 'pat_david',
      providerId: 'prov_sarah',
      userId: drSarahContext.user.id
    });

    // Valid observation recording
    const validObs = await ClinicalService.recordObservation({
      organizationId: orgStJude.id,
      encounterId: enc.id,
      patientId: 'pat_david',
      observationType: 'HEART_RATE',
      numericValue: 74,
      unit: 'bpm',
      userId: drSarahContext.user.id
    });

    if (validObs.numeric_value !== 74 || validObs.unit !== 'bpm') {
      throw new Error('Valid observation was not saved with correct value or unit');
    }

    // Missing unit rejection
    let missingUnitRejected = false;
    try {
      await ClinicalService.recordObservation({
        organizationId: orgStJude.id,
        encounterId: enc.id,
        patientId: 'pat_david',
        observationType: 'HEART_RATE',
        numericValue: 80,
        unit: '',
        userId: drSarahContext.user.id
      });
    } catch (e: any) {
      if (e instanceof ClinicalError && e.code === 'UNIT_REQUIRED') {
        missingUnitRejected = true;
      }
    }
    if (!missingUnitRejected) {
      throw new Error('Observation without explicit measurement unit was allowed!');
    }

    // Physiologically impossible range rejection (e.g. Heart Rate = -10 bpm, O2 Sat = 150%)
    let impossibleRangeRejected = false;
    try {
      await ClinicalService.recordObservation({
        organizationId: orgStJude.id,
        encounterId: enc.id,
        patientId: 'pat_david',
        observationType: 'HEART_RATE',
        numericValue: -15,
        unit: 'bpm',
        userId: drSarahContext.user.id
      });
    } catch (e: any) {
      if (e instanceof ClinicalError && e.code === 'RANGE_VALIDATION_ERROR') {
        impossibleRangeRejected = true;
      }
    }
    if (!impossibleRangeRejected) {
      throw new Error('Negative heart rate (-15 bpm) was allowed without range rejection!');
    }

    let o2RangeRejected = false;
    try {
      await ClinicalService.recordObservation({
        organizationId: orgStJude.id,
        encounterId: enc.id,
        patientId: 'pat_david',
        observationType: 'OXYGEN_SATURATION',
        numericValue: 125,
        unit: '%',
        userId: drSarahContext.user.id
      });
    } catch (e: any) {
      if (e instanceof ClinicalError && e.code === 'RANGE_VALIDATION_ERROR') {
        o2RangeRejected = true;
      }
    }
    if (!o2RangeRejected) {
      throw new Error('Oxygen saturation of 125% was allowed without range rejection!');
    }

    results.push({ name: 'Phase 8 - Clinical Observations & Vital Signs Range and Explicit Unit Validation', passed: true });
  } catch (err: any) {
    results.push({ name: 'Phase 8 - Clinical Observations & Vital Signs Range and Explicit Unit Validation', passed: false, error: err.message });
  }

  // 8. Aggregated Longitudinal Patient Medical Record Retrieval
  try {
    const medicalRecord = await ClinicalService.getPatientMedicalRecord(
      orgStJude.id,
      'pat_david',
      drSarahContext.user.id
    );

    if (!medicalRecord.patient || medicalRecord.patient.id !== 'pat_david') {
      throw new Error('Medical record did not resolve correct patient identity');
    }

    if (!Array.isArray(medicalRecord.encounters) || !Array.isArray(medicalRecord.notes) || !Array.isArray(medicalRecord.observations)) {
      throw new Error('Medical record aggregates are missing encounters, notes, or observations arrays');
    }

    results.push({ name: 'Phase 8 - Aggregated Patient Longitudinal Medical Record Retrieval', passed: true });
  } catch (err: any) {
    results.push({ name: 'Phase 8 - Aggregated Patient Longitudinal Medical Record Retrieval', passed: false, error: err.message });
  }

  // 9. RBAC Gates: Receptionist & Billing Denied Clinical Notes & Medical Records
  try {
    // Receptionist check
    const receptionCanViewEncounter = AuthorizationService.hasPermission(receptionistElenaContext, Permissions.ENCOUNTER_VIEW);
    const receptionCanCreateEncounter = AuthorizationService.hasPermission(receptionistElenaContext, Permissions.ENCOUNTER_CREATE);
    const receptionCanViewNotes = AuthorizationService.hasPermission(receptionistElenaContext, Permissions.CLINICAL_NOTE_VIEW);
    const receptionCanViewMedRecord = AuthorizationService.hasPermission(receptionistElenaContext, Permissions.MEDICAL_RECORD_VIEW);

    if (!receptionCanViewEncounter || !receptionCanCreateEncounter) {
      throw new Error('Receptionist was improperly denied encounter view/create scheduling privileges');
    }
    if (receptionCanViewNotes || receptionCanViewMedRecord) {
      throw new Error('Receptionist was improperly granted confidential clinical note or medical record access!');
    }

    // Billing Staff check
    const billingCanViewEncounter = AuthorizationService.hasPermission(billingJamesContext, Permissions.ENCOUNTER_VIEW);
    const billingCanViewNotes = AuthorizationService.hasPermission(billingJamesContext, Permissions.CLINICAL_NOTE_VIEW);
    const billingCanViewMedRecord = AuthorizationService.hasPermission(billingJamesContext, Permissions.MEDICAL_RECORD_VIEW);

    if (billingCanViewEncounter || billingCanViewNotes || billingCanViewMedRecord) {
      throw new Error('Billing personnel were improperly granted clinical note, encounter, or medical record access!');
    }

    results.push({ name: 'Phase 8 - Role-Based Access Control: Receptionist & Billing Denied Clinical Notes & Records', passed: true });
  } catch (err: any) {
    results.push({ name: 'Phase 8 - Role-Based Access Control: Receptionist & Billing Denied Clinical Notes & Records', passed: false, error: err.message });
  }

  // 10. Sanitized Append-Only Audit Trail (Zero Raw Note Body or PHI Leakage)
  try {
    // Test that audit logs generated for clinical actions do NOT leak full note body
    const auditRes = await db.query(
      `SELECT * FROM audit_logs 
       WHERE action IN ('clinical_note.created', 'clinical_note.signed', 'clinical_note.amended')
       ORDER BY created_at DESC LIMIT 5`
    );

    for (const log of auditRes.rows) {
      const meta = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : (log.metadata || {});
      if (meta.chief_complaint || meta.history_of_present_illness || meta.assessment || meta.plan) {
        throw new Error(`Audit log entry ${log.id} leaked raw clinical narrative in metadata!`);
      }
    }

    results.push({ name: 'Phase 8 - Sanitized Audit Logging for Clinical Operations (Zero PHI Note Body Leakage)', passed: true });
  } catch (err: any) {
    results.push({ name: 'Phase 8 - Sanitized Audit Logging for Clinical Operations (Zero PHI Note Body Leakage)', passed: false, error: err.message });
  }

  return results;
}
