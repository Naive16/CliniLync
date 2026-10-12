/**
 * CLINILYNC Clinical Domain API Router (Lightweight EMR)
 */

import { Router, Response } from 'express';
import crypto from 'node:crypto';
import { getDatabaseClient } from '../../database/db.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { enforceTenantIsolation } from '../middleware/tenant.js';
import { requirePermission } from '../middleware/require-permission.js';
import { Permissions } from '../security/permissions.js';
import { AuditService } from '../security/audit.js';
import { ClinicalRecord, Diagnosis, Allergy, Vitals } from '../types/domain.js';

export const clinicalRouter = Router();

clinicalRouter.use(authenticateToken);
clinicalRouter.use(enforceTenantIsolation);

// GET /api/clinical/records - List clinical records/encounters
clinicalRouter.get('/records', requirePermission(Permissions.CLINICAL_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const patientId = req.query.patientId as string;

  let query = 'SELECT * FROM clinical_records WHERE organization_id = $1';
  const params: unknown[] = [context.activeOrganization.id];

  if (patientId) {
    query += ' AND patient_id = $2';
    params.push(patientId);
  }

  query += ' ORDER BY encounter_date DESC';

  const result = await db.query<ClinicalRecord>(query, params);
  res.json({ records: result.rows, total: result.rows.length });
});

// POST /api/clinical/records - Create clinical SOAP encounter
clinicalRouter.post('/records', requirePermission(Permissions.CLINICAL_CREATE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const {
    patientId,
    providerId,
    appointmentId,
    encounterType,
    chiefComplaint,
    subjective,
    objective,
    assessment,
    plan
  } = req.body;

  if (!patientId || !chiefComplaint) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'patientId and chiefComplaint are required' } });
    return;
  }

  // Resolve clinician provider ID if not explicitly sent
  let effectiveProviderId = providerId;
  if (!effectiveProviderId) {
    const provRes = await db.query<{ id: string }>('SELECT id FROM providers WHERE user_id = $1 AND organization_id = $2', [
      context.user.id,
      context.activeOrganization.id
    ]);
    if (provRes.rows.length > 0) {
      effectiveProviderId = provRes.rows[0].id;
    } else {
      effectiveProviderId = 'prov_sarah';
    }
  }

  const recordId = `rec_${crypto.randomUUID().substring(0, 8)}`;
  const newRecord: ClinicalRecord = {
    id: recordId,
    organization_id: context.activeOrganization.id,
    patient_id: patientId,
    provider_id: effectiveProviderId,
    appointment_id: appointmentId || null,
    encounter_date: new Date().toISOString(),
    encounter_type: encounterType || 'OUTPATIENT_CONSULTATION',
    chief_complaint: chiefComplaint,
    subjective: subjective || null,
    objective: objective || null,
    assessment: assessment || null,
    plan: plan || null,
    is_finalized: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  await db.query(
    `INSERT INTO clinical_records 
      (id, organization_id, patient_id, provider_id, appointment_id, encounter_date, encounter_type, chief_complaint, subjective, objective, assessment, plan, is_finalized, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      newRecord.id,
      newRecord.organization_id,
      newRecord.patient_id,
      newRecord.provider_id,
      newRecord.appointment_id,
      newRecord.encounter_date,
      newRecord.encounter_type,
      newRecord.chief_complaint,
      newRecord.subjective,
      newRecord.objective,
      newRecord.assessment,
      newRecord.plan,
      false,
      newRecord.created_at,
      newRecord.updated_at
    ]
  );

  AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: context.roles.map(r => r.code).join(','),
    action: 'clinical.record_created',
    resourceType: 'ClinicalRecord',
    resourceId: newRecord.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata: { patientId, chiefComplaint },
    severity: 'INFO'
  });

  res.status(201).json({ record: newRecord });
});

// POST /api/clinical/records/:id/finalize - Sign-off and finalize clinical record
clinicalRouter.post('/records/:id/finalize', requirePermission(Permissions.CLINICAL_FINALIZE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const recordId = req.params.id;

  const existingRes = await db.query<ClinicalRecord>(
    'SELECT * FROM clinical_records WHERE id = $1 AND organization_id = $2',
    [recordId, context.activeOrganization.id]
  );

  if (existingRes.rows.length === 0) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Clinical record not found in this organization' } });
    return;
  }

  const record = existingRes.rows[0];
  if (record.is_finalized) {
    res.status(400).json({ error: { code: 'ALREADY_FINALIZED', message: 'Record has already been signed and finalized' } });
    return;
  }

  const now = new Date().toISOString();
  await db.query(
    'UPDATE clinical_records SET is_finalized = TRUE, finalized_at = $1, finalized_by = $2, updated_at = $3 WHERE id = $4',
    [now, context.user.id, now, recordId]
  );

  AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: context.roles.map(r => r.code).join(','),
    action: 'clinical.record_finalized',
    resourceType: 'ClinicalRecord',
    resourceId: recordId,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata: { patientId: record.patient_id, signedBy: `${context.user.firstName} ${context.user.lastName}` },
    severity: 'INFO'
  });

  res.json({
    success: true,
    record: { ...record, is_finalized: true, finalized_at: now, finalized_by: context.user.id, updated_at: now }
  });
});

// POST /api/clinical/prescriptions - Create e-prescription
clinicalRouter.post('/prescriptions', requirePermission(Permissions.PRESCRIPTION_CREATE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { patientId, medicationName, dosage, frequency, duration, quantity, instructions, refillsRemaining } = req.body;

  if (!patientId || !medicationName || !dosage) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'patientId, medicationName, and dosage are required' } });
    return;
  }

  const rxId = `rx_${crypto.randomUUID().substring(0, 8)}`;
  await db.query(
    `INSERT INTO prescriptions 
      (id, organization_id, patient_id, provider_id, medication_name, dosage, frequency, duration, quantity, refills_remaining, instructions, status, start_date, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      rxId,
      context.activeOrganization.id,
      patientId,
      'prov_sarah',
      medicationName,
      dosage,
      frequency || 'Once daily',
      duration || '30 days',
      Number(quantity) || 30,
      Number(refillsRemaining) || 0,
      instructions || null,
      'ACTIVE',
      new Date().toISOString().split('T')[0],
      new Date().toISOString()
    ]
  );

  AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: context.roles.map(r => r.code).join(','),
    action: 'prescription.created',
    resourceType: 'Prescription',
    resourceId: rxId,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata: { patientId, medicationName, dosage },
    severity: 'INFO'
  });

  res.status(201).json({ success: true, prescriptionId: rxId });
});

// POST /api/clinical/vitals - Record patient vitals
clinicalRouter.post('/vitals', requirePermission(Permissions.CLINICAL_CREATE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { patientId, systolicBp, diastolicBp, heartRate, respiratoryRate, temperatureCelsius, oxygenSaturation, weightKg, heightCm } = req.body;

  if (!patientId) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'patientId is required' } });
    return;
  }

  let bmi: number | null = null;
  if (weightKg && heightCm) {
    const heightM = Number(heightCm) / 100;
    bmi = Number((Number(weightKg) / (heightM * heightM)).toFixed(1));
  }

  const vitId = `vit_${crypto.randomUUID().substring(0, 8)}`;
  await db.query(
    `INSERT INTO vitals 
      (id, organization_id, patient_id, recorded_by, systolic_bp, diastolic_bp, heart_rate, respiratory_rate, temperature_celsius, oxygen_saturation, weight_kg, height_cm, bmi, recorded_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      vitId,
      context.activeOrganization.id,
      patientId,
      context.user.id,
      systolicBp ? Number(systolicBp) : null,
      diastolicBp ? Number(diastolicBp) : null,
      heartRate ? Number(heartRate) : null,
      respiratoryRate ? Number(respiratoryRate) : null,
      temperatureCelsius ? Number(temperatureCelsius) : null,
      oxygenSaturation ? Number(oxygenSaturation) : null,
      weightKg ? Number(weightKg) : null,
      heightCm ? Number(heightCm) : null,
      bmi,
      new Date().toISOString()
    ]
  );

  AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: context.roles.map(r => r.code).join(','),
    action: 'clinical.vitals_recorded',
    resourceType: 'Vitals',
    resourceId: vitId,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata: { patientId, bp: `${systolicBp}/${diastolicBp}` },
    severity: 'INFO'
  });

  res.status(201).json({ success: true, vitalsId: vitId });
});
