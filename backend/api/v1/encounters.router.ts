/**
 * CLINILYNC Encounters API Router (v1)
 * 
 * Base path: /api/v1/encounters
 * 
 * Enforces:
 * 1. Multi-Tenant Organization Isolation
 * 2. Granular RBAC Permissions
 * 3. Lifecycle State Machine Validations
 * 4. Sanitized Audit Logging
 */

import { Router, Response } from 'express';
import { getDatabaseClient } from '../../../database/db.js';
import { authenticateToken, AuthenticatedRequest, requirePermission } from '../../middleware/auth.js';
import { Permissions } from '../../security/permissions.js';
import { Encounter, Patient, Provider, Appointment, ClinicalNote, ClinicalObservation } from '../../types/domain.js';
import { ClinicalService, ClinicalError } from '../../services/clinical.service.js';
import { DiagnosisService, DiagnosisError } from '../../services/diagnosis.service.js';
import { CarePlanService, CarePlanError } from '../../services/care-plan.service.js';

export const v1EncountersRouter = Router();

v1EncountersRouter.use(authenticateToken);

/**
 * GET /api/v1/encounters
 * List encounters for active organization with filters
 */
v1EncountersRouter.get('/', requirePermission(Permissions.ENCOUNTER_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { patientId, providerId, status, encounterType, startDate, endDate } = req.query;

  let query = `SELECT e.*, 
    p.first_name as patient_first_name, p.last_name as patient_last_name, p.mrn as patient_mrn,
    pr.display_name as provider_display_name, pr.title as provider_title, pr.last_name as provider_last_name
    FROM encounters e
    LEFT JOIN patients p ON e.patient_id = p.id
    LEFT JOIN providers pr ON e.provider_id = pr.id
    WHERE e.organization_id = $1`;
  const params: unknown[] = [context.activeOrganization.id];

  if (patientId) {
    params.push(String(patientId));
    query += ` AND e.patient_id = $${params.length}`;
  }

  if (providerId) {
    params.push(String(providerId));
    query += ` AND e.provider_id = $${params.length}`;
  }

  if (status && status !== 'ALL') {
    params.push(String(status).toUpperCase());
    query += ` AND e.status = $${params.length}`;
  }

  if (encounterType && encounterType !== 'ALL') {
    params.push(String(encounterType).toUpperCase());
    query += ` AND e.encounter_type = $${params.length}`;
  }

  if (startDate) {
    params.push(String(startDate));
    query += ` AND e.created_at >= $${params.length}`;
  }

  if (endDate) {
    params.push(String(endDate));
    query += ` AND e.created_at <= $${params.length}`;
  }

  query += ' ORDER BY e.created_at DESC LIMIT 100';

  const result = await db.query(query, params);

  res.json({
    data: {
      encounters: result.rows,
      total: result.rows.length
    }
  });
});

/**
 * POST /api/v1/encounters
 * Create a new clinical encounter
 */
v1EncountersRouter.post('/', requirePermission(Permissions.ENCOUNTER_CREATE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { patientId, providerId, appointmentId, encounterType, reasonForVisit, timezone } = req.body;

  if (!patientId || !providerId) {
    res.status(400).json({ error: { code: 'MISSING_REQUIRED_FIELDS', message: 'patientId and providerId are required.' } });
    return;
  }

  try {
    const encounter = await ClinicalService.createEncounter({
      organizationId: context.activeOrganization.id,
      patientId: String(patientId),
      providerId: String(providerId),
      appointmentId: appointmentId ? String(appointmentId) : null,
      encounterType,
      reasonForVisit,
      timezone,
      userId: context.user.id,
      userRole: context.roles[0]?.code,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(201).json({ data: { encounter } });
  } catch (err) {
    if (err instanceof ClinicalError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create encounter.' } });
  }
});

/**
 * GET /api/v1/encounters/:encounterId
 * Get encounter details
 */
v1EncountersRouter.get('/:encounterId', requirePermission(Permissions.ENCOUNTER_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { encounterId } = req.params;

  const encRes = await db.query<Encounter>(
    'SELECT * FROM encounters WHERE id = $1 AND organization_id = $2',
    [encounterId, context.activeOrganization.id]
  );

  if (!encRes.rows.length) {
    res.status(404).json({ error: { code: 'ENCOUNTER_NOT_FOUND', message: 'Encounter not found.' } });
    return;
  }

  const encounter = encRes.rows[0];

  // Fetch linked patient and provider details
  const [patRes, provRes, aptRes] = await Promise.all([
    db.query<Patient>('SELECT * FROM patients WHERE id = $1 AND organization_id = $2', [encounter.patient_id, context.activeOrganization.id]),
    db.query<Provider>('SELECT * FROM providers WHERE id = $1 AND organization_id = $2', [encounter.provider_id, context.activeOrganization.id]),
    encounter.appointment_id ? db.query<Appointment>('SELECT * FROM appointments WHERE id = $1 AND organization_id = $2', [encounter.appointment_id, context.activeOrganization.id]) : Promise.resolve({ rows: [] })
  ]);

  res.json({
    data: {
      encounter,
      patient: patRes.rows[0] || null,
      provider: provRes.rows[0] || null,
      appointment: aptRes.rows[0] || null
    }
  });
});

/**
 * PATCH /api/v1/encounters/:encounterId
 * Update editable encounter fields
 */
v1EncountersRouter.patch('/:encounterId', requirePermission(Permissions.ENCOUNTER_UPDATE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { encounterId } = req.params;
  const { reasonForVisit, encounterType } = req.body;

  const encRes = await db.query<Encounter>(
    'SELECT * FROM encounters WHERE id = $1 AND organization_id = $2',
    [encounterId, context.activeOrganization.id]
  );

  if (!encRes.rows.length) {
    res.status(404).json({ error: { code: 'ENCOUNTER_NOT_FOUND', message: 'Encounter not found.' } });
    return;
  }

  const encounter = encRes.rows[0];
  if (encounter.status === 'COMPLETED' || encounter.status === 'CANCELLED') {
    res.status(400).json({ error: { code: 'ENCOUNTER_IMMUTABLE', message: `Cannot modify encounter in final status ${encounter.status}.` } });
    return;
  }

  const timestamp = new Date().toISOString();
  const updatedRes = await db.query<Encounter>(
    `UPDATE encounters SET
      reason_for_visit = COALESCE($1, reason_for_visit),
      encounter_type = COALESCE($2, encounter_type),
      updated_by_user_id = $3,
      updated_at = $4
    WHERE id = $5 AND organization_id = $6
    RETURNING *`,
    [
      reasonForVisit !== undefined ? reasonForVisit : null,
      encounterType !== undefined ? encounterType : null,
      context.user.id,
      timestamp,
      encounterId,
      context.activeOrganization.id
    ]
  );

  res.json({ data: { encounter: updatedRes.rows[0] } });
});

/**
 * POST /api/v1/encounters/:encounterId/start
 * Transition encounter to IN_PROGRESS
 */
v1EncountersRouter.post('/:encounterId/start', requirePermission(Permissions.ENCOUNTER_UPDATE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { encounterId } = req.params;

  try {
    const encounter = await ClinicalService.transitionEncounterStatus(
      context.activeOrganization.id,
      encounterId,
      'IN_PROGRESS',
      context.user.id,
      context.roles[0]?.code,
      undefined,
      req.ip,
      req.get('user-agent')
    );
    res.json({ data: { encounter } });
  } catch (err) {
    if (err instanceof ClinicalError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to start encounter.' } });
  }
});

/**
 * POST /api/v1/encounters/:encounterId/complete
 * Transition encounter to COMPLETED
 */
v1EncountersRouter.post('/:encounterId/complete', requirePermission(Permissions.ENCOUNTER_COMPLETE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { encounterId } = req.params;

  try {
    const encounter = await ClinicalService.transitionEncounterStatus(
      context.activeOrganization.id,
      encounterId,
      'COMPLETED',
      context.user.id,
      context.roles[0]?.code,
      undefined,
      req.ip,
      req.get('user-agent')
    );
    res.json({ data: { encounter } });
  } catch (err) {
    if (err instanceof ClinicalError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to complete encounter.' } });
  }
});

/**
 * POST /api/v1/encounters/:encounterId/cancel
 * Cancel encounter
 */
v1EncountersRouter.post('/:encounterId/cancel', requirePermission(Permissions.ENCOUNTER_CANCEL), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { encounterId } = req.params;
  const { reason } = req.body;

  try {
    const encounter = await ClinicalService.transitionEncounterStatus(
      context.activeOrganization.id,
      encounterId,
      'CANCELLED',
      context.user.id,
      context.roles[0]?.code,
      reason,
      req.ip,
      req.get('user-agent')
    );
    res.json({ data: { encounter } });
  } catch (err) {
    if (err instanceof ClinicalError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to cancel encounter.' } });
  }
});

/**
 * GET /api/v1/encounters/:encounterId/notes
 * List clinical notes for an encounter
 */
v1EncountersRouter.get('/:encounterId/notes', requirePermission(Permissions.CLINICAL_NOTE_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { encounterId } = req.params;

  const encRes = await db.query<Encounter>(
    'SELECT * FROM encounters WHERE id = $1 AND organization_id = $2',
    [encounterId, context.activeOrganization.id]
  );
  if (!encRes.rows.length) {
    res.status(404).json({ error: { code: 'ENCOUNTER_NOT_FOUND', message: 'Encounter not found.' } });
    return;
  }

  const notesRes = await db.query<ClinicalNote>(
    'SELECT * FROM clinical_notes WHERE encounter_id = $1 AND organization_id = $2 ORDER BY created_at DESC',
    [encounterId, context.activeOrganization.id]
  );

  res.json({
    data: {
      notes: notesRes.rows,
      total: notesRes.rows.length
    }
  });
});

/**
 * POST /api/v1/encounters/:encounterId/notes
 * Create a new clinical note draft for an encounter
 */
v1EncountersRouter.post('/:encounterId/notes', requirePermission(Permissions.CLINICAL_NOTE_CREATE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { encounterId } = req.params;

  const encRes = await db.query<Encounter>(
    'SELECT * FROM encounters WHERE id = $1 AND organization_id = $2',
    [encounterId, context.activeOrganization.id]
  );
  if (!encRes.rows.length) {
    res.status(404).json({ error: { code: 'ENCOUNTER_NOT_FOUND', message: 'Encounter not found.' } });
    return;
  }
  const encounter = encRes.rows[0];

  try {
    const note = await ClinicalService.createDraftNote({
      organizationId: context.activeOrganization.id,
      encounterId,
      patientId: encounter.patient_id,
      noteType: req.body.noteType,
      chiefComplaint: req.body.chiefComplaint,
      historyOfPresentIllness: req.body.historyOfPresentIllness,
      pastMedicalHistory: req.body.pastMedicalHistory,
      surgicalHistory: req.body.surgicalHistory,
      familySocialHistory: req.body.familySocialHistory,
      reviewOfSystems: req.body.reviewOfSystems,
      physicalExamination: req.body.physicalExamination,
      assessment: req.body.assessment,
      plan: req.body.plan,
      followUpInstructions: req.body.followUpInstructions,
      userId: context.user.id,
      providerId: encounter.provider_id,
      userRole: context.roles[0]?.code,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(201).json({ data: { note } });
  } catch (err) {
    if (err instanceof ClinicalError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create clinical note.' } });
  }
});

/**
 * GET /api/v1/encounters/:encounterId/observations
 * List observations for an encounter
 */
v1EncountersRouter.get('/:encounterId/observations', requirePermission(Permissions.CLINICAL_OBSERVATION_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { encounterId } = req.params;

  const encRes = await db.query<Encounter>(
    'SELECT * FROM encounters WHERE id = $1 AND organization_id = $2',
    [encounterId, context.activeOrganization.id]
  );
  if (!encRes.rows.length) {
    res.status(404).json({ error: { code: 'ENCOUNTER_NOT_FOUND', message: 'Encounter not found.' } });
    return;
  }

  const obsRes = await db.query<ClinicalObservation>(
    'SELECT * FROM clinical_observations WHERE encounter_id = $1 AND organization_id = $2 ORDER BY measured_at DESC',
    [encounterId, context.activeOrganization.id]
  );

  res.json({
    data: {
      observations: obsRes.rows,
      total: obsRes.rows.length
    }
  });
});

/**
 * POST /api/v1/encounters/:encounterId/observations
 * Record an observation / vital sign for an encounter
 */
v1EncountersRouter.post('/:encounterId/observations', requirePermission(Permissions.CLINICAL_OBSERVATION_RECORD), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { encounterId } = req.params;
  const { observationType, numericValue, textValue, unit, notes, measuredAt } = req.body;

  if (!observationType || !unit) {
    res.status(400).json({ error: { code: 'MISSING_REQUIRED_FIELDS', message: 'observationType and unit are required.' } });
    return;
  }

  const encRes = await db.query<Encounter>(
    'SELECT * FROM encounters WHERE id = $1 AND organization_id = $2',
    [encounterId, context.activeOrganization.id]
  );
  if (!encRes.rows.length) {
    res.status(404).json({ error: { code: 'ENCOUNTER_NOT_FOUND', message: 'Encounter not found.' } });
    return;
  }
  const encounter = encRes.rows[0];

  try {
    const observation = await ClinicalService.recordObservation({
      organizationId: context.activeOrganization.id,
      encounterId,
      patientId: encounter.patient_id,
      observationType,
      numericValue,
      textValue,
      unit,
      notes,
      measuredAt,
      userId: context.user.id,
      userRole: context.roles[0]?.code,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(201).json({ data: { observation } });
  } catch (err) {
    if (err instanceof ClinicalError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to record clinical observation.' } });
  }
});

/**
 * GET /api/v1/encounters/:encounterId/diagnoses
 * List diagnoses recorded for this encounter
 */
v1EncountersRouter.get('/:encounterId/diagnoses', requirePermission(Permissions.DIAGNOSIS_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { encounterId } = req.params;

  try {
    const diagnoses = await DiagnosisService.getEncounterDiagnoses(
      context.activeOrganization.id,
      encounterId,
      context.user.id,
      context.roles[0]?.code
    );

    res.json({
      data: {
        diagnoses,
        total: diagnoses.length
      }
    });
  } catch (err) {
    if (err instanceof DiagnosisError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve encounter diagnoses.' } });
  }
});

/**
 * POST /api/v1/encounters/:encounterId/diagnoses
 * Record an encounter diagnosis
 */
v1EncountersRouter.post('/:encounterId/diagnoses', requirePermission(Permissions.DIAGNOSIS_RECORD), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { encounterId } = req.params;
  const {
    diagnosisCode,
    terminologySystem,
    terminologyVersion,
    displayName,
    description,
    diagnosisType,
    isPrimary,
    clinicalStatus,
    onsetDate,
    diagnosedDate
  } = req.body;

  const encRes = await db.query<Encounter>(
    'SELECT * FROM encounters WHERE id = $1 AND organization_id = $2',
    [encounterId, context.activeOrganization.id]
  );
  if (!encRes.rows.length) {
    res.status(404).json({ error: { code: 'ENCOUNTER_NOT_FOUND', message: 'Encounter not found.' } });
    return;
  }
  const encounter = encRes.rows[0];

  try {
    const diagnosis = await DiagnosisService.recordEncounterDiagnosis({
      organizationId: context.activeOrganization.id,
      patientId: encounter.patient_id,
      encounterId,
      diagnosisCode,
      terminologySystem,
      terminologyVersion,
      displayName,
      description,
      diagnosisType,
      isPrimary,
      clinicalStatus,
      onsetDate,
      diagnosedDate,
      userId: context.user.id,
      userRole: context.roles[0]?.code,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(201).json({ data: { diagnosis } });
  } catch (err) {
    if (err instanceof DiagnosisError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to record diagnosis.' } });
  }
});

/**
 * GET /api/v1/encounters/:encounterId/follow-up
 * Get follow-up instructions for an encounter
 */
v1EncountersRouter.get('/:encounterId/follow-up', requirePermission(Permissions.FOLLOW_UP_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { encounterId } = req.params;

  try {
    const followUps = await CarePlanService.getEncounterFollowUp(
      context.activeOrganization.id,
      encounterId,
      context.user.id,
      context.roles[0]?.code
    );

    res.json({
      data: {
        followUps,
        total: followUps.length
      }
    });
  } catch (err) {
    if (err instanceof CarePlanError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve follow-up instructions.' } });
  }
});

/**
 * POST /api/v1/encounters/:encounterId/follow-up
 * Record clinician-authored follow-up instructions
 */
v1EncountersRouter.post('/:encounterId/follow-up', requirePermission(Permissions.FOLLOW_UP_MANAGE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { encounterId } = req.params;
  const { carePlanId, timeframe, reassessmentDate, instructions, warningSigns, isPatientFacing } = req.body;

  const encRes = await db.query<Encounter>(
    'SELECT * FROM encounters WHERE id = $1 AND organization_id = $2',
    [encounterId, context.activeOrganization.id]
  );
  if (!encRes.rows.length) {
    res.status(404).json({ error: { code: 'ENCOUNTER_NOT_FOUND', message: 'Encounter not found.' } });
    return;
  }
  const encounter = encRes.rows[0];

  try {
    const followUp = await CarePlanService.recordFollowUp({
      organizationId: context.activeOrganization.id,
      patientId: encounter.patient_id,
      encounterId,
      carePlanId,
      timeframe,
      reassessmentDate,
      instructions,
      warningSigns,
      isPatientFacing,
      userId: context.user.id,
      userRole: context.roles[0]?.code,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(201).json({ data: { followUp } });
  } catch (err) {
    if (err instanceof CarePlanError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to record follow-up instructions.' } });
  }
});
