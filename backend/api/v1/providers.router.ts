/**
 * CLINILYNC Providers API Router (v1)
 * 
 * Endpoints for healthcare providers, department assignments, schedules, and availability.
 */

import { Router, Response } from 'express';
import crypto from 'node:crypto';
import { getDatabaseClient } from '../../../database/db.js';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth.js';
import { enforceTenantIsolation } from '../../middleware/tenant.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { Permissions } from '../../security/permissions.js';
import { AuditService } from '../../security/audit.js';
import { Provider, ProviderDepartment, ProviderAvailability, Department, Specialty } from '../../types/domain.js';
import { SchedulingService } from '../../services/scheduling.service.js';

export const v1ProvidersRouter = Router();

v1ProvidersRouter.use(authenticateToken);
v1ProvidersRouter.use(enforceTenantIsolation);

/**
 * GET /api/v1/providers - List organization providers
 */
v1ProvidersRouter.get('/', requirePermission(Permissions.PROVIDER_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();

  const { search, specialtyId, departmentId, status } = req.query;

  let query = 'SELECT * FROM providers WHERE organization_id = $1';
  const params: unknown[] = [context.activeOrganization.id];

  if (status && status !== 'ALL') {
    params.push(String(status).toUpperCase());
    query += ` AND status = $${params.length}`;
  }

  const provRes = await db.query<Provider>(query, params);
  let providers = provRes.rows;

  // Filter in memory for search, specialty, and department if specified
  if (search && typeof search === 'string') {
    const q = search.toLowerCase().trim();
    providers = providers.filter(p => 
      (p.display_name && p.display_name.toLowerCase().includes(q)) ||
      (p.first_name && p.first_name.toLowerCase().includes(q)) ||
      (p.last_name && p.last_name.toLowerCase().includes(q)) ||
      (p.specialization && p.specialization.toLowerCase().includes(q)) ||
      (p.license_number && p.license_number.toLowerCase().includes(q))
    );
  }

  if (specialtyId && typeof specialtyId === 'string') {
    providers = providers.filter(p => p.specialty_id === specialtyId);
  }

  if (departmentId && typeof departmentId === 'string') {
    // Check provider_departments
    const pdRes = await db.query<ProviderDepartment>('SELECT * FROM provider_departments WHERE department_id = $1', [departmentId]);
    const assignedProviderIds = new Set(pdRes.rows.map(pd => pd.provider_id));
    providers = providers.filter(p => p.department_id === departmentId || assignedProviderIds.has(p.id));
  }

  // Enrich with departments and specialties
  const enriched = await Promise.all(
    providers.map(async (p) => {
      const deptsRes = await db.query<ProviderDepartment & { name?: string }>(
        `SELECT pd.*, d.name, d.code FROM provider_departments pd
         JOIN departments d ON d.id = pd.department_id
         WHERE pd.provider_id = $1`,
        [p.id]
      );

      let specialty = null;
      if (p.specialty_id) {
        const specRes = await db.query<Specialty>('SELECT * FROM specialties WHERE id = $1', [p.specialty_id]);
        specialty = specRes.rows[0] || null;
      }

      return {
        ...p,
        departments: deptsRes.rows,
        specialty
      };
    })
  );

  res.json({
    data: {
      providers: enriched,
      total: enriched.length
    },
    meta: {
      organizationId: context.activeOrganization.id,
      timestamp: new Date().toISOString()
    }
  });
});

/**
 * POST /api/v1/providers - Register new provider
 */
v1ProvidersRouter.post('/', requirePermission(Permissions.PROVIDER_CREATE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const {
    userId,
    title,
    firstName,
    lastName,
    displayName,
    specialtyId,
    specialization,
    licenseNumber,
    consultationFee,
    email,
    phone,
    bio,
    qualifications,
    departmentIds
  } = req.body;

  if (!specialization || !licenseNumber) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'specialization and licenseNumber are required fields.' }
    });
    return;
  }

  const providerId = `prov_${crypto.randomUUID().substring(0, 8)}`;
  const calcDisplayName = displayName || `${title || 'Dr.'} ${firstName || ''} ${lastName || ''}`.trim() || specialization;
  const now = new Date().toISOString();

  const newProvider: Provider = {
    id: providerId,
    organization_id: context.activeOrganization.id,
    user_id: userId || null,
    department_id: departmentIds && departmentIds[0] ? departmentIds[0] : null,
    title: title || 'Dr.',
    first_name: firstName || null,
    last_name: lastName || null,
    display_name: calcDisplayName,
    specialty_id: specialtyId || null,
    specialization,
    license_number: licenseNumber,
    consultation_fee: Number(consultationFee) || 0,
    email: email || null,
    phone: phone || null,
    bio: bio || null,
    qualifications: qualifications || null,
    is_credential_verified: false,
    is_accepting_patients: true,
    status: 'ACTIVE',
    created_at: now,
    updated_at: now
  };

  await db.query(
    `INSERT INTO providers 
      (id, organization_id, user_id, department_id, title, first_name, last_name, display_name, specialty_id, specialization, license_number, consultation_fee, email, phone, bio, qualifications, is_credential_verified, is_accepting_patients, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
    [
      newProvider.id,
      newProvider.organization_id,
      newProvider.user_id,
      newProvider.department_id,
      newProvider.title,
      newProvider.first_name,
      newProvider.last_name,
      newProvider.display_name,
      newProvider.specialty_id,
      newProvider.specialization,
      newProvider.license_number,
      newProvider.consultation_fee,
      newProvider.email,
      newProvider.phone,
      newProvider.bio,
      newProvider.qualifications,
      newProvider.is_credential_verified,
      newProvider.is_accepting_patients,
      newProvider.status,
      newProvider.created_at,
      newProvider.updated_at
    ]
  );

  // Assign departments if passed
  if (Array.isArray(departmentIds) && departmentIds.length > 0) {
    for (let i = 0; i < departmentIds.length; i++) {
      const deptId = departmentIds[i];
      await db.query(
        `INSERT INTO provider_departments (id, provider_id, department_id, is_primary, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [`pd_${providerId}_${i}`, providerId, deptId, i === 0, now]
      );
    }
  }

  // Create default Monday-Friday 09:00 - 17:00 availability
  for (let dow = 1; dow <= 5; dow++) {
    await db.query(
      `INSERT INTO provider_availability (id, organization_id, provider_id, day_of_week, start_time, end_time, timezone, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [`avail_${providerId}_${dow}`, context.activeOrganization.id, providerId, dow, '09:00', '17:00', 'Europe/London', true, now]
    );
  }

  await AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: 'STAFF',
    action: 'provider.created',
    resourceType: 'Provider',
    resourceId: providerId,
    metadata: {
      displayName: newProvider.display_name,
      specialization: newProvider.specialization,
      licenseNumber: newProvider.license_number
    },
    severity: 'INFO',
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.status(201).json({
    data: { provider: newProvider },
    meta: { message: 'Healthcare provider profile successfully created.' }
  });
});

/**
 * GET /api/v1/providers/:providerId - Provider profile details
 */
v1ProvidersRouter.get('/:providerId', requirePermission(Permissions.PROVIDER_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { providerId } = req.params;

  const provRes = await db.query<Provider>(
    'SELECT * FROM providers WHERE id = $1 AND organization_id = $2',
    [providerId, context.activeOrganization.id]
  );

  if (provRes.rows.length === 0) {
    res.status(404).json({ error: { code: 'PROVIDER_NOT_FOUND', message: 'Provider record not found.' } });
    return;
  }

  const provider = provRes.rows[0];

  const [deptsRes, availRes, excRes] = await Promise.all([
    db.query<ProviderDepartment & { name?: string }>(
      `SELECT pd.*, d.name, d.code FROM provider_departments pd
       JOIN departments d ON d.id = pd.department_id
       WHERE pd.provider_id = $1`,
      [providerId]
    ),
    db.query<ProviderAvailability>(
      'SELECT * FROM provider_availability WHERE provider_id = $1 ORDER BY day_of_week ASC',
      [providerId]
    ),
    db.query(
      'SELECT * FROM provider_schedule_exceptions WHERE provider_id = $1 ORDER BY start_datetime ASC',
      [providerId]
    )
  ]);

  let specialty = null;
  if (provider.specialty_id) {
    const sRes = await db.query<Specialty>('SELECT * FROM specialties WHERE id = $1', [provider.specialty_id]);
    specialty = sRes.rows[0] || null;
  }

  res.json({
    data: {
      provider,
      departments: deptsRes.rows,
      availability: availRes.rows,
      exceptions: excRes.rows,
      specialty
    }
  });
});

/**
 * PATCH /api/v1/providers/:providerId - Update provider profile
 */
v1ProvidersRouter.patch('/:providerId', requirePermission(Permissions.PROVIDER_UPDATE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { providerId } = req.params;

  const provRes = await db.query<Provider>(
    'SELECT * FROM providers WHERE id = $1 AND organization_id = $2',
    [providerId, context.activeOrganization.id]
  );

  if (provRes.rows.length === 0) {
    res.status(404).json({ error: { code: 'PROVIDER_NOT_FOUND', message: 'Provider record not found.' } });
    return;
  }

  const existing = provRes.rows[0];
  const body = req.body;
  const now = new Date().toISOString();

  const updated: Provider = {
    ...existing,
    title: body.title !== undefined ? body.title : existing.title,
    first_name: body.firstName !== undefined ? body.firstName : existing.first_name,
    last_name: body.lastName !== undefined ? body.lastName : existing.last_name,
    display_name: body.displayName !== undefined ? body.displayName : existing.display_name,
    specialty_id: body.specialtyId !== undefined ? body.specialtyId : existing.specialty_id,
    specialization: body.specialization !== undefined ? body.specialization : existing.specialization,
    license_number: body.licenseNumber !== undefined ? body.licenseNumber : existing.license_number,
    consultation_fee: body.consultationFee !== undefined ? Number(body.consultationFee) : existing.consultation_fee,
    email: body.email !== undefined ? body.email : existing.email,
    phone: body.phone !== undefined ? body.phone : existing.phone,
    bio: body.bio !== undefined ? body.bio : existing.bio,
    qualifications: body.qualifications !== undefined ? body.qualifications : existing.qualifications,
    is_credential_verified: body.isCredentialVerified !== undefined ? Boolean(body.isCredentialVerified) : existing.is_credential_verified,
    is_accepting_patients: body.isAcceptingPatients !== undefined ? Boolean(body.isAcceptingPatients) : existing.is_accepting_patients,
    status: body.status !== undefined ? body.status : existing.status,
    updated_at: now
  };

  await db.query(
    `UPDATE providers 
     SET title = $1, first_name = $2, last_name = $3, display_name = $4, specialty_id = $5, specialization = $6, license_number = $7, consultation_fee = $8, email = $9, phone = $10, bio = $11, qualifications = $12, is_credential_verified = $13, is_accepting_patients = $14, status = $15, updated_at = $16
     WHERE id = $17`,
    [
      updated.title,
      updated.first_name,
      updated.last_name,
      updated.display_name,
      updated.specialty_id,
      updated.specialization,
      updated.license_number,
      updated.consultation_fee,
      updated.email,
      updated.phone,
      updated.bio,
      updated.qualifications,
      updated.is_credential_verified,
      updated.is_accepting_patients,
      updated.status,
      updated.updated_at,
      providerId
    ]
  );

  await AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: 'STAFF',
    action: 'provider.updated',
    resourceType: 'Provider',
    resourceId: providerId,
    metadata: { updatedFields: Object.keys(body) },
    severity: 'INFO',
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.json({ data: { provider: updated } });
});

/**
 * POST /api/v1/providers/:providerId/archive - Archive provider
 */
v1ProvidersRouter.post('/:providerId/archive', requirePermission(Permissions.PROVIDER_ARCHIVE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { providerId } = req.params;
  const { reason } = req.body;

  const provRes = await db.query<Provider>(
    'SELECT * FROM providers WHERE id = $1 AND organization_id = $2',
    [providerId, context.activeOrganization.id]
  );

  if (provRes.rows.length === 0) {
    res.status(404).json({ error: { code: 'PROVIDER_NOT_FOUND', message: 'Provider record not found.' } });
    return;
  }

  const now = new Date().toISOString();

  await db.query(
    `UPDATE providers 
     SET status = 'ARCHIVED', is_accepting_patients = FALSE, archived_at = $1, archived_reason = $2, updated_at = $3
     WHERE id = $4`,
    [now, reason || 'Archived by administrative staff', now, providerId]
  );

  await AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: 'STAFF',
    action: 'provider.archived',
    resourceType: 'Provider',
    resourceId: providerId,
    metadata: { reason },
    severity: 'WARNING',
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.json({
    data: { success: true, providerId, status: 'ARCHIVED' },
    meta: { message: 'Provider profile successfully archived.' }
  });
});

/**
 * Department assignments: GET, POST, DELETE
 */
v1ProvidersRouter.get('/:providerId/departments', requirePermission(Permissions.PROVIDER_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { providerId } = req.params;

  const deptsRes = await db.query(
    `SELECT pd.*, d.name, d.code, d.is_active FROM provider_departments pd
     JOIN departments d ON d.id = pd.department_id
     WHERE pd.provider_id = $1`,
    [providerId]
  );

  res.json({ data: { departments: deptsRes.rows } });
});

v1ProvidersRouter.post('/:providerId/departments', requirePermission(Permissions.DEPARTMENT_MANAGE_ASSIGNMENTS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { providerId } = req.params;
  const { departmentId, isPrimary } = req.body;

  if (!departmentId) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'departmentId is required.' } });
    return;
  }

  // Ensure department belongs to same organization
  const deptRes = await db.query<Department>('SELECT * FROM departments WHERE id = $1 AND organization_id = $2', [departmentId, context.activeOrganization.id]);
  if (deptRes.rows.length === 0) {
    res.status(404).json({ error: { code: 'DEPARTMENT_NOT_FOUND', message: 'Department not found in active organization.' } });
    return;
  }

  const id = `pd_${providerId}_${departmentId}`;
  await db.query(
    `INSERT INTO provider_departments (id, provider_id, department_id, is_primary, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, providerId, departmentId, Boolean(isPrimary), new Date().toISOString()]
  );

  await AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: 'STAFF',
    action: 'provider.department_assigned',
    resourceType: 'ProviderDepartment',
    resourceId: id,
    metadata: { providerId, departmentId },
    severity: 'INFO',
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.status(201).json({ data: { success: true, assignmentId: id } });
});

v1ProvidersRouter.delete('/:providerId/departments/:departmentId', requirePermission(Permissions.DEPARTMENT_MANAGE_ASSIGNMENTS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { providerId, departmentId } = req.params;

  await db.query(
    'DELETE FROM provider_departments WHERE provider_id = $1 AND department_id = $2',
    [providerId, departmentId]
  );

  await AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: 'STAFF',
    action: 'provider.department_unassigned',
    resourceType: 'ProviderDepartment',
    metadata: { providerId, departmentId },
    severity: 'INFO',
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.json({ data: { success: true } });
});

/**
 * Schedule & Availability: GET, PUT, available slots
 */
v1ProvidersRouter.get('/:providerId/availability', requirePermission(Permissions.SCHEDULE_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const db = getDatabaseClient();
  const { providerId } = req.params;

  const availRes = await db.query<ProviderAvailability>(
    'SELECT * FROM provider_availability WHERE provider_id = $1 ORDER BY day_of_week ASC',
    [providerId]
  );

  const excRes = await db.query(
    'SELECT * FROM provider_schedule_exceptions WHERE provider_id = $1 ORDER BY start_datetime ASC',
    [providerId]
  );

  res.json({
    data: {
      availability: availRes.rows,
      exceptions: excRes.rows
    }
  });
});

v1ProvidersRouter.put('/:providerId/availability', requirePermission(Permissions.SCHEDULE_MANAGE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { providerId } = req.params;
  const { schedule } = req.body; // array of { dayOfWeek, startTime, endTime, timezone, isActive }

  if (!Array.isArray(schedule)) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'schedule must be an array of weekly availability rules.' } });
    return;
  }

  // Clear existing availability for provider
  await db.query('DELETE FROM provider_availability WHERE provider_id = $1', [providerId]);

  const now = new Date().toISOString();
  for (let i = 0; i < schedule.length; i++) {
    const item = schedule[i];
    const id = `avail_${providerId}_${item.dayOfWeek}_${i}`;
    await db.query(
      `INSERT INTO provider_availability 
        (id, organization_id, provider_id, day_of_week, start_time, end_time, timezone, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        context.activeOrganization.id,
        providerId,
        Number(item.dayOfWeek),
        item.startTime || '09:00',
        item.endTime || '17:00',
        item.timezone || 'Europe/London',
        item.isActive !== undefined ? Boolean(item.isActive) : true,
        now
      ]
    );
  }

  await AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: 'STAFF',
    action: 'provider.availability_updated',
    resourceType: 'ProviderAvailability',
    metadata: { providerId, rulesCount: schedule.length },
    severity: 'INFO',
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.json({ data: { success: true, count: schedule.length } });
});

v1ProvidersRouter.get('/:providerId/available-slots', requirePermission(Permissions.SCHEDULE_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { providerId } = req.params;
  const { date, durationMinutes } = req.query;

  if (!date || typeof date !== 'string') {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'date query parameter is required (format YYYY-MM-DD).' } });
    return;
  }

  const duration = Number(durationMinutes) || 30;
  const slots = await SchedulingService.getAvailableSlots(
    providerId,
    context.activeOrganization.id,
    date,
    duration
  );

  res.json({
    data: {
      providerId,
      date,
      slots,
      totalSlots: slots.length,
      availableSlotsCount: slots.filter(s => s.isAvailable).length
    }
  });
});
