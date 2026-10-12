/**
 * CLINILYNC Clinical Documentation & Records Service
 * 
 * Provides:
 * 1. Healthcare encounter lifecycle state machine and verification.
 * 2. Clinician-authored clinical notes with optimistic locking, signing, and defensible amendment versioning.
 * 3. Clinical observations & vital signs recording with explicit units and physiological range validation.
 * 4. Longitudinal patient medical-record aggregation and sanitized audit logging.
 */

import crypto from 'node:crypto';
import { getDatabaseClient, IDatabaseClient } from '../../database/db.js';
import {
  Encounter,
  EncounterStatus,
  EncounterType,
  ClinicalNote,
  ClinicalNoteStatus,
  ClinicalNoteType,
  ClinicalNoteVersion,
  ClinicalObservation,
  ObservationStatus,
  Patient,
  Provider,
  Appointment,
  EncounterDiagnosis,
  PatientProblem,
  CarePlan,
  CarePlanItem,
  FollowUpInstruction
} from '../types/domain.js';
import { AuditService } from '../security/audit.js';

export class ClinicalError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = 'ClinicalError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export const VALID_ENCOUNTER_TRANSITIONS: Record<EncounterStatus, EncounterStatus[]> = {
  PLANNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: []
};

export interface CreateEncounterParams {
  organizationId: string;
  patientId: string;
  providerId: string;
  appointmentId?: string | null;
  encounterType?: EncounterType | string;
  reasonForVisit?: string | null;
  timezone?: string;
  userId: string;
  userRole?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface CreateNoteParams {
  organizationId: string;
  encounterId: string;
  patientId: string;
  noteType?: ClinicalNoteType | string;
  chiefComplaint?: string | null;
  historyOfPresentIllness?: string | null;
  pastMedicalHistory?: string | null;
  surgicalHistory?: string | null;
  familySocialHistory?: string | null;
  reviewOfSystems?: string | null;
  physicalExamination?: string | null;
  assessment?: string | null;
  plan?: string | null;
  followUpInstructions?: string | null;
  userId: string;
  providerId?: string | null;
  userRole?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface UpdateDraftNoteParams {
  organizationId: string;
  noteId: string;
  expectedVersion?: number;
  chiefComplaint?: string | null;
  historyOfPresentIllness?: string | null;
  pastMedicalHistory?: string | null;
  surgicalHistory?: string | null;
  familySocialHistory?: string | null;
  reviewOfSystems?: string | null;
  physicalExamination?: string | null;
  assessment?: string | null;
  plan?: string | null;
  followUpInstructions?: string | null;
  userId: string;
  userRole?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AmendNoteParams {
  organizationId: string;
  noteId: string;
  amendmentReason: string;
  chiefComplaint?: string | null;
  historyOfPresentIllness?: string | null;
  pastMedicalHistory?: string | null;
  surgicalHistory?: string | null;
  familySocialHistory?: string | null;
  reviewOfSystems?: string | null;
  physicalExamination?: string | null;
  assessment?: string | null;
  plan?: string | null;
  followUpInstructions?: string | null;
  userId: string;
  userRole?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface RecordObservationParams {
  organizationId: string;
  encounterId: string;
  patientId: string;
  observationType: string;
  numericValue?: number | null;
  textValue?: string | null;
  unit: string;
  notes?: string | null;
  measuredAt?: string;
  userId: string;
  userRole?: string;
  ipAddress?: string;
  userAgent?: string;
}

export class ClinicalService {
  /**
   * Create a new clinical encounter
   */
  static async createEncounter(params: CreateEncounterParams): Promise<Encounter> {
    const db = getDatabaseClient();

    // 1. Verify patient belongs to active organization and is active
    const patRes = await db.query<Patient>(
      'SELECT * FROM patients WHERE id = $1 AND organization_id = $2',
      [params.patientId, params.organizationId]
    );
    if (!patRes.rows.length) {
      throw new ClinicalError('PATIENT_NOT_FOUND', 'Patient record not found in active organization', 404);
    }
    const patient = patRes.rows[0];
    if (patient.status === 'ARCHIVED' || patient.status === 'DECEASED' || !patient.is_active) {
      throw new ClinicalError('PATIENT_INACTIVE', `Cannot create encounter for patient in status ${patient.status}`, 400);
    }

    // 2. Verify provider belongs to organization
    const provRes = await db.query<Provider>(
      'SELECT * FROM providers WHERE id = $1 AND organization_id = $2',
      [params.providerId, params.organizationId]
    );
    if (!provRes.rows.length) {
      throw new ClinicalError('PROVIDER_NOT_FOUND', 'Provider not found in active organization', 404);
    }
    const provider = provRes.rows[0];
    if (provider.status === 'ARCHIVED') {
      throw new ClinicalError('PROVIDER_INACTIVE', 'Provider is archived and cannot conduct encounters', 400);
    }

    // 3. If appointmentId is provided, verify it belongs to same patient & organization
    if (params.appointmentId) {
      const aptRes = await db.query<Appointment>(
        'SELECT * FROM appointments WHERE id = $1 AND organization_id = $2',
        [params.appointmentId, params.organizationId]
      );
      if (!aptRes.rows.length) {
        throw new ClinicalError('APPOINTMENT_NOT_FOUND', 'Linked appointment not found in active organization', 404);
      }
      const appointment = aptRes.rows[0];
      if (appointment.patient_id !== params.patientId) {
        throw new ClinicalError('APPOINTMENT_PATIENT_MISMATCH', 'Linked appointment belongs to a different patient', 400);
      }
    }

    const encounterId = `enc_${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    const encounterType = params.encounterType || 'IN_PERSON';
    const timezone = params.timezone || 'Europe/London';

    const insertRes = await db.query<Encounter>(
      `INSERT INTO encounters (
        id, organization_id, patient_id, provider_id, appointment_id,
        encounter_type, status, reason_for_visit, timezone,
        created_by_user_id, updated_by_user_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        encounterId,
        params.organizationId,
        params.patientId,
        params.providerId,
        params.appointmentId || null,
        encounterType,
        'PLANNED',
        params.reasonForVisit || null,
        timezone,
        params.userId,
        params.userId,
        timestamp,
        timestamp
      ]
    );

    const encounter = insertRes.rows[0];

    await AuditService.logEvent({
      organizationId: params.organizationId,
      actorId: params.userId,
      actorRole: params.userRole || 'CLINICIAN',
      action: 'encounter.created',
      resourceType: 'Encounter',
      resourceId: encounterId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: {
        patientId: params.patientId,
        providerId: params.providerId,
        encounterType,
        appointmentId: params.appointmentId
      }
    });

    return encounter;
  }

  /**
   * Transition encounter lifecycle status
   */
  static async transitionEncounterStatus(
    organizationId: string,
    encounterId: string,
    targetStatus: EncounterStatus,
    userId: string,
    userRole?: string,
    reason?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<Encounter> {
    const db = getDatabaseClient();

    const encRes = await db.query<Encounter>(
      'SELECT * FROM encounters WHERE id = $1 AND organization_id = $2',
      [encounterId, organizationId]
    );
    if (!encRes.rows.length) {
      throw new ClinicalError('ENCOUNTER_NOT_FOUND', 'Encounter not found in active organization', 404);
    }

    const encounter = encRes.rows[0];
    const currentStatus = encounter.status;

    if (currentStatus === targetStatus) {
      return encounter;
    }

    const allowed = VALID_ENCOUNTER_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(targetStatus)) {
      throw new ClinicalError(
        'INVALID_STATUS_TRANSITION',
        `Cannot transition encounter from ${currentStatus} to ${targetStatus}`,
        400
      );
    }

    const now = new Date().toISOString();
    let query = 'UPDATE encounters SET status = $1, updated_by_user_id = $2, updated_at = $3';
    const queryParams: unknown[] = [targetStatus, userId, now];

    if (targetStatus === 'IN_PROGRESS') {
      queryParams.push(now);
      query += `, started_at = COALESCE(started_at, $${queryParams.length})`;
    } else if (targetStatus === 'COMPLETED') {
      queryParams.push(now);
      query += `, completed_at = $${queryParams.length}, ended_at = COALESCE(ended_at, $${queryParams.length})`;
      queryParams.push(userId);
      query += `, completed_by_user_id = $${queryParams.length}`;
    } else if (targetStatus === 'CANCELLED') {
      queryParams.push(now);
      query += `, cancelled_at = $${queryParams.length}`;
      queryParams.push(userId);
      query += `, cancelled_by_user_id = $${queryParams.length}`;
      queryParams.push(reason || 'Cancelled by clinician');
      query += `, cancellation_reason = $${queryParams.length}`;
    }

    queryParams.push(encounterId);
    queryParams.push(organizationId);
    query += ` WHERE id = $${queryParams.length - 1} AND organization_id = $${queryParams.length} RETURNING *`;

    const updatedRes = await db.query<Encounter>(query, queryParams);
    const updated = updatedRes.rows[0];

    let auditAction = 'encounter.updated';
    if (targetStatus === 'IN_PROGRESS') auditAction = 'encounter.started';
    if (targetStatus === 'COMPLETED') auditAction = 'encounter.completed';
    if (targetStatus === 'CANCELLED') auditAction = 'encounter.cancelled';

    await AuditService.logEvent({
      organizationId,
      actorId: userId,
      actorRole: userRole || 'CLINICIAN',
      action: auditAction,
      resourceType: 'Encounter',
      resourceId: encounterId,
      ipAddress,
      userAgent,
      metadata: {
        previousStatus: currentStatus,
        newStatus: targetStatus,
        patientId: updated.patient_id,
        reason: reason || undefined
      }
    });

    return updated;
  }

  /**
   * Create a clinical note draft
   */
  static async createDraftNote(params: CreateNoteParams): Promise<ClinicalNote> {
    const db = getDatabaseClient();

    // Verify encounter exists in organization
    const encRes = await db.query<Encounter>(
      'SELECT * FROM encounters WHERE id = $1 AND organization_id = $2',
      [params.encounterId, params.organizationId]
    );
    if (!encRes.rows.length) {
      throw new ClinicalError('ENCOUNTER_NOT_FOUND', 'Encounter not found in active organization', 404);
    }
    const encounter = encRes.rows[0];
    if (encounter.status === 'CANCELLED') {
      throw new ClinicalError('ENCOUNTER_CANCELLED', 'Cannot author clinical notes for a cancelled encounter', 400);
    }

    const noteId = `note_${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    const noteType = params.noteType || 'PROGRESS_NOTE';

    const insertRes = await db.query<ClinicalNote>(
      `INSERT INTO clinical_notes (
        id, organization_id, encounter_id, patient_id, author_id, author_provider_id,
        note_type, status, version, chief_complaint, history_of_present_illness,
        past_medical_history, surgical_history, family_social_history,
        review_of_systems, physical_examination, assessment, plan, follow_up_instructions,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      RETURNING *`,
      [
        noteId,
        params.organizationId,
        params.encounterId,
        params.patientId,
        params.userId,
        params.providerId || null,
        noteType,
        'DRAFT',
        1,
        params.chiefComplaint || null,
        params.historyOfPresentIllness || null,
        params.pastMedicalHistory || null,
        params.surgicalHistory || null,
        params.familySocialHistory || null,
        params.reviewOfSystems || null,
        params.physicalExamination || null,
        params.assessment || null,
        params.plan || null,
        params.followUpInstructions || null,
        timestamp,
        timestamp
      ]
    );

    const note = insertRes.rows[0];

    await AuditService.logEvent({
      organizationId: params.organizationId,
      actorId: params.userId,
      actorRole: params.userRole || 'CLINICIAN',
      action: 'clinical_note.created',
      resourceType: 'ClinicalNote',
      resourceId: noteId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: {
        encounterId: params.encounterId,
        patientId: params.patientId,
        noteType,
        status: 'DRAFT',
        version: 1
      }
    });

    return note;
  }

  /**
   * Update a draft clinical note with optimistic concurrency protection
   */
  static async updateDraftNote(params: UpdateDraftNoteParams): Promise<ClinicalNote> {
    const db = getDatabaseClient();

    const noteRes = await db.query<ClinicalNote>(
      'SELECT * FROM clinical_notes WHERE id = $1 AND organization_id = $2',
      [params.noteId, params.organizationId]
    );
    if (!noteRes.rows.length) {
      throw new ClinicalError('NOTE_NOT_FOUND', 'Clinical note not found in active organization', 404);
    }
    const note = noteRes.rows[0];

    // If note is already signed or amended, direct overwrites are strictly disallowed!
    if (note.status !== 'DRAFT') {
      throw new ClinicalError(
        'NOTE_ALREADY_FINALIZED',
        `Signed notes cannot be directly edited (current status: ${note.status}). Use the clinical amendment workflow to record corrections.`,
        400
      );
    }

    // Optimistic concurrency check
    if (params.expectedVersion !== undefined && note.version !== params.expectedVersion) {
      throw new ClinicalError(
        'CONCURRENCY_CONFLICT',
        `Note version conflict (expected ${params.expectedVersion}, current ${note.version}). Another clinician has updated this draft. Please reload the document.`,
        409
      );
    }

    const timestamp = new Date().toISOString();

    const updatedRes = await db.query<ClinicalNote>(
      `UPDATE clinical_notes SET
        chief_complaint = COALESCE($1, chief_complaint),
        history_of_present_illness = COALESCE($2, history_of_present_illness),
        past_medical_history = COALESCE($3, past_medical_history),
        surgical_history = COALESCE($4, surgical_history),
        family_social_history = COALESCE($5, family_social_history),
        review_of_systems = COALESCE($6, review_of_systems),
        physical_examination = COALESCE($7, physical_examination),
        assessment = COALESCE($8, assessment),
        plan = COALESCE($9, plan),
        follow_up_instructions = COALESCE($10, follow_up_instructions),
        updated_at = $11
      WHERE id = $12 AND organization_id = $13 AND status = 'DRAFT'
      RETURNING *`,
      [
        params.chiefComplaint !== undefined ? params.chiefComplaint : null,
        params.historyOfPresentIllness !== undefined ? params.historyOfPresentIllness : null,
        params.pastMedicalHistory !== undefined ? params.pastMedicalHistory : null,
        params.surgicalHistory !== undefined ? params.surgicalHistory : null,
        params.familySocialHistory !== undefined ? params.familySocialHistory : null,
        params.reviewOfSystems !== undefined ? params.reviewOfSystems : null,
        params.physicalExamination !== undefined ? params.physicalExamination : null,
        params.assessment !== undefined ? params.assessment : null,
        params.plan !== undefined ? params.plan : null,
        params.followUpInstructions !== undefined ? params.followUpInstructions : null,
        timestamp,
        params.noteId,
        params.organizationId
      ]
    );

    const updated = updatedRes.rows[0];

    await AuditService.logEvent({
      organizationId: params.organizationId,
      actorId: params.userId,
      actorRole: params.userRole || 'CLINICIAN',
      action: 'clinical_note.updated',
      resourceType: 'ClinicalNote',
      resourceId: params.noteId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: {
        encounterId: updated.encounter_id,
        patientId: updated.patient_id,
        status: 'DRAFT',
        version: updated.version
      }
    });

    return updated;
  }

  /**
   * Clinically sign and finalize a note
   */
  static async signNote(
    organizationId: string,
    noteId: string,
    userId: string,
    userRole?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<ClinicalNote> {
    const db = getDatabaseClient();

    const noteRes = await db.query<ClinicalNote>(
      'SELECT * FROM clinical_notes WHERE id = $1 AND organization_id = $2',
      [noteId, organizationId]
    );
    if (!noteRes.rows.length) {
      throw new ClinicalError('NOTE_NOT_FOUND', 'Clinical note not found in active organization', 404);
    }
    const note = noteRes.rows[0];

    // Duplicate signing protection
    if (note.status === 'SIGNED') {
      return note;
    }
    if (note.status === 'AMENDED') {
      throw new ClinicalError('NOTE_ALREADY_AMENDED', 'Note has already been signed and amended.', 400);
    }

    const timestamp = new Date().toISOString();

    return await db.transaction<ClinicalNote>(async (tx) => {
      // 1. Update note status to SIGNED
      const updatedRes = await tx.query<ClinicalNote>(
        `UPDATE clinical_notes SET
          status = 'SIGNED',
          signed_at = $1,
          signed_by_user_id = $2,
          updated_at = $3
        WHERE id = $4 AND organization_id = $5 AND status = 'DRAFT'
        RETURNING *`,
        [timestamp, userId, timestamp, noteId, organizationId]
      );

      if (!updatedRes.rows.length) {
        throw new ClinicalError('CONCURRENCY_CONFLICT', 'Failed to lock draft note for signing. State may have changed.', 409);
      }
      const signedNote = updatedRes.rows[0];

      // 2. Snapshot into clinical_note_versions
      const versionId = `cnv_${crypto.randomUUID()}`;
      await tx.query(
        `INSERT INTO clinical_note_versions (
          id, note_id, organization_id, version_number, status, snapshot_data,
          author_id, signed_by_user_id, signed_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          versionId,
          signedNote.id,
          organizationId,
          signedNote.version,
          'SIGNED',
          JSON.stringify(signedNote),
          signedNote.author_id,
          userId,
          timestamp,
          timestamp
        ]
      );

      await AuditService.logEvent({
        organizationId,
        actorId: userId,
        actorRole: userRole || 'CLINICIAN',
        action: 'clinical_note.signed',
        resourceType: 'ClinicalNote',
        resourceId: noteId,
        ipAddress,
        userAgent,
        metadata: {
          encounterId: signedNote.encounter_id,
          patientId: signedNote.patient_id,
          version: signedNote.version,
          signerId: userId
        }
      });

      return signedNote;
    });
  }

  /**
   * Amend an already signed clinical note.
   * Preserves immutable signed history by archiving the previous version and creating an explicit amendment trail.
   */
  static async amendNote(params: AmendNoteParams): Promise<ClinicalNote> {
    const db = getDatabaseClient();

    if (!params.amendmentReason || !params.amendmentReason.trim()) {
      throw new ClinicalError('AMENDMENT_REASON_REQUIRED', 'A detailed clinical justification for amending signed documentation is required.', 400);
    }

    const noteRes = await db.query<ClinicalNote>(
      'SELECT * FROM clinical_notes WHERE id = $1 AND organization_id = $2',
      [params.noteId, params.organizationId]
    );
    if (!noteRes.rows.length) {
      throw new ClinicalError('NOTE_NOT_FOUND', 'Clinical note not found in active organization', 404);
    }
    const note = noteRes.rows[0];

    if (note.status === 'DRAFT') {
      throw new ClinicalError('NOTE_NOT_SIGNED', 'Cannot amend an unfinalized draft note. Save draft directly.', 400);
    }

    const timestamp = new Date().toISOString();
    const newVersion = note.version + 1;

    return await db.transaction<ClinicalNote>(async (tx) => {
      // 1. Archive current signed state into clinical_note_versions
      const versionId = `cnv_${crypto.randomUUID()}`;
      await tx.query(
        `INSERT INTO clinical_note_versions (
          id, note_id, organization_id, version_number, status, snapshot_data,
          author_id, signed_by_user_id, signed_at, amended_by_user_id, amended_at,
          amendment_reason, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          versionId,
          note.id,
          params.organizationId,
          note.version,
          note.status,
          JSON.stringify(note),
          note.author_id,
          note.signed_by_user_id || null,
          note.signed_at || null,
          params.userId,
          timestamp,
          params.amendmentReason.trim(),
          timestamp
        ]
      );

      // 2. Update note with amendment and incremented version
      const updatedRes = await tx.query<ClinicalNote>(
        `UPDATE clinical_notes SET
          version = $1,
          status = 'AMENDED',
          amended_from_note_id = $2,
          amendment_reason = $3,
          chief_complaint = COALESCE($4, chief_complaint),
          history_of_present_illness = COALESCE($5, history_of_present_illness),
          past_medical_history = COALESCE($6, past_medical_history),
          surgical_history = COALESCE($7, surgical_history),
          family_social_history = COALESCE($8, family_social_history),
          review_of_systems = COALESCE($9, review_of_systems),
          physical_examination = COALESCE($10, physical_examination),
          assessment = COALESCE($11, assessment),
          plan = COALESCE($12, plan),
          follow_up_instructions = COALESCE($13, follow_up_instructions),
          updated_at = $14
        WHERE id = $15 AND organization_id = $16
        RETURNING *`,
        [
          newVersion,
          note.id,
          params.amendmentReason.trim(),
          params.chiefComplaint !== undefined ? params.chiefComplaint : null,
          params.historyOfPresentIllness !== undefined ? params.historyOfPresentIllness : null,
          params.pastMedicalHistory !== undefined ? params.pastMedicalHistory : null,
          params.surgicalHistory !== undefined ? params.surgicalHistory : null,
          params.familySocialHistory !== undefined ? params.familySocialHistory : null,
          params.reviewOfSystems !== undefined ? params.reviewOfSystems : null,
          params.physicalExamination !== undefined ? params.physicalExamination : null,
          params.assessment !== undefined ? params.assessment : null,
          params.plan !== undefined ? params.plan : null,
          params.followUpInstructions !== undefined ? params.followUpInstructions : null,
          timestamp,
          note.id,
          params.organizationId
        ]
      );

      const amended = updatedRes.rows[0];

      await AuditService.logEvent({
        organizationId: params.organizationId,
        actorId: params.userId,
        actorRole: params.userRole || 'CLINICIAN',
        action: 'clinical_note.amended',
        resourceType: 'ClinicalNote',
        resourceId: params.noteId,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        metadata: {
          encounterId: amended.encounter_id,
          patientId: amended.patient_id,
          previousVersion: note.version,
          newVersion: amended.version,
          amendedBy: params.userId
        }
      });

      return amended;
    });
  }

  /**
   * Get version history for a clinical note
   */
  static async getNoteVersions(organizationId: string, noteId: string): Promise<ClinicalNoteVersion[]> {
    const db = getDatabaseClient();
    const res = await db.query<ClinicalNoteVersion>(
      'SELECT * FROM clinical_note_versions WHERE note_id = $1 AND organization_id = $2 ORDER BY version_number ASC',
      [noteId, organizationId]
    );
    return res.rows;
  }

  /**
   * Record clinical observation / vital sign with range validation and explicit units
   */
  static async recordObservation(params: RecordObservationParams): Promise<ClinicalObservation> {
    const db = getDatabaseClient();

    // 1. Verify encounter exists in organization
    const encRes = await db.query<Encounter>(
      'SELECT * FROM encounters WHERE id = $1 AND organization_id = $2',
      [params.encounterId, params.organizationId]
    );
    if (!encRes.rows.length) {
      throw new ClinicalError('ENCOUNTER_NOT_FOUND', 'Encounter not found in active organization', 404);
    }
    const encounter = encRes.rows[0];
    if (encounter.patient_id !== params.patientId) {
      throw new ClinicalError('PATIENT_ENCOUNTER_MISMATCH', 'Patient ID does not match encounter record', 400);
    }

    const obsType = params.observationType.toUpperCase();
    const unit = params.unit ? params.unit.trim() : '';

    if (!unit) {
      throw new ClinicalError('UNIT_REQUIRED', 'Explicit measurement unit must be provided', 400);
    }

    const numVal = params.numericValue !== undefined && params.numericValue !== null ? Number(params.numericValue) : null;

    // Validate physiological ranges
    if (numVal !== null) {
      if (isNaN(numVal)) {
        throw new ClinicalError('INVALID_NUMERIC_VALUE', 'Measurement value is not a valid number', 400);
      }

      switch (obsType) {
        case 'HEART_RATE':
          if (numVal <= 0 || numVal > 300) {
            throw new ClinicalError('RANGE_VALIDATION_ERROR', `Heart rate ${numVal} bpm is outside physiological range (1-300 bpm)`, 400);
          }
          break;
        case 'RESPIRATORY_RATE':
          if (numVal <= 0 || numVal > 120) {
            throw new ClinicalError('RANGE_VALIDATION_ERROR', `Respiratory rate ${numVal} is outside physiological range (1-120)`, 400);
          }
          break;
        case 'BLOOD_PRESSURE_SYSTOLIC':
          if (numVal <= 30 || numVal > 350) {
            throw new ClinicalError('RANGE_VALIDATION_ERROR', `Systolic pressure ${numVal} mmHg is outside physiological range (30-350 mmHg)`, 400);
          }
          break;
        case 'BLOOD_PRESSURE_DIASTOLIC':
          if (numVal <= 10 || numVal > 250) {
            throw new ClinicalError('RANGE_VALIDATION_ERROR', `Diastolic pressure ${numVal} mmHg is outside physiological range (10-250 mmHg)`, 400);
          }
          break;
        case 'OXYGEN_SATURATION':
          if (numVal < 0 || numVal > 100) {
            throw new ClinicalError('RANGE_VALIDATION_ERROR', `Oxygen saturation ${numVal}% is outside valid range (0-100%)`, 400);
          }
          break;
        case 'BODY_TEMPERATURE':
          if (unit.toLowerCase().includes('c')) {
            if (numVal < 25 || numVal > 46) {
              throw new ClinicalError('RANGE_VALIDATION_ERROR', `Body temperature ${numVal}°C is outside survivable range (25-46°C)`, 400);
            }
          } else if (unit.toLowerCase().includes('f')) {
            if (numVal < 77 || numVal > 115) {
              throw new ClinicalError('RANGE_VALIDATION_ERROR', `Body temperature ${numVal}°F is outside valid range (77-115°F)`, 400);
            }
          }
          break;
        case 'HEIGHT':
          if (numVal <= 10 || numVal > 300) {
            throw new ClinicalError('RANGE_VALIDATION_ERROR', `Height ${numVal} is outside valid human range (10-300 cm)`, 400);
          }
          break;
        case 'WEIGHT':
          if (numVal <= 0.2 || numVal > 600) {
            throw new ClinicalError('RANGE_VALIDATION_ERROR', `Weight ${numVal} is outside valid human range (0.2-600 kg)`, 400);
          }
          break;
        case 'BMI':
          if (numVal <= 5 || numVal > 120) {
            throw new ClinicalError('RANGE_VALIDATION_ERROR', `BMI ${numVal} is outside valid physiological range (5-120)`, 400);
          }
          break;
        case 'PAIN_SCORE':
          if (numVal < 0 || numVal > 10) {
            throw new ClinicalError('RANGE_VALIDATION_ERROR', `Pain score ${numVal} is outside scale range (0-10)`, 400);
          }
          break;
      }
    }

    const obsId = `obs_${crypto.randomUUID()}`;
    const timestamp = params.measuredAt || new Date().toISOString();
    const createdTimestamp = new Date().toISOString();

    const insertRes = await db.query<ClinicalObservation>(
      `INSERT INTO clinical_observations (
        id, organization_id, encounter_id, patient_id, recorded_by_user_id,
        observation_type, numeric_value, text_value, unit, status, notes,
        measured_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        obsId,
        params.organizationId,
        params.encounterId,
        params.patientId,
        params.userId,
        obsType,
        numVal,
        params.textValue || null,
        unit,
        'FINAL',
        params.notes || null,
        timestamp,
        createdTimestamp
      ]
    );

    const observation = {
      ...insertRes.rows[0],
      numeric_value: insertRes.rows[0]?.numeric_value == null
        ? insertRes.rows[0]?.numeric_value
        : Number(insertRes.rows[0].numeric_value)
    };

    await AuditService.logEvent({
      organizationId: params.organizationId,
      actorId: params.userId,
      actorRole: params.userRole || 'CLINICIAN',
      action: 'clinical_observation.recorded',
      resourceType: 'ClinicalObservation',
      resourceId: obsId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: {
        encounterId: params.encounterId,
        patientId: params.patientId,
        observationType: obsType,
        unit
      }
    });

    return observation;
  }

  /**
   * Aggregate longitudinal patient medical record
   */
  static async getPatientMedicalRecord(
    organizationId: string,
    patientId: string,
    userId: string,
    userRole?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{
    patient: Patient;
    encounters: Array<Encounter & { providerName?: string; notesCount?: number; observationsCount?: number }>;
    notes: ClinicalNote[];
    observations: ClinicalObservation[];
    diagnoses: EncounterDiagnosis[];
    problems: PatientProblem[];
    carePlans: Array<CarePlan & { items: CarePlanItem[] }>;
    followUps: FollowUpInstruction[];
  }> {
    const db = getDatabaseClient();

    // 1. Verify patient exists in organization
    const patRes = await db.query<Patient>(
      'SELECT * FROM patients WHERE id = $1 AND organization_id = $2',
      [patientId, organizationId]
    );
    if (!patRes.rows.length) {
      throw new ClinicalError('PATIENT_NOT_FOUND', 'Patient record not found in active organization', 404);
    }
    const patient = patRes.rows[0];

    // 2. Fetch encounters
    const encRes = await db.query<Encounter>(
      'SELECT * FROM encounters WHERE patient_id = $1 AND organization_id = $2 ORDER BY created_at DESC',
      [patientId, organizationId]
    );

    // 3. Fetch notes
    const notesRes = await db.query<ClinicalNote>(
      'SELECT * FROM clinical_notes WHERE patient_id = $1 AND organization_id = $2 ORDER BY created_at DESC',
      [patientId, organizationId]
    );

    // 4. Fetch observations
    const obsRes = await db.query<ClinicalObservation>(
      'SELECT * FROM clinical_observations WHERE patient_id = $1 AND organization_id = $2 ORDER BY measured_at DESC',
      [patientId, organizationId]
    );

    // 5. Fetch diagnoses
    const diagRes = await db.query<EncounterDiagnosis>(
      'SELECT * FROM encounter_diagnoses WHERE patient_id = $1 AND organization_id = $2 ORDER BY diagnosed_date DESC, created_at DESC',
      [patientId, organizationId]
    );

    // 6. Fetch longitudinal problem list
    const probRes = await db.query<PatientProblem>(
      'SELECT * FROM patient_problems WHERE patient_id = $1 AND organization_id = $2 ORDER BY status ASC, created_at DESC',
      [patientId, organizationId]
    );

    // 7. Fetch care plans & items
    const cpRes = await db.query<CarePlan>(
      'SELECT * FROM care_plans WHERE patient_id = $1 AND organization_id = $2 ORDER BY created_at DESC',
      [patientId, organizationId]
    );
    const cpiRes = await db.query<CarePlanItem>(
      'SELECT * FROM care_plan_items WHERE patient_id = $1 AND organization_id = $2 ORDER BY created_at ASC',
      [patientId, organizationId]
    );
    const carePlans = cpRes.rows.map(cp => ({
      ...cp,
      items: cpiRes.rows.filter(it => it.care_plan_id === cp.id)
    }));

    // 8. Fetch follow-up instructions
    const fupRes = await db.query<FollowUpInstruction>(
      'SELECT * FROM follow_up_instructions WHERE patient_id = $1 AND organization_id = $2 ORDER BY created_at DESC',
      [patientId, organizationId]
    );

    // Enrich encounters with counts
    const encounters = encRes.rows.map(enc => {
      const notesCount = notesRes.rows.filter(n => n.encounter_id === enc.id).length;
      const observationsCount = obsRes.rows.filter(o => o.encounter_id === enc.id).length;
      return {
        ...enc,
        notesCount,
        observationsCount
      };
    });

    await AuditService.logEvent({
      organizationId,
      actorId: userId,
      actorRole: userRole || 'CLINICIAN',
      action: 'medical_record.viewed',
      resourceType: 'Patient',
      resourceId: patientId,
      ipAddress,
      userAgent,
      metadata: {
        encountersCount: encounters.length,
        notesCount: notesRes.rows.length,
        observationsCount: obsRes.rows.length,
        diagnosesCount: diagRes.rows.length,
        problemsCount: probRes.rows.length,
        carePlansCount: carePlans.length
      }
    });

    return {
      patient,
      encounters,
      notes: notesRes.rows,
      observations: obsRes.rows,
      diagnoses: diagRes.rows,
      problems: probRes.rows,
      carePlans,
      followUps: fupRes.rows
    };
  }
}
