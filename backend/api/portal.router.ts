/**
 * CLINILYNC Patient Portal API Router
 * 
 * Provides patient-scoped endpoints. Patients can strictly only view or mutate
 * their own health information and released records.
 */

import { Router, Response } from 'express';
import crypto from 'node:crypto';
import { getDatabaseClient } from '../../database/db.js';
import { authenticateToken, AuthenticatedRequest, requirePatientAccount } from '../middleware/auth.js';
import { enforceTenantIsolation } from '../middleware/tenant.js';
import { AuditService } from '../security/audit.js';
import { Patient, ClinicalRecord, Appointment, Invoice } from '../types/domain.js';

export const portalRouter = Router();

portalRouter.use(authenticateToken);
portalRouter.use(requirePatientAccount);
portalRouter.use(enforceTenantIsolation);

// Helper to resolve linked patient record for authenticated user
async function getLinkedPatient(userId: string, orgId: string): Promise<Patient | null> {
  const db = getDatabaseClient();
  const res = await db.query<Patient>(
    'SELECT * FROM patients WHERE user_id = $1 AND organization_id = $2 AND is_active = TRUE',
    [userId, orgId]
  );
  return res.rows[0] || null;
}

// GET /api/portal/my-overview
portalRouter.get('/my-overview', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();

  const patient = await getLinkedPatient(context.user.id, context.activeOrganization.id);
  if (!patient) {
    res.status(404).json({
      error: { code: 'PATIENT_PROFILE_NOT_LINKED', message: 'No patient profile is associated with this account' }
    });
    return;
  }

  const [appointmentsRes, recordsRes, rxRes, vitalsRes] = await Promise.all([
    db.query<Appointment>(
      'SELECT * FROM appointments WHERE patient_id = $1 AND scheduled_time >= CURRENT_TIMESTAMP ORDER BY scheduled_time ASC LIMIT 2',
      [patient.id]
    ),
    db.query<ClinicalRecord>(
      'SELECT * FROM clinical_records WHERE patient_id = $1 AND is_finalized = TRUE ORDER BY encounter_date DESC LIMIT 3',
      [patient.id]
    ),
    db.query(
      'SELECT * FROM prescriptions WHERE patient_id = $1 AND status = $2 ORDER BY created_at DESC',
      [patient.id, 'ACTIVE']
    ),
    db.query(
      'SELECT * FROM vitals WHERE patient_id = $1 ORDER BY recorded_at DESC LIMIT 1',
      [patient.id]
    )
  ]);

  AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: 'PATIENT',
    action: 'portal.overview_viewed',
    resourceType: 'Patient',
    resourceId: patient.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    severity: 'INFO'
  });

  res.json({
    patient,
    nextAppointments: appointmentsRes.rows,
    recentEncounters: recordsRes.rows,
    activePrescriptions: rxRes.rows,
    latestVitals: vitalsRes.rows[0] || null
  });
});

// GET /api/portal/my-records - Released EMR notes & diagnoses
portalRouter.get('/my-records', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();

  const patient = await getLinkedPatient(context.user.id, context.activeOrganization.id);
  if (!patient) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Patient profile not found' } });
    return;
  }

  const [recordsRes, diagnosesRes, labRes] = await Promise.all([
    // Only records that are finalized/signed off are released to the patient portal
    db.query<ClinicalRecord>(
      'SELECT id, encounter_date, encounter_type, chief_complaint, assessment, plan, is_finalized FROM clinical_records WHERE patient_id = $1 AND is_finalized = TRUE ORDER BY encounter_date DESC',
      [patient.id]
    ),
    db.query(
      'SELECT * FROM diagnoses WHERE patient_id = $1 ORDER BY diagnosed_date DESC',
      [patient.id]
    ),
    db.query(
      'SELECT * FROM lab_orders WHERE patient_id = $1 AND status = $2 ORDER BY ordered_at DESC',
      [patient.id, 'COMPLETED']
    )
  ]);

  AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: 'PATIENT',
    action: 'portal.records_viewed',
    resourceType: 'ClinicalRecord',
    resourceId: patient.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    severity: 'INFO'
  });

  res.json({
    encounters: recordsRes.rows,
    diagnoses: diagnosesRes.rows,
    completedLabOrders: labRes.rows
  });
});

// GET /api/portal/my-appointments
portalRouter.get('/my-appointments', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();

  const patient = await getLinkedPatient(context.user.id, context.activeOrganization.id);
  if (!patient) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Patient profile not found' } });
    return;
  }

  const aptRes = await db.query<Appointment>(
    'SELECT * FROM appointments WHERE patient_id = $1 ORDER BY scheduled_time DESC',
    [patient.id]
  );

  res.json({ appointments: aptRes.rows });
});

// GET /api/portal/my-invoices
portalRouter.get('/my-invoices', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();

  const patient = await getLinkedPatient(context.user.id, context.activeOrganization.id);
  if (!patient) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Patient profile not found' } });
    return;
  }

  const invRes = await db.query<Invoice>(
    'SELECT * FROM invoices WHERE patient_id = $1 ORDER BY issue_date DESC',
    [patient.id]
  );

  res.json({ invoices: invRes.rows });
});
