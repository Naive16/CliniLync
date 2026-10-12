/**
 * CLINILYNC Patients API Router
 */

import { Router, Response } from 'express';
import crypto from 'node:crypto';
import { getDatabaseClient } from '../../database/db.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { enforceTenantIsolation } from '../middleware/tenant.js';
import { requirePermission } from '../middleware/require-permission.js';
import { Permissions } from '../security/permissions.js';
import { ResourceAccessService } from '../security/resource-access.js';
import { AuditService } from '../security/audit.js';
import { Patient, ClinicalRecord, Diagnosis, Allergy, Vitals } from '../types/domain.js';

export const patientsRouter = Router();

patientsRouter.use(authenticateToken);
patientsRouter.use(enforceTenantIsolation);

// GET /api/patients - List patients in current organization
patientsRouter.get('/', requirePermission(Permissions.PATIENT_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const search = req.query.search as string;

  let query = 'SELECT * FROM patients WHERE organization_id = $1 AND is_active = TRUE';
  const params: unknown[] = [context.activeOrganization.id];

  const result = await db.query<Patient>(query, params);
  let rows = result.rows;

  if (search) {
    const s = search.toLowerCase();
    rows = rows.filter(p => 
      p.first_name.toLowerCase().includes(s) || 
      p.last_name.toLowerCase().includes(s) || 
      p.mrn.toLowerCase().includes(s) ||
      (p.email && p.email.toLowerCase().includes(s))
    );
  }

  // Audit read of PHI list
  AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: context.roles.map(r => r.code).join(','),
    action: 'patient.list_viewed',
    resourceType: 'PatientList',
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata: { search: search || null, resultCount: rows.length },
    severity: 'INFO'
  });

  res.json({ patients: rows, total: rows.length });
});

// GET /api/patients/:id - Patient details with clinical summary
patientsRouter.get('/:id', requirePermission(Permissions.PATIENT_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const patientId = req.params.id;
  const db = getDatabaseClient();

  const patientRes = await db.query<Patient>(
    'SELECT * FROM patients WHERE id = $1',
    [patientId]
  );

  if (patientRes.rows.length === 0) {
    res.status(404).json({ error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found' } });
    return;
  }

  const patient = patientRes.rows[0];

  // Resource-Level Access Control Check
  try {
    ResourceAccessService.assertResourceAccess({
      context,
      resourceType: 'Patient',
      resourceId: patient.id,
      resourceOrganizationId: patient.organization_id,
      patientId: patient.id
    });
  } catch (err) {
    AuditService.logEvent({
      organizationId: context.activeOrganization.id,
      actorId: context.user.id,
      action: 'security.resource_access_denied',
      resourceType: 'Patient',
      resourceId: patient.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { attemptedPatientOrg: patient.organization_id },
      severity: 'CRITICAL'
    });

    res.status(403).json({
      error: { code: 'FORBIDDEN_RESOURCE_ACCESS', message: (err as Error).message }
    });
    return;
  }

  // Fetch linked clinical summary
  const [encounters, diagnoses, allergies, vitals] = await Promise.all([
    db.query<ClinicalRecord>('SELECT * FROM clinical_records WHERE patient_id = $1 ORDER BY encounter_date DESC', [patient.id]),
    db.query<Diagnosis>('SELECT * FROM diagnoses WHERE patient_id = $1 ORDER BY diagnosed_date DESC', [patient.id]),
    db.query<Allergy>('SELECT * FROM allergies WHERE patient_id = $1', [patient.id]),
    db.query<Vitals>('SELECT * FROM vitals WHERE patient_id = $1 ORDER BY recorded_at DESC LIMIT 5', [patient.id])
  ]);

  AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: context.roles.map(r => r.code).join(','),
    action: 'patient.record_viewed',
    resourceType: 'Patient',
    resourceId: patient.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata: { mrn: patient.mrn },
    severity: 'INFO'
  });

  res.json({
    patient,
    clinicalSummary: {
      encounters: encounters.rows,
      diagnoses: diagnoses.rows,
      allergies: allergies.rows,
      recentVitals: vitals.rows
    }
  });
});

// POST /api/patients - Register new patient intake
patientsRouter.post('/', requirePermission(Permissions.PATIENT_CREATE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const {
    firstName,
    lastName,
    dateOfBirth,
    gender,
    bloodGroup,
    email,
    phone,
    addressLine1,
    city,
    postalCode,
    emergencyContactName,
    emergencyContactPhone,
    allergiesSummary,
    primaryProviderId
  } = req.body;

  if (!firstName || !lastName || !dateOfBirth || !gender) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'First name, last name, date of birth, and gender are required' }
    });
    return;
  }

  const patientId = `pat_${crypto.randomUUID().substring(0, 8)}`;
  const mrn = `MRN-${Math.floor(10000 + Math.random() * 90000)}`;

  const newPatient: Patient = {
    id: patientId,
    organization_id: context.activeOrganization.id,
    mrn,
    first_name: firstName,
    last_name: lastName,
    date_of_birth: dateOfBirth,
    gender,
    blood_group: bloodGroup || null,
    email: email || null,
    phone: phone || null,
    address_line1: addressLine1 || null,
    city: city || null,
    postal_code: postalCode || null,
    emergency_contact_name: emergencyContactName || null,
    emergency_contact_phone: emergencyContactPhone || null,
    allergies_summary: allergiesSummary || null,
    primary_provider_id: primaryProviderId || null,
    status: 'ACTIVE',
    is_active: true,
    preferred_language: 'en',
    contact_preference: 'EMAIL',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  await db.query(
    `INSERT INTO patients 
      (id, organization_id, mrn, first_name, last_name, date_of_birth, gender, blood_group, email, phone, address_line1, city, postal_code, emergency_contact_name, emergency_contact_phone, allergies_summary, primary_provider_id, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
    [
      newPatient.id,
      newPatient.organization_id,
      newPatient.mrn,
      newPatient.first_name,
      newPatient.last_name,
      newPatient.date_of_birth,
      newPatient.gender,
      newPatient.blood_group,
      newPatient.email,
      newPatient.phone,
      newPatient.address_line1,
      newPatient.city,
      newPatient.postal_code,
      newPatient.emergency_contact_name,
      newPatient.emergency_contact_phone,
      newPatient.allergies_summary,
      newPatient.primary_provider_id,
      newPatient.is_active,
      newPatient.created_at,
      newPatient.updated_at
    ]
  );

  AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: context.roles.map(r => r.code).join(','),
    action: 'patient.created',
    resourceType: 'Patient',
    resourceId: newPatient.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata: { mrn: newPatient.mrn, name: `${firstName} ${lastName}` },
    severity: 'INFO'
  });

  res.status(201).json({ patient: newPatient });
});
