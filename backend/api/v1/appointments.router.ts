/**
 * CLINILYNC Appointments API Router (v1)
 * 
 * High-integrity clinical scheduling, atomic booking transactions,
 * double-booking conflict prevention, and lifecycle state management.
 */

import { Router, Response } from 'express';
import { getDatabaseClient } from '../../../database/db.js';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth.js';
import { enforceTenantIsolation } from '../../middleware/tenant.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { Permissions } from '../../security/permissions.js';
import { AuditService } from '../../security/audit.js';
import { Appointment, Patient, Provider, Department, AppointmentType, AppointmentStatus } from '../../types/domain.js';
import { SchedulingService, SchedulingError } from '../../services/scheduling.service.js';

export const v1AppointmentsRouter = Router();

v1AppointmentsRouter.use(authenticateToken);
v1AppointmentsRouter.use(enforceTenantIsolation);

/**
 * GET /api/v1/appointments - List appointments with filters
 */
v1AppointmentsRouter.get('/', requirePermission(Permissions.APPOINTMENT_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { startDate, endDate, providerId, departmentId, patientId, status } = req.query;

  const params: unknown[] = [context.activeOrganization.id];
  const filters = ['a.organization_id = $1'];

  if (status && status !== 'ALL') {
    params.push(String(status).toUpperCase());
    filters.push(`a.status = $${params.length}`);
  }
  if (providerId) {
    params.push(String(providerId));
    filters.push(`a.provider_id = $${params.length}`);
  }
  if (departmentId) {
    params.push(String(departmentId));
    filters.push(`a.department_id = $${params.length}`);
  }
  if (patientId) {
    params.push(String(patientId));
    filters.push(`a.patient_id = $${params.length}`);
  }
  if (startDate) {
    params.push(String(startDate));
    filters.push(`a.scheduled_time >= $${params.length}`);
  }
  if (endDate) {
    params.push(String(endDate));
    filters.push(`a.scheduled_time <= $${params.length}`);
  }

  // Enrich appointment rows with joins instead of issuing up to four additional
  // database queries for every appointment returned.
  const aptRes = await db.query<any>(
    `SELECT
       a.*,
       p.first_name AS patient_first_name,
       p.last_name AS patient_last_name,
       p.mrn AS patient_mrn,
       p.date_of_birth AS patient_date_of_birth,
       p.phone AS patient_phone,
       p.email AS patient_email,
       pr.display_name AS provider_display_name,
       pr.specialization AS provider_specialization,
       pr.license_number AS provider_license_number,
       pr.consultation_fee AS provider_consultation_fee,
       d.name AS department_name,
       d.code AS department_code,
       at.name AS appointment_type_name,
       at.code AS appointment_type_code,
       at.color_code AS appointment_type_color_code,
       at.duration_minutes AS appointment_type_duration
     FROM appointments AS a
     LEFT JOIN patients AS p
       ON p.id = a.patient_id AND p.organization_id = a.organization_id
     LEFT JOIN providers AS pr
       ON pr.id = a.provider_id AND pr.organization_id = a.organization_id
     LEFT JOIN departments AS d
       ON d.id = a.department_id AND d.organization_id = a.organization_id
     LEFT JOIN appointment_types AS at
       ON at.id = a.appointment_type_id AND at.organization_id = a.organization_id
     WHERE ${filters.join(' AND ')}
     ORDER BY a.scheduled_time ASC`,
    params
  );

  const enriched = aptRes.rows.map((row: any) => {
    const {
      patient_first_name, patient_last_name, patient_mrn, patient_date_of_birth,
      patient_phone, patient_email, provider_display_name, provider_specialization,
      provider_license_number, provider_consultation_fee, department_name,
      department_code, appointment_type_name, appointment_type_code,
      appointment_type_color_code, appointment_type_duration, ...appointment
    } = row;
    const patient = patient_first_name ? {
      id: appointment.patient_id,
      first_name: patient_first_name,
      last_name: patient_last_name,
      mrn: patient_mrn,
      date_of_birth: patient_date_of_birth,
      phone: patient_phone,
      email: patient_email
    } : null;
    return {
      ...appointment,
      patient,
      patientName: patient ? `${patient.first_name} ${patient.last_name}` : 'Unknown Patient',
      patientMrn: patient?.mrn || 'N/A',
      patientPhone: patient?.phone || null,
      providerName: provider_display_name || 'Attending Clinician',
      specialization: provider_specialization || 'General',
      providerLicenseNumber: provider_license_number || null,
      providerConsultationFee: provider_consultation_fee ?? null,
      departmentName: department_name || null,
      departmentCode: department_code || null,
      appointmentTypeName: appointment_type_name || appointment.appointment_type,
      appointmentTypeCode: appointment_type_code || null,
      appointmentTypeDuration: appointment_type_duration ?? null,
      colorCode: appointment_type_color_code || '#0d9488'
    };
  });
  res.json({
    data: {
      appointments: enriched,
      total: enriched.length
    },
    meta: {
      organizationId: context.activeOrganization.id,
      timestamp: new Date().toISOString()
    }
  });
});

/**
 * POST /api/v1/appointments - Book appointment atomically with double-booking prevention
 */
v1AppointmentsRouter.post('/', requirePermission(Permissions.APPOINTMENT_CREATE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const {
    patientId,
    providerId,
    departmentId,
    appointmentTypeId,
    scheduledTime,
    durationMinutes,
    reasonForVisit,
    creationSource
  } = req.body;

  if (!patientId || !providerId || !scheduledTime) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'patientId, providerId, and scheduledTime are required.' }
    });
    return;
  }

  try {
    const result = await SchedulingService.bookAppointment({
      organizationId: context.activeOrganization.id,
      patientId,
      providerId,
      departmentId,
      appointmentTypeId,
      scheduledTime,
      durationMinutes,
      reasonForVisit,
      creationSource: creationSource || 'STAFF',
      userId: context.user.id,
      userRole: context.roles[0]?.code || 'STAFF',
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(201).json({
      data: { appointment: result.appointment },
      meta: { message: 'Appointment successfully scheduled and confirmed.' }
    });
  } catch (err: any) {
    if (err instanceof SchedulingError) {
      res.status(err.statusCode).json({
        error: { code: err.code, message: err.message }
      });
      return;
    }
    res.status(500).json({
      error: { code: 'SCHEDULING_FAILED', message: err.message || 'Booking transaction failed.' }
    });
  }
});

/**
 * GET /api/v1/appointments/:appointmentId - Appointment details
 */
v1AppointmentsRouter.get('/:appointmentId', requirePermission(Permissions.APPOINTMENT_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { appointmentId } = req.params;

  const aptRes = await db.query<Appointment>(
    'SELECT * FROM appointments WHERE id = $1 AND organization_id = $2',
    [appointmentId, context.activeOrganization.id]
  );

  if (aptRes.rows.length === 0) {
    res.status(404).json({ error: { code: 'APPOINTMENT_NOT_FOUND', message: 'Appointment record not found.' } });
    return;
  }

  const apt = aptRes.rows[0];

  const [patRes, provRes, deptRes, typeRes] = await Promise.all([
    db.query<Patient>('SELECT * FROM patients WHERE id = $1', [apt.patient_id]),
    db.query<Provider>('SELECT * FROM providers WHERE id = $1', [apt.provider_id]),
    apt.department_id ? db.query<Department>('SELECT * FROM departments WHERE id = $1', [apt.department_id]) : Promise.resolve({ rows: [] }),
    apt.appointment_type_id ? db.query<AppointmentType>('SELECT * FROM appointment_types WHERE id = $1', [apt.appointment_type_id]) : Promise.resolve({ rows: [] })
  ]);

  res.json({
    data: {
      appointment: apt,
      patient: patRes.rows[0] || null,
      provider: provRes.rows[0] || null,
      department: deptRes.rows[0] || null,
      appointmentType: typeRes.rows[0] || null
    }
  });
});

/**
 * PATCH /api/v1/appointments/:appointmentId - Update non-timing details
 */
v1AppointmentsRouter.patch('/:appointmentId', requirePermission(Permissions.APPOINTMENT_UPDATE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { appointmentId } = req.params;
  const { reasonForVisit } = req.body;

  const now = new Date().toISOString();
  await db.query(
    'UPDATE appointments SET reason_for_visit = $1, updated_at = $2 WHERE id = $3 AND organization_id = $4',
    [reasonForVisit || null, now, appointmentId, context.activeOrganization.id]
  );

  const updatedRes = await db.query<Appointment>('SELECT * FROM appointments WHERE id = $1 AND organization_id = $2', [appointmentId, context.activeOrganization.id]);
  if (updatedRes.rows.length === 0) {
    res.status(404).json({ error: { code: 'APPOINTMENT_NOT_FOUND', message: 'Appointment record not found.' } });
    return;
  }
  res.json({ data: { appointment: updatedRes.rows[0] } });
});

/**
 * POST /api/v1/appointments/:appointmentId/confirm - Confirm appointment
 */
v1AppointmentsRouter.post('/:appointmentId/confirm', requirePermission(Permissions.APPOINTMENT_CONFIRM), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { appointmentId } = req.params;

  const aptRes = await db.query<Appointment>(
    'SELECT * FROM appointments WHERE id = $1 AND organization_id = $2',
    [appointmentId, context.activeOrganization.id]
  );

  if (aptRes.rows.length === 0) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Appointment not found.' } });
    return;
  }

  const apt = aptRes.rows[0];
  if (!SchedulingService.validateStatusTransition(apt.status, 'CONFIRMED')) {
    res.status(400).json({ error: { code: 'INVALID_TRANSITION', message: `Cannot transition from ${apt.status} to CONFIRMED.` } });
    return;
  }

  const now = new Date().toISOString();
  await db.query(
    'UPDATE appointments SET status = $1, updated_at = $2 WHERE id = $3',
    ['CONFIRMED', now, appointmentId]
  );

  await AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: 'STAFF',
    action: 'appointment.confirmed',
    resourceType: 'Appointment',
    resourceId: appointmentId,
    severity: 'INFO',
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.json({ data: { success: true, status: 'CONFIRMED' } });
});

/**
 * POST /api/v1/appointments/:appointmentId/check-in - Check in patient
 */
v1AppointmentsRouter.post('/:appointmentId/check-in', requirePermission(Permissions.APPOINTMENT_CHECK_IN), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { appointmentId } = req.params;

  const aptRes = await db.query<Appointment>(
    'SELECT * FROM appointments WHERE id = $1 AND organization_id = $2',
    [appointmentId, context.activeOrganization.id]
  );

  if (aptRes.rows.length === 0) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Appointment not found.' } });
    return;
  }

  const apt = aptRes.rows[0];
  if (!SchedulingService.validateStatusTransition(apt.status, 'CHECKED_IN')) {
    res.status(400).json({ error: { code: 'INVALID_TRANSITION', message: `Cannot transition from ${apt.status} to CHECKED_IN.` } });
    return;
  }

  const now = new Date().toISOString();
  await db.query(
    'UPDATE appointments SET status = $1, checked_in_at = $2, checked_in_by_user_id = $3, updated_at = $4 WHERE id = $5',
    ['CHECKED_IN', now, context.user.id, now, appointmentId]
  );

  await AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: 'STAFF',
    action: 'appointment.checked_in',
    resourceType: 'Appointment',
    resourceId: appointmentId,
    severity: 'INFO',
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.json({ data: { success: true, status: 'CHECKED_IN', checkedInAt: now } });
});

/**
 * POST /api/v1/appointments/:appointmentId/start - Start consultation
 */
v1AppointmentsRouter.post('/:appointmentId/start', requirePermission(Permissions.APPOINTMENT_START), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { appointmentId } = req.params;

  const aptRes = await db.query<Appointment>(
    'SELECT * FROM appointments WHERE id = $1 AND organization_id = $2',
    [appointmentId, context.activeOrganization.id]
  );

  if (aptRes.rows.length === 0) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Appointment not found.' } });
    return;
  }

  const apt = aptRes.rows[0];
  if (!SchedulingService.validateStatusTransition(apt.status, 'IN_PROGRESS')) {
    res.status(400).json({ error: { code: 'INVALID_TRANSITION', message: `Cannot transition from ${apt.status} to IN_PROGRESS.` } });
    return;
  }

  const now = new Date().toISOString();
  await db.query(
    'UPDATE appointments SET status = $1, started_at = $2, started_by_user_id = $3, updated_at = $4 WHERE id = $5',
    ['IN_PROGRESS', now, context.user.id, now, appointmentId]
  );

  await AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: 'STAFF',
    action: 'appointment.started',
    resourceType: 'Appointment',
    resourceId: appointmentId,
    severity: 'INFO',
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.json({ data: { success: true, status: 'IN_PROGRESS', startedAt: now } });
});

/**
 * POST /api/v1/appointments/:appointmentId/complete - Complete appointment
 */
v1AppointmentsRouter.post('/:appointmentId/complete', requirePermission(Permissions.APPOINTMENT_COMPLETE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { appointmentId } = req.params;

  const aptRes = await db.query<Appointment>(
    'SELECT * FROM appointments WHERE id = $1 AND organization_id = $2',
    [appointmentId, context.activeOrganization.id]
  );

  if (aptRes.rows.length === 0) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Appointment not found.' } });
    return;
  }

  const apt = aptRes.rows[0];
  if (!SchedulingService.validateStatusTransition(apt.status, 'COMPLETED')) {
    res.status(400).json({ error: { code: 'INVALID_TRANSITION', message: `Cannot transition from ${apt.status} to COMPLETED.` } });
    return;
  }

  const now = new Date().toISOString();
  await db.query(
    'UPDATE appointments SET status = $1, completed_at = $2, completed_by_user_id = $3, updated_at = $4 WHERE id = $5',
    ['COMPLETED', now, context.user.id, now, appointmentId]
  );

  await AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: 'STAFF',
    action: 'appointment.completed',
    resourceType: 'Appointment',
    resourceId: appointmentId,
    severity: 'INFO',
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.json({ data: { success: true, status: 'COMPLETED', completedAt: now } });
});

/**
 * POST /api/v1/appointments/:appointmentId/cancel - Cancel appointment with documented reason
 */
v1AppointmentsRouter.post('/:appointmentId/cancel', requirePermission(Permissions.APPOINTMENT_CANCEL), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { appointmentId } = req.params;
  const { cancellationReason } = req.body;

  if (!cancellationReason || typeof cancellationReason !== 'string') {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A cancellationReason must be provided.' } });
    return;
  }

  const aptRes = await db.query<Appointment>(
    'SELECT * FROM appointments WHERE id = $1 AND organization_id = $2',
    [appointmentId, context.activeOrganization.id]
  );

  if (aptRes.rows.length === 0) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Appointment not found.' } });
    return;
  }

  const apt = aptRes.rows[0];
  if (!SchedulingService.validateStatusTransition(apt.status, 'CANCELLED')) {
    res.status(400).json({ error: { code: 'INVALID_TRANSITION', message: `Cannot cancel an appointment with status ${apt.status}.` } });
    return;
  }

  const now = new Date().toISOString();
  await db.query(
    'UPDATE appointments SET status = $1, cancellation_reason = $2, cancelled_at = $3, cancelled_by_user_id = $4, updated_at = $5 WHERE id = $6',
    ['CANCELLED', cancellationReason, now, context.user.id, now, appointmentId]
  );

  await AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: 'STAFF',
    action: 'appointment.cancelled',
    resourceType: 'Appointment',
    resourceId: appointmentId,
    metadata: { cancellationReason },
    severity: 'WARNING',
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.json({ data: { success: true, status: 'CANCELLED', cancellationReason } });
});

/**
 * POST /api/v1/appointments/:appointmentId/reschedule - Atomic reschedule
 */
v1AppointmentsRouter.post('/:appointmentId/reschedule', requirePermission(Permissions.APPOINTMENT_RESCHEDULE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { appointmentId } = req.params;
  const { newScheduledTime, newProviderId, reason } = req.body;

  if (!newScheduledTime) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'newScheduledTime is required.' } });
    return;
  }

  try {
    const result = await SchedulingService.rescheduleAppointment({
      organizationId: context.activeOrganization.id,
      appointmentId,
      newScheduledTime,
      newProviderId,
      reason,
      userId: context.user.id,
      userRole: context.roles[0]?.code || 'STAFF',
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      data: { appointment: result.appointment },
      meta: { message: 'Appointment successfully rescheduled.' }
    });
  } catch (err: any) {
    if (err instanceof SchedulingError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'RESCHEDULE_FAILED', message: err.message } });
  }
});

/**
 * POST /api/v1/appointments/:appointmentId/no-show - Record patient no-show
 */
v1AppointmentsRouter.post('/:appointmentId/no-show', requirePermission(Permissions.APPOINTMENT_NO_SHOW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { appointmentId } = req.params;

  const aptRes = await db.query<Appointment>(
    'SELECT * FROM appointments WHERE id = $1 AND organization_id = $2',
    [appointmentId, context.activeOrganization.id]
  );

  if (aptRes.rows.length === 0) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Appointment not found.' } });
    return;
  }

  const apt = aptRes.rows[0];
  if (!SchedulingService.validateStatusTransition(apt.status, 'NO_SHOW')) {
    res.status(400).json({ error: { code: 'INVALID_TRANSITION', message: `Cannot mark appointment with status ${apt.status} as NO_SHOW.` } });
    return;
  }

  const now = new Date().toISOString();
  await db.query(
    'UPDATE appointments SET status = $1, no_show_at = $2, no_show_by_user_id = $3, updated_at = $4 WHERE id = $5',
    ['NO_SHOW', now, context.user.id, now, appointmentId]
  );

  await AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: 'STAFF',
    action: 'appointment.no_show',
    resourceType: 'Appointment',
    resourceId: appointmentId,
    severity: 'WARNING',
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.json({ data: { success: true, status: 'NO_SHOW', noShowAt: now } });
});
