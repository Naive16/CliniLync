/**
 * CLINILYNC Version 1 (v1) Patients API Router
 * 
 * Base path: /api/v1/patients
 * 
 * Enforces:
 * 1. Strict Multi-Tenant Organization Isolation
 * 2. Centralized RBAC and RLAC Permission Gates
 * 3. Immutable HIPAA/GDPR Server-Side Audit Logging
 * 4. Input Validation & Data Integrity
 * 5. Structured Demographic, Emergency Contact, and Consent Modeling
 */

import { Router, Response } from 'express';
import crypto from 'node:crypto';
import { getDatabaseClient } from '../../../database/db.js';
import { authenticateToken, AuthenticatedRequest, requirePermission } from '../../middleware/auth.js';
import { Permissions } from '../../security/permissions.js';
import { ResourceAccessService } from '../../security/resource-access.js';
import { AuditService } from '../../security/audit.js';
import { Patient, PatientContact, PatientConsent, ClinicalObservation } from '../../types/domain.js';
import { ClinicalService, ClinicalError } from '../../services/clinical.service.js';
import { DiagnosisService, DiagnosisError } from '../../services/diagnosis.service.js';
import { CarePlanService, CarePlanError } from '../../services/care-plan.service.js';

export const v1PatientsRouter = Router();

// Enforce authentication on all patient routes
v1PatientsRouter.use(authenticateToken);

/**
 * Helper: Validate date string (YYYY-MM-DD)
 */
function isValidDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  // Cannot be in the future
  const now = new Date();
  if (d > now) return false;
  // Cannot be unreasonably in the past (> 130 years)
  if (now.getFullYear() - d.getFullYear() > 130) return false;
  return true;
}

/**
 * Helper: Validate email format
 */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * GET /api/v1/patients
 * List patients in active organization with permission-aware search and pagination
 */
v1PatientsRouter.get('/', requirePermission(Permissions.PATIENT_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();

  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const statusFilter = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : 'ACTIVE';
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));

  // Base query strictly filtered to user's active organization
  const query = 'SELECT * FROM patients WHERE organization_id = $1 ORDER BY created_at DESC';
  const result = await db.query<Patient>(query, [context.activeOrganization.id]);

  let rows = result.rows;

  // Apply lifecycle status filter unless ALL requested
  if (statusFilter !== 'ALL') {
    rows = rows.filter(p => (p.status || (p.is_active ? 'ACTIVE' : 'INACTIVE')) === statusFilter);
  }

  // Apply search across full name, MRN, email, phone
  if (search) {
    const s = search.toLowerCase();
    rows = rows.filter(p => 
      p.first_name.toLowerCase().includes(s) || 
      p.last_name.toLowerCase().includes(s) || 
      `${p.first_name.toLowerCase()} ${p.last_name.toLowerCase()}`.includes(s) ||
      p.mrn.toLowerCase().includes(s) ||
      (p.email && p.email.toLowerCase().includes(s)) ||
      (p.phone && p.phone.toLowerCase().includes(s))
    );
  }

  const total = rows.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const startIndex = (page - 1) * limit;
  const paginatedPatients = rows.slice(startIndex, startIndex + limit);

  // Server-side audit logging
  AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: context.roles.map(r => r.code).join(','),
    action: 'patient.list_viewed',
    resourceType: 'PatientList',
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata: {
      search: search || null,
      statusFilter,
      totalMatches: total,
      page,
      limit
    },
    severity: 'INFO'
  });

  res.json({
    data: {
      patients: paginatedPatients,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    }
  });
});

/**
 * GET /api/v1/patients/:id
 * Retrieve patient profile, contacts, and consents with tenant isolation verification
 */
v1PatientsRouter.get('/:id', requirePermission(Permissions.PATIENT_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const patientId = req.params.id;
  const db = getDatabaseClient();

  const patientRes = await db.query<Patient>(
    'SELECT * FROM patients WHERE id = $1',
    [patientId]
  );

  // Return generic 404 if not found OR belongs to another organization (no tenant enumeration)
  if (patientRes.rows.length === 0) {
    res.status(404).json({ error: { code: 'PATIENT_NOT_FOUND', message: 'Patient record not found' } });
    return;
  }

  const patient = patientRes.rows[0];

  // Enforce tenant boundary
  if ( patient.organization_id !== context.activeOrganization.id) {
    AuditService.logEvent({
      organizationId: context.activeOrganization.id,
      actorId: context.user.id,
      actorRole: context.roles.map(r => r.code).join(','),
      action: 'security.cross_tenant_access_attempt',
      resourceType: 'Patient',
      resourceId: patient.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        targetOrganizationId: patient.organization_id,
        userActiveOrgId: context.activeOrganization.id
      },
      severity: 'CRITICAL'
    });

    res.status(403).json({
      error: { code: 'FORBIDDEN_ORGANIZATION_ACCESS', message: 'Access denied: Patient belongs to another organization' }
    });
    return;
  }

  // Enforce Resource-Level Access Control (RLAC)
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
      actorRole: context.roles.map(r => r.code).join(','),
      action: 'security.resource_access_denied',
      resourceType: 'Patient',
      resourceId: patient.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { message: (err as Error).message },
      severity: 'WARNING'
    });

    res.status(403).json({
      error: { code: 'FORBIDDEN_RESOURCE_ACCESS', message: (err as Error).message }
    });
    return;
  }

  // Concurrently fetch linked contacts, consents, and primary provider details
  const [contactsRes, consentsRes, providerRes] = await Promise.all([
    db.query<PatientContact>('SELECT * FROM patient_contacts WHERE patient_id = $1 ORDER BY created_at ASC', [patient.id]),
    db.query<PatientConsent>('SELECT * FROM patient_consents WHERE patient_id = $1 ORDER BY granted_at DESC', [patient.id]),
    patient.primary_provider_id
      ? db.query('SELECT p.id, p.license_number, p.specialization, u.first_name, u.last_name FROM providers p JOIN users u ON p.user_id = u.id WHERE p.id = $1', [patient.primary_provider_id])
      : Promise.resolve({ rows: [] })
  ]);

  AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: context.roles.map(r => r.code).join(','),
    action: 'patient.profile_viewed',
    resourceType: 'Patient',
    resourceId: patient.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata: { mrn: patient.mrn },
    severity: 'INFO'
  });

  res.json({
    data: {
      patient,
      contacts: contactsRes.rows,
      consents: consentsRes.rows,
      primaryProvider: providerRes.rows[0] || null
    }
  });
});

/**
 * POST /api/v1/patients
 * Register new patient intake
 */
v1PatientsRouter.post('/', requirePermission(Permissions.PATIENT_CREATE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
    preferredLanguage = 'en',
    contactPreference = 'EMAIL',
    emergencyContactName,
    emergencyContactPhone,
    emergencyContactRelationship,
    allergiesSummary,
    primaryProviderId,
    initialConsent
  } = req.body;

  // Validation
  const errors: string[] = [];

  if (!firstName || typeof firstName !== 'string' || !firstName.trim()) {
    errors.push('First name is required');
  }
  if (!lastName || typeof lastName !== 'string' || !lastName.trim()) {
    errors.push('Last name is required');
  }
  if (!dateOfBirth || !isValidDate(dateOfBirth)) {
    errors.push('A valid date of birth (YYYY-MM-DD, past date) is required');
  }
  if (!gender || !['MALE', 'FEMALE', 'OTHER', 'UNKNOWN'].includes(gender)) {
    errors.push("Gender must be one of 'MALE', 'FEMALE', 'OTHER', or 'UNKNOWN'");
  }
  if (email && !isValidEmail(email)) {
    errors.push('Email is invalid');
  }

  if (errors.length > 0) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: errors.join('; '), details: errors }
    });
    return;
  }

  // Generate unique IDs
  const patientId = `pat_${crypto.randomBytes(6).toString('hex')}`;
  const mrn = `MRN-${Math.floor(10000 + Math.random() * 90000)}`;
  const now = new Date().toISOString();

  const newPatient: Patient = {
    id: patientId,
    organization_id: context.activeOrganization.id,
    user_id: null,
    mrn,
    first_name: firstName.trim(),
    last_name: lastName.trim(),
    date_of_birth: dateOfBirth,
    gender,
    blood_group: bloodGroup || null,
    email: email ? email.trim() : null,
    phone: phone ? phone.trim() : null,
    address_line1: addressLine1 ? addressLine1.trim() : null,
    city: city ? city.trim() : null,
    postal_code: postalCode ? postalCode.trim() : null,
    preferred_language: preferredLanguage || 'en',
    contact_preference: contactPreference || 'EMAIL',
    emergency_contact_name: emergencyContactName ? emergencyContactName.trim() : null,
    emergency_contact_phone: emergencyContactPhone ? emergencyContactPhone.trim() : null,
    allergies_summary: allergiesSummary ? allergiesSummary.trim() : null,
    primary_provider_id: primaryProviderId || null,
    status: 'ACTIVE',
    is_active: true,
    created_at: now,
    updated_at: now
  };

  await db.query(
    `INSERT INTO patients 
      (id, organization_id, user_id, mrn, first_name, last_name, date_of_birth, gender, blood_group, email, phone, address_line1, city, postal_code, preferred_language, contact_preference, emergency_contact_name, emergency_contact_phone, allergies_summary, primary_provider_id, status, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`,
    [
      newPatient.id,
      newPatient.organization_id,
      newPatient.user_id,
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
      newPatient.preferred_language,
      newPatient.contact_preference,
      newPatient.emergency_contact_name,
      newPatient.emergency_contact_phone,
      newPatient.allergies_summary,
      newPatient.primary_provider_id,
      newPatient.status,
      newPatient.is_active,
      newPatient.created_at,
      newPatient.updated_at
    ]
  );

  const contacts: PatientContact[] = [];
  // If emergency contact info provided, create structured emergency contact record
  if (emergencyContactName && emergencyContactPhone) {
    const contactId = `cnt_${crypto.randomBytes(6).toString('hex')}`;
    const contact: PatientContact = {
      id: contactId,
      organization_id: context.activeOrganization.id,
      patient_id: newPatient.id,
      name: emergencyContactName.trim(),
      relationship: emergencyContactRelationship || 'Emergency Contact',
      phone: emergencyContactPhone.trim(),
      email: null,
      is_emergency_contact: true,
      has_legal_authority: false,
      created_at: now,
      updated_at: now
    };

    await db.query(
      `INSERT INTO patient_contacts (id, organization_id, patient_id, name, relationship, phone, email, is_emergency_contact, has_legal_authority, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        contact.id,
        contact.organization_id,
        contact.patient_id,
        contact.name,
        contact.relationship,
        contact.phone,
        contact.email,
        contact.is_emergency_contact,
        contact.has_legal_authority,
        contact.created_at,
        contact.updated_at
      ]
    );
    contacts.push(contact);
  }

  const consents: PatientConsent[] = [];
  // Record initial consent if provided
  if (initialConsent && initialConsent.consentType) {
    const consentId = `cns_${crypto.randomBytes(6).toString('hex')}`;
    const consent: PatientConsent = {
      id: consentId,
      organization_id: context.activeOrganization.id,
      patient_id: newPatient.id,
      consent_type: initialConsent.consentType,
      purpose: initialConsent.purpose || 'Initial patient registration and care authorization',
      status: 'GRANTED',
      granted_at: now,
      expires_at: null,
      revoked_at: null,
      revoked_by_user_id: null,
      recorded_by_user_id: context.user.id,
      notes: initialConsent.notes || 'Recorded at initial intake',
      created_at: now
    };

    await db.query(
      `INSERT INTO patient_consents (id, organization_id, patient_id, consent_type, purpose, status, granted_at, recorded_by_user_id, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        consent.id,
        consent.organization_id,
        consent.patient_id,
        consent.consent_type,
        consent.purpose,
        consent.status,
        consent.granted_at,
        consent.recorded_by_user_id,
        consent.notes,
        consent.created_at
      ]
    );
    consents.push(consent);
  }

  // Audit event
  AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: context.roles.map(r => r.code).join(','),
    action: 'patient.registered',
    resourceType: 'Patient',
    resourceId: newPatient.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata: {
      mrn: newPatient.mrn,
      patientName: `${newPatient.first_name} ${newPatient.last_name}`,
      contactsCreated: contacts.length,
      consentsCreated: consents.length
    },
    severity: 'INFO'
  });

  res.status(201).json({
    data: {
      patient: newPatient,
      contacts,
      consents
    }
  });
});

/**
 * PUT /api/v1/patients/:id
 * Update patient demographic and contact profile
 */
v1PatientsRouter.put('/:id', requirePermission(Permissions.PATIENT_UPDATE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

  const existing = patientRes.rows[0];

  // Enforce tenant boundary
  if ( existing.organization_id !== context.activeOrganization.id) {
    res.status(403).json({ error: { code: 'FORBIDDEN_ORGANIZATION_ACCESS', message: 'Patient belongs to another organization' } });
    return;
  }

  ResourceAccessService.assertResourceAccess({
    context,
    resourceType: 'Patient',
    resourceId: existing.id,
    resourceOrganizationId: existing.organization_id,
    patientId: existing.id
  });

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
    preferredLanguage,
    contactPreference,
    emergencyContactName,
    emergencyContactPhone,
    allergiesSummary,
    primaryProviderId
  } = req.body;

  // Validation
  if (firstName && (!firstName.trim())) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'First name cannot be empty' } });
    return;
  }
  if (lastName && (!lastName.trim())) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Last name cannot be empty' } });
    return;
  }
  if (dateOfBirth && !isValidDate(dateOfBirth)) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid date of birth' } });
    return;
  }
  if (email && !isValidEmail(email)) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid email format' } });
    return;
  }

  const updatedPatient: Patient = {
    ...existing,
    first_name: firstName ? firstName.trim() : existing.first_name,
    last_name: lastName ? lastName.trim() : existing.last_name,
    date_of_birth: dateOfBirth || existing.date_of_birth,
    gender: gender || existing.gender,
    blood_group: bloodGroup !== undefined ? bloodGroup : existing.blood_group,
    email: email !== undefined ? (email ? email.trim() : null) : existing.email,
    phone: phone !== undefined ? (phone ? phone.trim() : null) : existing.phone,
    address_line1: addressLine1 !== undefined ? (addressLine1 ? addressLine1.trim() : null) : existing.address_line1,
    city: city !== undefined ? (city ? city.trim() : null) : existing.city,
    postal_code: postalCode !== undefined ? (postalCode ? postalCode.trim() : null) : existing.postal_code,
    preferred_language: preferredLanguage || existing.preferred_language,
    contact_preference: contactPreference || existing.contact_preference,
    emergency_contact_name: emergencyContactName !== undefined ? (emergencyContactName ? emergencyContactName.trim() : null) : existing.emergency_contact_name,
    emergency_contact_phone: emergencyContactPhone !== undefined ? (emergencyContactPhone ? emergencyContactPhone.trim() : null) : existing.emergency_contact_phone,
    allergies_summary: allergiesSummary !== undefined ? allergiesSummary : existing.allergies_summary,
    primary_provider_id: primaryProviderId !== undefined ? primaryProviderId : existing.primary_provider_id,
    updated_at: new Date().toISOString()
  };

  await db.query(
    `UPDATE patients 
     SET first_name = $1, last_name = $2, date_of_birth = $3, gender = $4, blood_group = $5, email = $6, phone = $7, address_line1 = $8, city = $9, postal_code = $10, preferred_language = $11, contact_preference = $12, emergency_contact_name = $13, emergency_contact_phone = $14, allergies_summary = $15, primary_provider_id = $16, updated_at = $17
     WHERE id = $18`,
    [
      updatedPatient.first_name,
      updatedPatient.last_name,
      updatedPatient.date_of_birth,
      updatedPatient.gender,
      updatedPatient.blood_group,
      updatedPatient.email,
      updatedPatient.phone,
      updatedPatient.address_line1,
      updatedPatient.city,
      updatedPatient.postal_code,
      updatedPatient.preferred_language,
      updatedPatient.contact_preference,
      updatedPatient.emergency_contact_name,
      updatedPatient.emergency_contact_phone,
      updatedPatient.allergies_summary,
      updatedPatient.primary_provider_id,
      updatedPatient.updated_at,
      updatedPatient.id
    ]
  );

  AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: context.roles.map(r => r.code).join(','),
    action: 'patient.updated',
    resourceType: 'Patient',
    resourceId: updatedPatient.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata: { mrn: updatedPatient.mrn, updatedBy: context.user.id },
    severity: 'INFO'
  });

  res.json({ data: { patient: updatedPatient } });
});

/**
 * POST /api/v1/patients/:id/status
 * Update patient lifecycle status (ACTIVE, INACTIVE, ARCHIVED, DECEASED)
 */
v1PatientsRouter.post('/:id/status', requirePermission(Permissions.PATIENT_ARCHIVE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const patientId = req.params.id;
  const { status, reason } = req.body;
  const db = getDatabaseClient();

  if (!status || !['ACTIVE', 'INACTIVE', 'ARCHIVED', 'DECEASED'].includes(status)) {
    res.status(400).json({ error: { code: 'INVALID_STATUS', message: "Status must be 'ACTIVE', 'INACTIVE', 'ARCHIVED', or 'DECEASED'" } });
    return;
  }

  const patientRes = await db.query<Patient>('SELECT * FROM patients WHERE id = $1', [patientId]);
  if (patientRes.rows.length === 0) {
    res.status(404).json({ error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found' } });
    return;
  }

  const patient = patientRes.rows[0];
  if ( patient.organization_id !== context.activeOrganization.id) {
    res.status(403).json({ error: { code: 'FORBIDDEN_ORGANIZATION_ACCESS', message: 'Patient belongs to another organization' } });
    return;
  }

  const now = new Date().toISOString();
  const isArchived = status === 'ARCHIVED';
  const isActive = status === 'ACTIVE';

  const updatedPatient: Patient = {
    ...patient,
    status,
    is_active: isActive,
    archived_at: isArchived ? now : null,
    archived_reason: isArchived ? (reason || 'Archived by administrative staff') : null,
    archived_by: isArchived ? context.user.id : null,
    updated_at: now
  };

  await db.query(
    `UPDATE patients 
     SET status = $1, is_active = $2, archived_at = $3, archived_reason = $4, archived_by = $5, updated_at = $6
     WHERE id = $7`,
    [
      updatedPatient.status,
      updatedPatient.is_active,
      updatedPatient.archived_at,
      updatedPatient.archived_reason,
      updatedPatient.archived_by,
      updatedPatient.updated_at,
      updatedPatient.id
    ]
  );

  AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: context.roles.map(r => r.code).join(','),
    action: isArchived ? 'patient.archived' : 'patient.status_updated',
    resourceType: 'Patient',
    resourceId: updatedPatient.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata: {
      mrn: updatedPatient.mrn,
      previousStatus: patient.status,
      newStatus: status,
      reason: reason || null
    },
    severity: isArchived ? 'WARNING' : 'INFO'
  });

  res.json({ data: { patient: updatedPatient } });
});

/**
 * POST /api/v1/patients/:id/contacts
 * Add emergency contact or family member
 */
v1PatientsRouter.post('/:id/contacts', requirePermission(Permissions.PATIENT_UPDATE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const patientId = req.params.id;
  const db = getDatabaseClient();

  const patientRes = await db.query<Patient>('SELECT * FROM patients WHERE id = $1', [patientId]);
  if (patientRes.rows.length === 0) {
    res.status(404).json({ error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found' } });
    return;
  }
  const patient = patientRes.rows[0];
  if ( patient.organization_id !== context.activeOrganization.id) {
    res.status(403).json({ error: { code: 'FORBIDDEN_ORGANIZATION_ACCESS', message: 'Access denied' } });
    return;
  }

  const { name, relationship, phone, email, isEmergencyContact = true, hasLegalAuthority = false } = req.body;
  if (!name || !relationship || !phone) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Name, relationship, and phone are required' } });
    return;
  }

  const contactId = `cnt_${crypto.randomBytes(6).toString('hex')}`;
  const now = new Date().toISOString();
  const contact: PatientContact = {
    id: contactId,
    organization_id: context.activeOrganization.id,
    patient_id: patient.id,
    name: name.trim(),
    relationship: relationship.trim(),
    phone: phone.trim(),
    email: email ? email.trim() : null,
    is_emergency_contact: Boolean(isEmergencyContact),
    has_legal_authority: Boolean(hasLegalAuthority),
    created_at: now,
    updated_at: now
  };

  await db.query(
    `INSERT INTO patient_contacts (id, organization_id, patient_id, name, relationship, phone, email, is_emergency_contact, has_legal_authority, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      contact.id,
      contact.organization_id,
      contact.patient_id,
      contact.name,
      contact.relationship,
      contact.phone,
      contact.email,
      contact.is_emergency_contact,
      contact.has_legal_authority,
      contact.created_at,
      contact.updated_at
    ]
  );

  AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: context.roles.map(r => r.code).join(','),
    action: 'patient.contact_added',
    resourceType: 'PatientContact',
    resourceId: contact.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata: { patientId: patient.id, contactName: contact.name, relationship: contact.relationship },
    severity: 'INFO'
  });

  res.status(201).json({ data: { contact } });
});

/**
 * DELETE /api/v1/patients/:id/contacts/:contactId
 * Remove contact
 */
v1PatientsRouter.delete('/:id/contacts/:contactId', requirePermission(Permissions.PATIENT_UPDATE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { id: patientId, contactId } = req.params;
  const db = getDatabaseClient();

  const patientRes = await db.query<Patient>('SELECT * FROM patients WHERE id = $1', [patientId]);
  if (patientRes.rows.length === 0) {
    res.status(404).json({ error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found' } });
    return;
  }
  const patient = patientRes.rows[0];
  if ( patient.organization_id !== context.activeOrganization.id) {
    res.status(403).json({ error: { code: 'FORBIDDEN_ORGANIZATION_ACCESS', message: 'Access denied' } });
    return;
  }

  await db.query('DELETE FROM patient_contacts WHERE id = $1 AND patient_id = $2', [contactId, patient.id]);

  AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: context.roles.map(r => r.code).join(','),
    action: 'patient.contact_removed',
    resourceType: 'PatientContact',
    resourceId: contactId,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata: { patientId: patient.id },
    severity: 'INFO'
  });

  res.json({ data: { success: true } });
});

/**
 * POST /api/v1/patients/:id/consents
 * Record informed consent authorization
 */
v1PatientsRouter.post('/:id/consents', requirePermission(Permissions.PATIENT_UPDATE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const patientId = req.params.id;
  const db = getDatabaseClient();

  const patientRes = await db.query<Patient>('SELECT * FROM patients WHERE id = $1', [patientId]);
  if (patientRes.rows.length === 0) {
    res.status(404).json({ error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found' } });
    return;
  }
  const patient = patientRes.rows[0];
  if ( patient.organization_id !== context.activeOrganization.id) {
    res.status(403).json({ error: { code: 'FORBIDDEN_ORGANIZATION_ACCESS', message: 'Access denied' } });
    return;
  }

  const { consentType, purpose, notes, expiresAt } = req.body;
  if (!consentType || !['GENERAL_TREATMENT', 'TELEHEALTH', 'DATA_SHARING', 'RESEARCH'].includes(consentType)) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: "Invalid consent type. Must be 'GENERAL_TREATMENT', 'TELEHEALTH', 'DATA_SHARING', or 'RESEARCH'" } });
    return;
  }
  if (!purpose || !purpose.trim()) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Purpose is required' } });
    return;
  }

  const consentId = `cns_${crypto.randomBytes(6).toString('hex')}`;
  const now = new Date().toISOString();
  const consent: PatientConsent = {
    id: consentId,
    organization_id: context.activeOrganization.id,
    patient_id: patient.id,
    consent_type: consentType,
    purpose: purpose.trim(),
    status: 'GRANTED',
    granted_at: now,
    expires_at: expiresAt || null,
    revoked_at: null,
    revoked_by_user_id: null,
    recorded_by_user_id: context.user.id,
    notes: notes ? notes.trim() : null,
    created_at: now
  };

  await db.query(
    `INSERT INTO patient_consents (id, organization_id, patient_id, consent_type, purpose, status, granted_at, expires_at, recorded_by_user_id, notes, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      consent.id,
      consent.organization_id,
      consent.patient_id,
      consent.consent_type,
      consent.purpose,
      consent.status,
      consent.granted_at,
      consent.expires_at,
      consent.recorded_by_user_id,
      consent.notes,
      consent.created_at
    ]
  );

  AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: context.roles.map(r => r.code).join(','),
    action: 'patient.consent_recorded',
    resourceType: 'PatientConsent',
    resourceId: consent.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata: { patientId: patient.id, consentType: consent.consent_type },
    severity: 'INFO'
  });

  res.status(201).json({ data: { consent } });
});

/**
 * PATCH /api/v1/patients/:id/consents/:consentId/revoke
 * Revoke existing consent record
 */
v1PatientsRouter.patch('/:id/consents/:consentId/revoke', requirePermission(Permissions.PATIENT_UPDATE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { id: patientId, consentId } = req.params;
  const db = getDatabaseClient();

  const patientRes = await db.query<Patient>('SELECT * FROM patients WHERE id = $1', [patientId]);
  if (patientRes.rows.length === 0) {
    res.status(404).json({ error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found' } });
    return;
  }
  const patient = patientRes.rows[0];
  if ( patient.organization_id !== context.activeOrganization.id) {
    res.status(403).json({ error: { code: 'FORBIDDEN_ORGANIZATION_ACCESS', message: 'Access denied' } });
    return;
  }

  const consentRes = await db.query<PatientConsent>('SELECT * FROM patient_consents WHERE id = $1 AND patient_id = $2', [consentId, patient.id]);
  if (consentRes.rows.length === 0) {
    res.status(404).json({ error: { code: 'CONSENT_NOT_FOUND', message: 'Consent record not found' } });
    return;
  }

  const now = new Date().toISOString();
  await db.query(
    'UPDATE patient_consents SET status = $1, revoked_at = $2, revoked_by_user_id = $3 WHERE id = $4',
    ['REVOKED', now, context.user.id, consentId]
  );

  const updatedConsent: PatientConsent = {
    ...consentRes.rows[0],
    status: 'REVOKED',
    revoked_at: now,
    revoked_by_user_id: context.user.id
  };

  AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: context.roles.map(r => r.code).join(','),
    action: 'patient.consent_revoked',
    resourceType: 'PatientConsent',
    resourceId: consentId,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata: { patientId: patient.id, consentType: updatedConsent.consent_type },
    severity: 'WARNING'
  });

  res.json({ data: { consent: updatedConsent } });
});

/**
 * GET /api/v1/patients/:patientId/appointments
 * Permission-aware appointment history for a specific patient
 */
v1PatientsRouter.get('/:patientId/appointments', requirePermission(Permissions.APPOINTMENT_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { patientId } = req.params;

  const patRes = await db.query<Patient>(
    'SELECT * FROM patients WHERE id = $1 AND organization_id = $2',
    [patientId, context.activeOrganization.id]
  );

  if (patRes.rows.length === 0) {
    res.status(404).json({ error: { code: 'PATIENT_NOT_FOUND', message: 'Patient record not found in active organization.' } });
    return;
  }

  const aptRes = await db.query(
    `SELECT * FROM appointments 
     WHERE patient_id = $1 AND organization_id = $2 
     ORDER BY scheduled_time DESC`,
    [patientId, context.activeOrganization.id]
  );

  res.json({
    data: {
      appointments: aptRes.rows,
      total: aptRes.rows.length
    }
  });
});

/**
 * GET /api/v1/patients/:patientId/observations
 * List all clinical observations / vitals for a patient
 */
v1PatientsRouter.get('/:patientId/observations', requirePermission(Permissions.CLINICAL_OBSERVATION_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { patientId } = req.params;

  const patRes = await db.query<Patient>(
    'SELECT * FROM patients WHERE id = $1 AND organization_id = $2',
    [patientId, context.activeOrganization.id]
  );
  if (!patRes.rows.length) {
    res.status(404).json({ error: { code: 'PATIENT_NOT_FOUND', message: 'Patient record not found in active organization.' } });
    return;
  }

  const obsRes = await db.query<ClinicalObservation>(
    'SELECT * FROM clinical_observations WHERE patient_id = $1 AND organization_id = $2 ORDER BY measured_at DESC',
    [patientId, context.activeOrganization.id]
  );

  res.json({
    data: {
      observations: obsRes.rows,
      total: obsRes.rows.length
    }
  });
});

/**
 * GET /api/v1/patients/:patientId/medical-record
 * Comprehensive longitudinal clinical medical record aggregation
 */
v1PatientsRouter.get('/:patientId/medical-record', requirePermission(Permissions.MEDICAL_RECORD_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { patientId } = req.params;

  try {
    const medicalRecord = await ClinicalService.getPatientMedicalRecord(
      context.activeOrganization.id,
      patientId,
      context.user.id,
      context.roles[0]?.code,
      req.ip,
      req.get('user-agent')
    );

    res.json({ data: medicalRecord });
  } catch (err) {
    if (err instanceof ClinicalError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve patient medical record.' } });
  }
});

/**
 * GET /api/v1/patients/:patientId/problems
 * List longitudinal problems for a patient
 */
v1PatientsRouter.get('/:patientId/problems', requirePermission(Permissions.PROBLEM_LIST_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { patientId } = req.params;

  try {
    const problems = await DiagnosisService.getPatientProblems(
      context.activeOrganization.id,
      patientId,
      context.user.id,
      context.roles[0]?.code
    );

    res.json({
      data: {
        problems,
        total: problems.length
      }
    });
  } catch (err) {
    if (err instanceof DiagnosisError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve patient problem list.' } });
  }
});

/**
 * POST /api/v1/patients/:patientId/problems
 * Add problem to longitudinal problem list
 */
v1PatientsRouter.post('/:patientId/problems', requirePermission(Permissions.PROBLEM_LIST_MANAGE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { patientId } = req.params;
  const { problemName, code, terminologySystem, status, onsetDate, encounterId } = req.body;

  try {
    const problem = await DiagnosisService.addPatientProblem({
      organizationId: context.activeOrganization.id,
      patientId,
      problemName,
      code,
      terminologySystem,
      status,
      onsetDate,
      encounterId,
      userId: context.user.id,
      userRole: context.roles[0]?.code,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(201).json({ data: { problem } });
  } catch (err) {
    if (err instanceof DiagnosisError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to add problem to problem list.' } });
  }
});

/**
 * PATCH /api/v1/patients/:patientId/problems/:problemId
 * Update problem in longitudinal problem list
 */
v1PatientsRouter.patch('/:patientId/problems/:problemId', requirePermission(Permissions.PROBLEM_LIST_MANAGE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { patientId, problemId } = req.params;
  const { problemName, status, onsetDate } = req.body;

  try {
    const problem = await DiagnosisService.updatePatientProblem({
      organizationId: context.activeOrganization.id,
      patientId,
      problemId,
      problemName,
      status,
      onsetDate,
      userId: context.user.id,
      userRole: context.roles[0]?.code,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ data: { problem } });
  } catch (err) {
    if (err instanceof DiagnosisError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update problem entry.' } });
  }
});

/**
 * POST /api/v1/patients/:patientId/problems/:problemId/resolve
 * Explicitly resolve a problem with resolution notes and date
 */
v1PatientsRouter.post('/:patientId/problems/:problemId/resolve', requirePermission(Permissions.PROBLEM_LIST_MANAGE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { patientId, problemId } = req.params;
  const { resolutionNotes, resolvedDate } = req.body;

  try {
    const problem = await DiagnosisService.resolvePatientProblem({
      organizationId: context.activeOrganization.id,
      patientId,
      problemId,
      resolutionNotes,
      resolvedDate,
      userId: context.user.id,
      userRole: context.roles[0]?.code,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ data: { problem } });
  } catch (err) {
    if (err instanceof DiagnosisError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to resolve problem.' } });
  }
});

/**
 * GET /api/v1/patients/:patientId/care-plans
 * List care plans for a patient
 */
v1PatientsRouter.get('/:patientId/care-plans', requirePermission(Permissions.CARE_PLAN_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { patientId } = req.params;

  try {
    const carePlans = await CarePlanService.getPatientCarePlans(
      context.activeOrganization.id,
      patientId,
      context.user.id,
      context.roles[0]?.code
    );

    res.json({
      data: {
        carePlans,
        total: carePlans.length
      }
    });
  } catch (err) {
    if (err instanceof CarePlanError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve care plans.' } });
  }
});

/**
 * POST /api/v1/patients/:patientId/care-plans
 * Create a new clinician-authored care plan for a patient
 */
v1PatientsRouter.post('/:patientId/care-plans', requirePermission(Permissions.CARE_PLAN_CREATE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { patientId } = req.params;
  const { title, clinicalRationale, description, startDate, reviewDate, status, responsibleProviderId, encounterId, items } = req.body;

  try {
    const carePlan = await CarePlanService.createCarePlan({
      organizationId: context.activeOrganization.id,
      patientId,
      title,
      clinicalRationale,
      description,
      startDate,
      reviewDate,
      status,
      responsibleProviderId,
      encounterId,
      items,
      userId: context.user.id,
      userRole: context.roles[0]?.code,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(201).json({ data: { carePlan } });
  } catch (err) {
    if (err instanceof CarePlanError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create care plan.' } });
  }
});


