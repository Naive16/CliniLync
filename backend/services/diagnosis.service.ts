/**
 * CLINILYNC Diagnosis, Problem List & Terminology Service
 * 
 * Complies with Clinilync Phase 9 Specification:
 * 1. Encounter diagnoses linked to encounters with primary/secondary designation.
 * 2. Distinct longitudinal problem lists maintained over time with explicit promotion/resolution.
 * 3. Terminology catalog abstraction (ICD-10 standard reference concepts + clinician text).
 * 4. Multi-tenant isolation, granular RBAC gating, and sanitized audit logging.
 */

import crypto from 'node:crypto';
import { getDatabaseClient } from '../../database/db.js';
import {
  EncounterDiagnosis,
  PatientProblem,
  TerminologyConcept,
  DiagnosisType,
  DiagnosisClinicalStatus,
  ProblemStatus,
  Patient,
  Encounter
} from '../types/domain.js';
import { AuditService } from '../security/audit.js';

export class DiagnosisError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = 'DiagnosisError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface RecordEncounterDiagnosisParams {
  organizationId: string;
  patientId: string;
  encounterId: string;
  diagnosisCode?: string | null;
  terminologySystem?: string | null;
  terminologyVersion?: string | null;
  displayName: string;
  description?: string | null;
  diagnosisType?: DiagnosisType | string;
  isPrimary?: boolean;
  clinicalStatus?: DiagnosisClinicalStatus | string;
  onsetDate?: string | null;
  diagnosedDate?: string | null;
  userId: string;
  userRole?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AddProblemParams {
  organizationId: string;
  patientId: string;
  problemName: string;
  code?: string | null;
  terminologySystem?: string | null;
  status?: ProblemStatus | string;
  onsetDate?: string | null;
  encounterId?: string | null;
  userId: string;
  userRole?: string;
  ipAddress?: string;
  userAgent?: string;
}

export class DiagnosisService {
  /**
   * Search standardized terminology catalogue or return matching concepts
   */
  static async searchTerminology(system = 'ICD-10', query?: string): Promise<TerminologyConcept[]> {
    const db = getDatabaseClient();
    let sql = 'SELECT * FROM terminology_concepts WHERE system = $1 AND is_active = $2';
    const params: unknown[] = [system, true];

    if (query && query.trim()) {
      sql += ' AND (display_name ILIKE $3 OR code ILIKE $3)';
      params.push(`%${query.trim()}%`);
    }

    const res = await db.query<TerminologyConcept>(sql, params);
    return res.rows;
  }

  /**
   * Fetch diagnoses linked to an encounter
   */
  static async getEncounterDiagnoses(
    organizationId: string,
    encounterId: string,
    userId: string,
    userRole?: string
  ): Promise<EncounterDiagnosis[]> {
    const db = getDatabaseClient();

    // 1. Verify encounter belongs to organization
    const encRes = await db.query<Encounter>(
      'SELECT * FROM encounters WHERE id = $1 AND organization_id = $2',
      [encounterId, organizationId]
    );
    if (!encRes.rows.length) {
      throw new DiagnosisError('ENCOUNTER_NOT_FOUND', 'Encounter not found in active organization', 404);
    }

    const diagRes = await db.query<EncounterDiagnosis>(
      'SELECT * FROM encounter_diagnoses WHERE encounter_id = $1 AND organization_id = $2 ORDER BY is_primary DESC, created_at ASC',
      [encounterId, organizationId]
    );

    return diagRes.rows;
  }

  /**
   * Record a clinician-authored encounter diagnosis
   */
  static async recordEncounterDiagnosis(params: RecordEncounterDiagnosisParams): Promise<EncounterDiagnosis> {
    const db = getDatabaseClient();

    if (!params.displayName || !params.displayName.trim()) {
      throw new DiagnosisError('INVALID_DISPLAY_NAME', 'Diagnosis display name or assessment description is required', 400);
    }

    // 1. Verify encounter exists and belongs to organization
    const encRes = await db.query<Encounter>(
      'SELECT * FROM encounters WHERE id = $1 AND organization_id = $2',
      [params.encounterId, params.organizationId]
    );
    if (!encRes.rows.length) {
      throw new DiagnosisError('ENCOUNTER_NOT_FOUND', 'Encounter not found in active organization', 404);
    }
    const encounter = encRes.rows[0];

    // 2. Verify encounter patient matches provided patientId
    if (encounter.patient_id !== params.patientId) {
      throw new DiagnosisError('PATIENT_ENCOUNTER_MISMATCH', 'Patient does not match the encounter clinical record', 400);
    }

    // 3. Verify patient belongs to organization
    const patRes = await db.query<Patient>(
      'SELECT * FROM patients WHERE id = $1 AND organization_id = $2',
      [params.patientId, params.organizationId]
    );
    if (!patRes.rows.length) {
      throw new DiagnosisError('PATIENT_NOT_FOUND', 'Patient record not found in active organization', 404);
    }

    const isPrimary = Boolean(params.isPrimary);

    // If marked as primary, reset any previous primary diagnosis for this encounter
    if (isPrimary) {
      await db.query(
        'UPDATE encounter_diagnoses SET is_primary = $1 WHERE encounter_id = $2 AND organization_id = $3 AND is_primary = $4',
        [false, params.encounterId, params.organizationId, true]
      );
    }

    const diagId = `diag_${crypto.randomUUID().substring(0, 10)}`;
    const nowIso = new Date().toISOString();
    const diagnosedDate = params.diagnosedDate || nowIso.split('T')[0];
    const clinicalStatus = params.clinicalStatus || 'ACTIVE';
    const diagnosisType = params.diagnosisType || (isPrimary ? 'PRIMARY' : 'SECONDARY');

    const insertRes = await db.query<EncounterDiagnosis>(
      `INSERT INTO encounter_diagnoses (
        id, organization_id, patient_id, encounter_id, diagnosis_code,
        terminology_system, terminology_version, display_name, description,
        diagnosis_type, is_primary, clinical_status, onset_date, diagnosed_date,
        recorded_by_user_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        diagId,
        params.organizationId,
        params.patientId,
        params.encounterId,
        params.diagnosisCode || null,
        params.terminologySystem || 'ICD-10',
        params.terminologyVersion || '2026',
        params.displayName.trim(),
        params.description?.trim() || null,
        diagnosisType,
        isPrimary,
        clinicalStatus,
        params.onsetDate || null,
        diagnosedDate,
        params.userId,
        nowIso,
        nowIso
      ]
    );

    const diagnosis = insertRes.rows[0];

    await AuditService.logEvent({
      organizationId: params.organizationId,
      actorId: params.userId,
      actorRole: params.userRole || 'DOCTOR',
      action: 'diagnosis.recorded',
      resourceType: 'EncounterDiagnosis',
      resourceId: diagId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: {
        encounterId: params.encounterId,
        patientId: params.patientId,
        diagnosisCode: params.diagnosisCode,
        isPrimary,
        clinicalStatus
      }
    });

    return diagnosis;
  }

  /**
   * Update an existing encounter diagnosis
   */
  static async updateDiagnosis(params: {
    organizationId: string;
    diagnosisId: string;
    displayName?: string;
    description?: string | null;
    isPrimary?: boolean;
    clinicalStatus?: DiagnosisClinicalStatus | string;
    diagnosisType?: DiagnosisType | string;
    userId: string;
    userRole?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<EncounterDiagnosis> {
    const db = getDatabaseClient();

    const curRes = await db.query<EncounterDiagnosis>(
      'SELECT * FROM encounter_diagnoses WHERE id = $1 AND organization_id = $2',
      [params.diagnosisId, params.organizationId]
    );
    if (!curRes.rows.length) {
      throw new DiagnosisError('DIAGNOSIS_NOT_FOUND', 'Diagnosis not found in active organization', 404);
    }
    const current = curRes.rows[0];

    const isPrimary = params.isPrimary !== undefined ? Boolean(params.isPrimary) : current.is_primary;

    if (isPrimary && !current.is_primary) {
      // Demote existing primary for this encounter
      await db.query(
        'UPDATE encounter_diagnoses SET is_primary = $1 WHERE encounter_id = $2 AND organization_id = $3 AND is_primary = $4',
        [false, current.encounter_id, params.organizationId, true]
      );
    }

    const updatedDisplayName = params.displayName?.trim() || current.display_name;
    const updatedDescription = params.description !== undefined ? params.description : current.description;
    const updatedStatus = params.clinicalStatus || current.clinical_status;
    const updatedType = params.diagnosisType || current.diagnosis_type;
    const nowIso = new Date().toISOString();

    const upRes = await db.query<EncounterDiagnosis>(
      `UPDATE encounter_diagnoses 
       SET display_name = $1, description = $2, is_primary = $3, clinical_status = $4, diagnosis_type = $5, updated_at = $6
       WHERE id = $7 AND organization_id = $8
       RETURNING *`,
      [
        updatedDisplayName,
        updatedDescription,
        isPrimary,
        updatedStatus,
        updatedType,
        nowIso,
        params.diagnosisId,
        params.organizationId
      ]
    );

    const updated = upRes.rows[0];

    await AuditService.logEvent({
      organizationId: params.organizationId,
      actorId: params.userId,
      actorRole: params.userRole || 'DOCTOR',
      action: 'diagnosis.updated',
      resourceType: 'EncounterDiagnosis',
      resourceId: params.diagnosisId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: {
        isPrimary,
        clinicalStatus: updatedStatus
      }
    });

    return updated;
  }

  /**
   * Resolve an encounter diagnosis
   */
  static async resolveDiagnosis(params: {
    organizationId: string;
    diagnosisId: string;
    userId: string;
    userRole?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<EncounterDiagnosis> {
    return this.updateDiagnosis({
      organizationId: params.organizationId,
      diagnosisId: params.diagnosisId,
      clinicalStatus: 'RESOLVED',
      userId: params.userId,
      userRole: params.userRole,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent
    });
  }

  /**
   * Get longitudinal patient problems
   */
  static async getPatientProblems(
    organizationId: string,
    patientId: string,
    userId: string,
    userRole?: string
  ): Promise<PatientProblem[]> {
    const db = getDatabaseClient();

    const patRes = await db.query<Patient>(
      'SELECT * FROM patients WHERE id = $1 AND organization_id = $2',
      [patientId, organizationId]
    );
    if (!patRes.rows.length) {
      throw new DiagnosisError('PATIENT_NOT_FOUND', 'Patient record not found in active organization', 404);
    }

    const probRes = await db.query<PatientProblem>(
      'SELECT * FROM patient_problems WHERE patient_id = $1 AND organization_id = $2 ORDER BY status ASC, created_at DESC',
      [patientId, organizationId]
    );

    return probRes.rows;
  }

  /**
   * Add a problem to patient's longitudinal problem list
   */
  static async addPatientProblem(params: AddProblemParams): Promise<PatientProblem> {
    const db = getDatabaseClient();

    if (!params.problemName || !params.problemName.trim()) {
      throw new DiagnosisError('INVALID_PROBLEM_NAME', 'Problem name is required', 400);
    }

    // Verify patient
    const patRes = await db.query<Patient>(
      'SELECT * FROM patients WHERE id = $1 AND organization_id = $2',
      [params.patientId, params.organizationId]
    );
    if (!patRes.rows.length) {
      throw new DiagnosisError('PATIENT_NOT_FOUND', 'Patient record not found in active organization', 404);
    }

    // Verify optional encounter linkage
    if (params.encounterId) {
      const encRes = await db.query<Encounter>(
        'SELECT * FROM encounters WHERE id = $1 AND organization_id = $2 AND patient_id = $3',
        [params.encounterId, params.organizationId, params.patientId]
      );
      if (!encRes.rows.length) {
        throw new DiagnosisError('ENCOUNTER_NOT_FOUND', 'Linked encounter not found for patient in active organization', 404);
      }
    }

    const probId = `prob_${crypto.randomUUID().substring(0, 10)}`;
    const nowIso = new Date().toISOString();
    const status = params.status || 'ACTIVE';

    const insertRes = await db.query<PatientProblem>(
      `INSERT INTO patient_problems (
        id, organization_id, patient_id, problem_name, code, terminology_system,
        status, onset_date, encounter_id, recorded_by_user_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        probId,
        params.organizationId,
        params.patientId,
        params.problemName.trim(),
        params.code || null,
        params.terminologySystem || 'ICD-10',
        status,
        params.onsetDate || null,
        params.encounterId || null,
        params.userId,
        nowIso,
        nowIso
      ]
    );

    const problem = insertRes.rows[0];

    await AuditService.logEvent({
      organizationId: params.organizationId,
      actorId: params.userId,
      actorRole: params.userRole || 'DOCTOR',
      action: 'problem_list.entry_added',
      resourceType: 'PatientProblem',
      resourceId: probId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: {
        patientId: params.patientId,
        problemName: params.problemName.trim(),
        status
      }
    });

    return problem;
  }

  /**
   * Update longitudinal problem
   */
  static async updatePatientProblem(params: {
    organizationId: string;
    patientId: string;
    problemId: string;
    problemName?: string;
    status?: ProblemStatus | string;
    onsetDate?: string | null;
    userId: string;
    userRole?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<PatientProblem> {
    const db = getDatabaseClient();

    const curRes = await db.query<PatientProblem>(
      'SELECT * FROM patient_problems WHERE id = $1 AND patient_id = $2 AND organization_id = $3',
      [params.problemId, params.patientId, params.organizationId]
    );
    if (!curRes.rows.length) {
      throw new DiagnosisError('PROBLEM_NOT_FOUND', 'Patient problem not found in active organization', 404);
    }
    const current = curRes.rows[0];

    const updatedName = params.problemName?.trim() || current.problem_name;
    const updatedStatus = params.status || current.status;
    const updatedOnset = params.onsetDate !== undefined ? params.onsetDate : current.onset_date;
    const nowIso = new Date().toISOString();

    const upRes = await db.query<PatientProblem>(
      `UPDATE patient_problems
       SET problem_name = $1, status = $2, onset_date = $3, updated_at = $4
       WHERE id = $5 AND organization_id = $6
       RETURNING *`,
      [updatedName, updatedStatus, updatedOnset, nowIso, params.problemId, params.organizationId]
    );

    const updated = upRes.rows[0];

    await AuditService.logEvent({
      organizationId: params.organizationId,
      actorId: params.userId,
      actorRole: params.userRole || 'DOCTOR',
      action: 'problem_list.entry_updated',
      resourceType: 'PatientProblem',
      resourceId: params.problemId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: {
        patientId: params.patientId,
        status: updatedStatus
      }
    });

    return updated;
  }

  /**
   * Resolve longitudinal problem with resolution notes and resolution date
   */
  static async resolvePatientProblem(params: {
    organizationId: string;
    patientId: string;
    problemId: string;
    resolvedDate?: string | null;
    resolutionNotes?: string | null;
    userId: string;
    userRole?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<PatientProblem> {
    const db = getDatabaseClient();

    const curRes = await db.query<PatientProblem>(
      'SELECT * FROM patient_problems WHERE id = $1 AND patient_id = $2 AND organization_id = $3',
      [params.problemId, params.patientId, params.organizationId]
    );
    if (!curRes.rows.length) {
      throw new DiagnosisError('PROBLEM_NOT_FOUND', 'Patient problem not found in active organization', 404);
    }

    const nowIso = new Date().toISOString();
    const resolvedDate = params.resolvedDate || nowIso.split('T')[0];

    const upRes = await db.query<PatientProblem>(
      `UPDATE patient_problems
       SET status = $1, resolved_date = $2, resolution_notes = $3, reviewed_by_user_id = $4, reviewed_at = $5, updated_at = $6
       WHERE id = $7 AND organization_id = $8
       RETURNING *`,
      [
        'RESOLVED',
        resolvedDate,
        params.resolutionNotes?.trim() || null,
        params.userId,
        nowIso,
        nowIso,
        params.problemId,
        params.organizationId
      ]
    );

    const resolved = upRes.rows[0];

    await AuditService.logEvent({
      organizationId: params.organizationId,
      actorId: params.userId,
      actorRole: params.userRole || 'DOCTOR',
      action: 'problem_list.entry_resolved',
      resourceType: 'PatientProblem',
      resourceId: params.problemId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: {
        patientId: params.patientId,
        resolvedDate
      }
    });

    return resolved;
  }
}
