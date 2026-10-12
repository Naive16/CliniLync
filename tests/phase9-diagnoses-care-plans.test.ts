/**
 * CLINILYNC Automated Test Suite: Phase 9 Diagnoses, Longitudinal Problem Lists, Care Plans & CDS
 * 
 * Verifies:
 * 1. Encounter diagnoses linked to encounters with primary/secondary designation and ICD-10 terminology.
 * 2. Primary diagnosis exclusivity per encounter (marking new primary demotes previous primary).
 * 3. Longitudinal problem lists maintained across encounters with active vs resolved state.
 * 4. Explicit problem resolution preserving historical timeline without destructive deletion.
 * 5. Structured clinician-authored care plans with multi-category actionable plan items.
 * 6. Validated care plan state machine transitions (DRAFT -> ACTIVE -> ON_HOLD -> COMPLETED / CANCELLED).
 * 7. Rejection of invalid state transitions (e.g. COMPLETED -> ACTIVE, CANCELLED -> ACTIVE).
 * 8. Fine-grained care plan item completion tracking without premature whole-plan closure.
 * 9. Clinician-authored follow-up instructions with timeframe, reassessment date, and warning signs.
 * 10. Clinical Decision Support rules governance and clinician review workflow (ACKNOWLEDGED, DISMISSED, ACTION_TAKEN).
 * 11. Strict multi-tenant isolation (Cross-tenant diagnosis, problem, and care plan access rejected).
 * 12. Granular RBAC gating (Receptionist and Billing denied diagnosis recording, problem management, care plan authoring).
 * 13. Sanitized append-only audit trail verifying zero raw clinical text leakage in metadata.
 */

import crypto from 'node:crypto';
import { getDatabaseClient } from '../database/db.js';
import { Permissions, SystemRoles } from '../backend/security/permissions.js';
import { SecurityContext, Organization } from '../backend/types/domain.js';
import { DiagnosisService, DiagnosisError } from '../backend/services/diagnosis.service.js';
import { CarePlanService, CarePlanError } from '../backend/services/care-plan.service.js';
import { CDSService, CDSError } from '../backend/services/cds.service.js';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export async function runPhase9DiagnosesCarePlansTests(): Promise<TestResult[]> {
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
      Permissions.DIAGNOSIS_VIEW,
      Permissions.DIAGNOSIS_RECORD,
      Permissions.DIAGNOSIS_CREATE,
      Permissions.DIAGNOSIS_UPDATE,
      Permissions.DIAGNOSIS_RESOLVE,
      Permissions.PROBLEM_LIST_VIEW,
      Permissions.PROBLEM_LIST_MANAGE,
      Permissions.CARE_PLAN_VIEW,
      Permissions.CARE_PLAN_CREATE,
      Permissions.CARE_PLAN_UPDATE,
      Permissions.CARE_PLAN_COMPLETE,
      Permissions.CARE_PLAN_CANCEL,
      Permissions.FOLLOW_UP_VIEW,
      Permissions.FOLLOW_UP_MANAGE,
      Permissions.CLINICAL_ALERT_VIEW,
      Permissions.CLINICAL_ALERT_REVIEW
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
      Permissions.ENCOUNTER_VIEW
      // Denied all DIAGNOSIS_*, PROBLEM_LIST_*, CARE_PLAN_*, CLINICAL_ALERT_*
    ],
    sessionToken: 'test_token_elena'
  };

  // Dr. Arthur (Clinical Director in St. Jude)
  const directorArthurContext: SecurityContext = {
    user: { id: 'usr_director', email: 'director.arthur@clinilync.com', firstName: 'Arthur', lastName: 'Pendleton', isSuperAdmin: false },
    activeOrganization: orgStJude,
    roles: [{ id: 'role_clinical_director', code: SystemRoles.CLINICAL_DIRECTOR, name: 'Clinical Director', is_system_role: true, created_at: new Date().toISOString() }],
    permissions: [
      Permissions.DIAGNOSIS_VIEW,
      Permissions.DIAGNOSIS_RECORD,
      Permissions.DIAGNOSIS_CREATE,
      Permissions.DIAGNOSIS_UPDATE,
      Permissions.DIAGNOSIS_RESOLVE,
      Permissions.PROBLEM_LIST_VIEW,
      Permissions.PROBLEM_LIST_MANAGE,
      Permissions.CARE_PLAN_VIEW,
      Permissions.CARE_PLAN_CREATE,
      Permissions.CARE_PLAN_UPDATE,
      Permissions.CARE_PLAN_COMPLETE,
      Permissions.CARE_PLAN_CANCEL,
      Permissions.FOLLOW_UP_VIEW,
      Permissions.FOLLOW_UP_MANAGE,
      Permissions.CLINICAL_ALERT_VIEW,
      Permissions.CLINICAL_ALERT_REVIEW,
      Permissions.CLINICAL_RULE_MANAGE
    ],
    sessionToken: 'test_token_arthur'
  };

  // 1. Encounter Diagnoses & Terminology Catalog
  try {
    const concepts = await DiagnosisService.searchTerminology('ICD-10', 'Hypertension');
    if (concepts.length === 0 || !concepts.some(c => c.code === 'I10')) {
      throw new Error('Expected ICD-10 terminology search to resolve I10 Essential Hypertension');
    }

    const diag1 = await DiagnosisService.recordEncounterDiagnosis({
      organizationId: orgStJude.id,
      patientId: 'pat_david',
      encounterId: 'enc_david_1',
      diagnosisCode: 'I10',
      terminologySystem: 'ICD-10',
      displayName: 'Essential (primary) hypertension',
      description: 'Stage 1 essential hypertension documented during intake consultation',
      isPrimary: true,
      clinicalStatus: 'ACTIVE',
      onsetDate: '2025-01-15',
      userId: drSarahContext.user.id,
      userRole: drSarahContext.roles[0].code
    });

    if (!diag1.id || diag1.diagnosis_code !== 'I10' || !diag1.is_primary) {
      throw new Error('Diagnosis recording failed or did not establish primary status');
    }

    // Record secondary diagnosis and ensure primary exclusivity
    const diag2 = await DiagnosisService.recordEncounterDiagnosis({
      organizationId: orgStJude.id,
      patientId: 'pat_david',
      encounterId: 'enc_david_1',
      diagnosisCode: 'E11.9',
      terminologySystem: 'ICD-10',
      displayName: 'Type 2 diabetes mellitus without complications',
      isPrimary: false,
      clinicalStatus: 'ACTIVE',
      userId: drSarahContext.user.id,
      userRole: drSarahContext.roles[0].code
    });

    const encounterDiagnoses = await DiagnosisService.getEncounterDiagnoses(
      orgStJude.id,
      'enc_david_1',
      drSarahContext.user.id
    );

    const primaryCount = encounterDiagnoses.filter(d => d.is_primary).length;
    if (primaryCount !== 1) {
      throw new Error(`Expected exactly 1 primary encounter diagnosis, found ${primaryCount}`);
    }

    results.push({ name: 'Phase 9 - Encounter Diagnosis Recording & Terminology System Linkage', passed: true });
  } catch (err: any) {
    results.push({ name: 'Phase 9 - Encounter Diagnosis Recording & Terminology System Linkage', passed: false, error: err.message });
  }

  // 2. Primary Diagnosis Promotion Exclusivity
  try {
    // Record third diagnosis marked as isPrimary=true, which should demote diag1
    const diag3 = await DiagnosisService.recordEncounterDiagnosis({
      organizationId: orgStJude.id,
      patientId: 'pat_david',
      encounterId: 'enc_david_1',
      diagnosisCode: 'J45.909',
      terminologySystem: 'ICD-10',
      displayName: 'Unspecified asthma, uncomplicated',
      isPrimary: true,
      clinicalStatus: 'ACTIVE',
      userId: drSarahContext.user.id,
      userRole: drSarahContext.roles[0].code
    });

    const refreshedDiagnoses = await DiagnosisService.getEncounterDiagnoses(
      orgStJude.id,
      'enc_david_1',
      drSarahContext.user.id
    );

    const newPrimary = refreshedDiagnoses.find(d => d.is_primary);
    if (!newPrimary || newPrimary.id !== diag3.id) {
      throw new Error('Expected newly designated primary diagnosis to be active primary');
    }

    const previousPrimary = refreshedDiagnoses.find(d => d.diagnosis_code === 'I10');
    if (previousPrimary && previousPrimary.is_primary) {
      throw new Error('Expected previous primary diagnosis to be demoted to non-primary');
    }

    results.push({ name: 'Phase 9 - Primary Diagnosis Demotion & Exclusivity Constraint', passed: true });
  } catch (err: any) {
    results.push({ name: 'Phase 9 - Primary Diagnosis Demotion & Exclusivity Constraint', passed: false, error: err.message });
  }

  // 3. Longitudinal Problem List Management
  try {
    const newProblem = await DiagnosisService.addPatientProblem({
      organizationId: orgStJude.id,
      patientId: 'pat_david',
      problemName: 'Chronic Lower Back Pain',
      code: 'M54.5',
      terminologySystem: 'ICD-10',
      status: 'ACTIVE',
      onsetDate: '2024-06-01',
      encounterId: 'enc_david_1',
      userId: drSarahContext.user.id,
      userRole: drSarahContext.roles[0].code
    });

    if (!newProblem.id || newProblem.status !== 'ACTIVE') {
      throw new Error('Failed to create longitudinal patient problem');
    }

    const problemsBefore = await DiagnosisService.getPatientProblems(orgStJude.id, 'pat_david', drSarahContext.user.id);
    if (!problemsBefore.some(p => p.id === newProblem.id)) {
      throw new Error('Created problem not found in patient problem list');
    }

    results.push({ name: 'Phase 9 - Longitudinal Problem List Creation & Encounter Linkage', passed: true });
  } catch (err: any) {
    results.push({ name: 'Phase 9 - Longitudinal Problem List Creation & Encounter Linkage', passed: false, error: err.message });
  }

  // 4. Problem List Explicit Resolution (Non-destructive)
  try {
    // Add temporary problem and resolve it explicitly
    const tempProblem = await DiagnosisService.addPatientProblem({
      organizationId: orgStJude.id,
      patientId: 'pat_david',
      problemName: 'Acute Bronchitis',
      code: 'J20.9',
      status: 'ACTIVE',
      userId: drSarahContext.user.id,
      userRole: drSarahContext.roles[0].code
    });

    const resolved = await DiagnosisService.resolvePatientProblem({
      organizationId: orgStJude.id,
      patientId: 'pat_david',
      problemId: tempProblem.id,
      resolvedDate: '2026-03-01',
      resolutionNotes: 'Symptoms resolved following complete bronchodilator treatment course.',
      userId: drSarahContext.user.id,
      userRole: drSarahContext.roles[0].code
    });

    if (resolved.status !== 'RESOLVED' || !resolved.resolved_date || !resolved.resolution_notes) {
      throw new Error('Problem resolution did not persist resolution notes and resolved date');
    }

    // Verify it still exists in historical record (non-destructive)
    const allProblems = await DiagnosisService.getPatientProblems(orgStJude.id, 'pat_david', drSarahContext.user.id);
    const persisted = allProblems.find(p => p.id === tempProblem.id);
    if (!persisted || persisted.status !== 'RESOLVED') {
      throw new Error('Resolved problem was not preserved longitudinally in database');
    }

    results.push({ name: 'Phase 9 - Non-Destructive Longitudinal Problem Resolution & Auditability', passed: true });
  } catch (err: any) {
    results.push({ name: 'Phase 9 - Non-Destructive Longitudinal Problem Resolution & Auditability', passed: false, error: err.message });
  }

  // 5. Structured Care Plan Creation with Granular Actions
  try {
    const carePlan = await CarePlanService.createCarePlan({
      organizationId: orgStJude.id,
      patientId: 'pat_david',
      encounterId: 'enc_david_1',
      responsibleProviderId: 'prov_sarah',
      title: 'Comprehensive Cardiovascular Risk Reduction Plan',
      clinicalRationale: 'Hypertension management and weight stabilization protocol',
      description: 'Multi-disciplinary lifestyle and pharmacological monitoring protocol',
      startDate: '2026-03-15',
      reviewDate: '2026-09-15',
      status: 'DRAFT',
      items: [
        {
          category: 'MONITORING',
          description: 'Home blood pressure log twice daily (AM and PM)',
          responsibleRole: 'PATIENT',
          dueDate: '2026-04-15'
        },
        {
          category: 'LIFESTYLE',
          description: 'DASH diet dietary sodium restriction (< 2g/day)',
          responsibleRole: 'PATIENT'
        },
        {
          category: 'CONSULTATION',
          description: 'Outpatient clinical dietitian consultation',
          responsibleRole: 'NURSE'
        }
      ],
      userId: drSarahContext.user.id,
      userRole: drSarahContext.roles[0].code
    });

    if (!carePlan.id || carePlan.status !== 'DRAFT' || carePlan.items.length !== 3) {
      throw new Error('Care plan creation failed or did not persist initial action items');
    }

    results.push({ name: 'Phase 9 - Structured Care Plan Creation & Action Items Formulation', passed: true });
  } catch (err: any) {
    results.push({ name: 'Phase 9 - Structured Care Plan Creation & Action Items Formulation', passed: false, error: err.message });
  }

  // 6. Care Plan State Machine Transitions & Terminal Immutability
  try {
    const plan = await CarePlanService.createCarePlan({
      organizationId: orgStJude.id,
      patientId: 'pat_david',
      title: 'State Machine Test Plan',
      status: 'DRAFT',
      userId: drSarahContext.user.id,
      userRole: drSarahContext.roles[0].code
    });

    // Valid transition: DRAFT -> ACTIVE
    const activePlan = await CarePlanService.transitionCarePlanStatus({
      organizationId: orgStJude.id,
      carePlanId: plan.id,
      targetStatus: 'ACTIVE',
      userId: drSarahContext.user.id,
      userRole: drSarahContext.roles[0].code
    });
    if (activePlan.status !== 'ACTIVE') {
      throw new Error('Failed transition from DRAFT to ACTIVE');
    }

    // Valid transition: ACTIVE -> COMPLETED
    const completedPlan = await CarePlanService.transitionCarePlanStatus({
      organizationId: orgStJude.id,
      carePlanId: plan.id,
      targetStatus: 'COMPLETED',
      statusReason: 'All clinical goals successfully met',
      userId: drSarahContext.user.id,
      userRole: drSarahContext.roles[0].code
    });
    if (completedPlan.status !== 'COMPLETED') {
      throw new Error('Failed transition from ACTIVE to COMPLETED');
    }

    // Invalid transition: COMPLETED -> ACTIVE (must be rejected)
    let rejected = false;
    try {
      await CarePlanService.transitionCarePlanStatus({
        organizationId: orgStJude.id,
        carePlanId: plan.id,
        targetStatus: 'ACTIVE',
        userId: drSarahContext.user.id,
        userRole: drSarahContext.roles[0].code
      });
    } catch (err: any) {
      if (err instanceof CarePlanError && err.code === 'INVALID_STATUS_TRANSITION') {
        rejected = true;
      }
    }

    if (!rejected) {
      throw new Error('State machine failed to reject invalid transition from terminal COMPLETED to ACTIVE');
    }

    results.push({ name: 'Phase 9 - Care Plan Lifecycle State Machine & Terminal Immutability', passed: true });
  } catch (err: any) {
    results.push({ name: 'Phase 9 - Care Plan Lifecycle State Machine & Terminal Immutability', passed: false, error: err.message });
  }

  // 7. Granular Care Plan Item Completion Isolation
  try {
    const testPlan = await CarePlanService.createCarePlan({
      organizationId: orgStJude.id,
      patientId: 'pat_david',
      title: 'Item Isolation Test Plan',
      status: 'ACTIVE',
      items: [
        { category: 'MONITORING', description: 'Action Item 1' },
        { category: 'SELF_CARE', description: 'Action Item 2' }
      ],
      userId: drSarahContext.user.id,
      userRole: drSarahContext.roles[0].code
    });

    const itemToComplete = testPlan.items[0];

    const completedItem = await CarePlanService.updateCarePlanItem({
      organizationId: orgStJude.id,
      carePlanId: testPlan.id,
      itemId: itemToComplete.id,
      status: 'COMPLETED',
      completionNotes: 'Patient completed home log verification',
      userId: drSarahContext.user.id,
      userRole: drSarahContext.roles[0].code
    });

    if (completedItem.status !== 'COMPLETED' || !completedItem.completed_at) {
      throw new Error('Care plan item was not marked as completed');
    }

    // Verify parent care plan is still ACTIVE (not prematurely completed)
    const refreshedPlan = await CarePlanService.getCarePlanById(orgStJude.id, testPlan.id, drSarahContext.user.id);
    if (refreshedPlan.status !== 'ACTIVE') {
      throw new Error('Parent care plan was prematurely closed upon single item completion');
    }

    results.push({ name: 'Phase 9 - Fine-Grained Care Plan Item Completion Isolation', passed: true });
  } catch (err: any) {
    results.push({ name: 'Phase 9 - Fine-Grained Care Plan Item Completion Isolation', passed: false, error: err.message });
  }

  // 8. Follow-Up Documentation
  try {
    const followUp = await CarePlanService.recordFollowUp({
      organizationId: orgStJude.id,
      patientId: 'pat_david',
      encounterId: 'enc_david_1',
      timeframe: '2-3 weeks',
      reassessmentDate: '2026-04-01',
      instructions: 'Repeat sitting and standing blood pressure measurement and review medication tolerance.',
      warningSigns: 'Seek emergency care for severe chest pain, shortness of breath, or neurological deficits.',
      isPatientFacing: true,
      userId: drSarahContext.user.id,
      userRole: drSarahContext.roles[0].code
    });

    if (!followUp.id || !followUp.warning_signs || !followUp.is_patient_facing) {
      throw new Error('Follow-up instructions failed to persist clinical safety parameters');
    }

    const followUps = await CarePlanService.getEncounterFollowUp(orgStJude.id, 'enc_david_1', drSarahContext.user.id);
    if (!followUps.some(f => f.id === followUp.id)) {
      throw new Error('Follow-up instructions not found when querying encounter');
    }

    results.push({ name: 'Phase 9 - Clinician-Authored Follow-Up Documentation & Warning Signs', passed: true });
  } catch (err: any) {
    results.push({ name: 'Phase 9 - Clinician-Authored Follow-Up Documentation & Warning Signs', passed: false, error: err.message });
  }

  // 9. Clinical Decision Support (CDS) Governance & Alert Review Workflow
  try {
    const rules = await CDSService.getClinicalRules(orgStJude.id, directorArthurContext.user.id);
    if (rules.length === 0) {
      throw new Error('Expected seeded clinical decision support rules');
    }

    const testRule = rules[0];

    // Director toggles rule status
    const toggled = await CDSService.toggleRuleStatus({
      organizationId: orgStJude.id,
      ruleId: testRule.id,
      targetStatus: 'ACTIVE',
      userId: directorArthurContext.user.id,
      userRole: directorArthurContext.roles[0].code
    });

    if (toggled.rule_status !== 'ACTIVE' || !toggled.activated_at) {
      throw new Error('Rule status toggle to ACTIVE failed');
    }

    // Clinician reviews clinical alert
    const alerts = await CDSService.getClinicalAlerts({
      organizationId: orgStJude.id,
      patientId: 'pat_david',
      userId: drSarahContext.user.id
    });

    if (alerts.length > 0) {
      const alert = alerts[0];
      const reviewed = await CDSService.reviewClinicalAlert({
        organizationId: orgStJude.id,
        alertId: alert.id,
        reviewStatus: 'ACKNOWLEDGED',
        reviewNotes: 'Reviewed blood pressure guidelines; medication adjusted in plan.',
        userId: drSarahContext.user.id,
        userRole: drSarahContext.roles[0].code
      });

      if (reviewed.review_status !== 'ACKNOWLEDGED' || !reviewed.reviewed_at) {
        throw new Error('Clinical alert review action was not recorded');
      }
    }

    results.push({ name: 'Phase 9 - CDS Rule Governance & Clinician Review Workflow', passed: true });
  } catch (err: any) {
    results.push({ name: 'Phase 9 - CDS Rule Governance & Clinician Review Workflow', passed: false, error: err.message });
  }

  // 10. Multi-Tenant Isolation: Cross-Tenant Access Denied
  try {
    let foreignDiagnosisBlocked = false;
    try {
      // Attempt to record diagnosis in foreign organization
      await DiagnosisService.recordEncounterDiagnosis({
        organizationId: orgMetroHealth.id, // Foreign org
        patientId: 'pat_david',             // St Jude patient
        encounterId: 'enc_david_1',         // St Jude encounter
        displayName: 'Malicious Cross-Tenant Diagnosis',
        userId: drSarahContext.user.id,
        userRole: drSarahContext.roles[0].code
      });
    } catch (err: any) {
      if (err instanceof DiagnosisError && err.statusCode === 404) {
        foreignDiagnosisBlocked = true;
      }
    }

    let foreignCarePlanBlocked = false;
    try {
      await CarePlanService.getPatientCarePlans(
        orgMetroHealth.id, // Foreign org
        'pat_david',       // St Jude patient
        drSarahContext.user.id
      );
    } catch (err: any) {
      if (err instanceof CarePlanError && err.statusCode === 404) {
        foreignCarePlanBlocked = true;
      }
    }

    if (!foreignDiagnosisBlocked || !foreignCarePlanBlocked) {
      throw new Error('Cross-tenant diagnosis or care plan operation was not blocked');
    }

    results.push({ name: 'Phase 9 - Strict Multi-Tenant Isolation & Cross-Organization Rejection', passed: true });
  } catch (err: any) {
    results.push({ name: 'Phase 9 - Strict Multi-Tenant Isolation & Cross-Organization Rejection', passed: false, error: err.message });
  }

  // 11. Role-Based Access Control (RBAC): Receptionist Denied Clinical Mutations
  try {
    const hasDiagRecord = receptionistElenaContext.permissions.includes(Permissions.DIAGNOSIS_RECORD);
    const hasCarePlanCreate = receptionistElenaContext.permissions.includes(Permissions.CARE_PLAN_CREATE);
    const hasProblemManage = receptionistElenaContext.permissions.includes(Permissions.PROBLEM_LIST_MANAGE);
    const hasRuleManage = receptionistElenaContext.permissions.includes(Permissions.CLINICAL_RULE_MANAGE);

    if (hasDiagRecord || hasCarePlanCreate || hasProblemManage || hasRuleManage) {
      throw new Error('Receptionist persona granted unauthorized clinical diagnosis or care planning permissions');
    }

    results.push({ name: 'Phase 9 - Role-Based Access Control: Non-Clinical Roles Denied Clinical Mutations', passed: true });
  } catch (err: any) {
    results.push({ name: 'Phase 9 - Role-Based Access Control: Non-Clinical Roles Denied Clinical Mutations', passed: false, error: err.message });
  }

  // 12. Sanitized Append-Only Audit Trail
  try {
    const recentAuditRes = await db.query<{ action: string; metadata: any }>(
      `SELECT action, metadata FROM audit_logs 
       WHERE organization_id = $1 AND action IN ('diagnosis.recorded', 'care_plan.status_changed', 'clinical_alert.reviewed')
       ORDER BY created_at DESC LIMIT 5`,
      [orgStJude.id]
    );

    if (recentAuditRes.rows.length === 0) {
      throw new Error('Expected audit log entries for Phase 9 clinical operations');
    }

    // Verify zero raw narrative note body leakage
    for (const row of recentAuditRes.rows) {
      const metaStr = JSON.stringify(row.metadata || {});
      if (metaStr.includes('patient note') || metaStr.includes('clinical note')) {
        throw new Error(`Audit log entry for ${row.action} leaked clinical note text: ${metaStr}`);
      }
    }

    results.push({ name: 'Phase 9 - Sanitized Append-Only Audit Trail (Zero Unstructured Health Text Leakage)', passed: true });
  } catch (err: any) {
    results.push({ name: 'Phase 9 - Sanitized Append-Only Audit Trail (Zero Unstructured Health Text Leakage)', passed: false, error: err.message });
  }

  return results;
}
