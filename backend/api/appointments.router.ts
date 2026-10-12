/**
 * CLINILYNC Appointments API Router
 */

import { Router, Response } from 'express';
import crypto from 'node:crypto';
import { getDatabaseClient } from '../../database/db.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { enforceTenantIsolation } from '../middleware/tenant.js';
import { requirePermission } from '../middleware/require-permission.js';
import { Permissions } from '../security/permissions.js';
import { AuditService } from '../security/audit.js';
import { Appointment, Patient, User } from '../types/domain.js';

export const appointmentsRouter = Router();

appointmentsRouter.use(authenticateToken);
appointmentsRouter.use(enforceTenantIsolation);

// GET /api/appointments - List appointments in current organization
appointmentsRouter.get('/', requirePermission(Permissions.APPOINTMENT_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();

  const aptRes = await db.query<Appointment>(
    'SELECT * FROM appointments WHERE organization_id = $1 ORDER BY scheduled_time ASC',
    [context.activeOrganization.id]
  );

  const appointments = aptRes.rows;

  // Enrich with patient and provider details
  const enriched = await Promise.all(
    appointments.map(async (apt) => {
      const patRes = await db.query<Patient>('SELECT id, first_name, last_name, mrn, phone FROM patients WHERE id = $1', [apt.patient_id]);
      const provRes = await db.query<{ id: string; user_id: string; specialization: string }>('SELECT id, user_id, specialization FROM providers WHERE id = $1', [apt.provider_id]);
      
      let providerName = 'Attending Clinician';
      if (provRes.rows[0]) {
        const uRes = await db.query<User>('SELECT first_name, last_name FROM users WHERE id = $1', [provRes.rows[0].user_id]);
        if (uRes.rows[0]) {
          providerName = `${uRes.rows[0].first_name} ${uRes.rows[0].last_name}`;
        }
      }

      return {
        ...apt,
        patient: patRes.rows[0] || null,
        providerName,
        specialization: provRes.rows[0]?.specialization || 'Clinical'
      };
    })
  );

  res.json({ appointments: enriched, total: enriched.length });
});

// POST /api/appointments - Book appointment
appointmentsRouter.post('/', requirePermission(Permissions.APPOINTMENT_CREATE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { patientId, providerId, scheduledTime, durationMinutes, appointmentType, reasonForVisit } = req.body;

  if (!patientId || !providerId || !scheduledTime) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'patientId, providerId, and scheduledTime are required' }
    });
    return;
  }

  const aptId = `apt_${crypto.randomUUID().substring(0, 8)}`;
  const newApt: Appointment = {
    id: aptId,
    organization_id: context.activeOrganization.id,
    patient_id: patientId,
    provider_id: providerId,
    scheduled_time: scheduledTime,
    duration_minutes: Number(durationMinutes) || 30,
    appointment_type: appointmentType || 'CONSULTATION',
    status: 'SCHEDULED',
    reason_for_visit: reasonForVisit || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  await db.query(
    `INSERT INTO appointments 
      (id, organization_id, patient_id, provider_id, scheduled_time, duration_minutes, appointment_type, status, reason_for_visit, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      newApt.id,
      newApt.organization_id,
      newApt.patient_id,
      newApt.provider_id,
      newApt.scheduled_time,
      newApt.duration_minutes,
      newApt.appointment_type,
      newApt.status,
      newApt.reason_for_visit,
      newApt.created_at,
      newApt.updated_at
    ]
  );

  AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: context.roles.map(r => r.code).join(','),
    action: 'appointment.booked',
    resourceType: 'Appointment',
    resourceId: newApt.id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata: { patientId, scheduledTime, appointmentType },
    severity: 'INFO'
  });

  res.status(201).json({ appointment: newApt });
});

// PATCH /api/appointments/:id/status - Status transitions (CHECKED_IN, IN_CONSULTATION, COMPLETED, CANCELLED)
appointmentsRouter.patch('/:id/status', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const appointmentId = req.params.id;
  const { status, cancellationReason } = req.body;

  const validStatuses = ['SCHEDULED', 'CHECKED_IN', 'IN_CONSULTATION', 'COMPLETED', 'CANCELLED'];
  if (!validStatuses.includes(status)) {
    res.status(400).json({ error: { code: 'INVALID_STATUS', message: `Invalid status: ${status}` } });
    return;
  }

  const existingRes = await db.query<Appointment>('SELECT * FROM appointments WHERE id = $1 AND organization_id = $2', [
    appointmentId,
    context.activeOrganization.id
  ]);

  if (existingRes.rows.length === 0) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Appointment not found in this organization' } });
    return;
  }

  const apt = existingRes.rows[0];
  const now = new Date().toISOString();

  let checkedInAt = apt.checked_in_at;
  let completedAt = apt.completed_at;

  if (status === 'CHECKED_IN' && !checkedInAt) {
    checkedInAt = now;
  } else if (status === 'COMPLETED' && !completedAt) {
    completedAt = now;
  }

  await db.query(
    `UPDATE appointments 
     SET status = $1, checked_in_at = $2, completed_at = $3, cancellation_reason = $4, updated_at = $5 
     WHERE id = $6`,
    [status, checkedInAt, completedAt, cancellationReason || null, now, appointmentId]
  );

  AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: context.roles.map(r => r.code).join(','),
    action: `appointment.status_${status.toLowerCase()}`,
    resourceType: 'Appointment',
    resourceId: appointmentId,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata: { previousStatus: apt.status, newStatus: status, patientId: apt.patient_id },
    severity: 'INFO'
  });

  res.json({
    success: true,
    appointment: {
      ...apt,
      status,
      checked_in_at: checkedInAt,
      completed_at: completedAt,
      cancellation_reason: cancellationReason || null,
      updated_at: now
    }
  });
});
