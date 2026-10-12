/**
 * CLINILYNC Appointment Types API Router (v1)
 */

import { Router, Response } from 'express';
import crypto from 'node:crypto';
import { getDatabaseClient } from '../../../database/db.js';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth.js';
import { enforceTenantIsolation } from '../../middleware/tenant.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { Permissions } from '../../security/permissions.js';
import { AppointmentType } from '../../types/domain.js';

export const v1AppointmentTypesRouter = Router();

v1AppointmentTypesRouter.use(authenticateToken);
v1AppointmentTypesRouter.use(enforceTenantIsolation);

/**
 * GET /api/v1/appointment-types - List organization appointment types
 */
v1AppointmentTypesRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();

  const atRes = await db.query<AppointmentType>(
    'SELECT * FROM appointment_types WHERE organization_id = $1 AND is_active = TRUE ORDER BY duration_minutes ASC',
    [context.activeOrganization.id]
  );

  res.json({
    data: {
      appointmentTypes: atRes.rows,
      total: atRes.rows.length
    }
  });
});

/**
 * POST /api/v1/appointment-types - Create appointment type
 */
v1AppointmentTypesRouter.post('/', requirePermission(Permissions.ORGANIZATION_UPDATE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { name, code, description, durationMinutes, bufferBeforeMinutes, bufferAfterMinutes, colorCode, departmentId } = req.body;

  if (!name || !code) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'name and code are required.' } });
    return;
  }

  const id = `at_${crypto.randomUUID().substring(0, 8)}`;
  const now = new Date().toISOString();

  const newType: AppointmentType = {
    id,
    organization_id: context.activeOrganization.id,
    name,
    code: code.toUpperCase().trim(),
    description: description || null,
    duration_minutes: Number(durationMinutes) || 30,
    buffer_before_minutes: Number(bufferBeforeMinutes) || 0,
    buffer_after_minutes: Number(bufferAfterMinutes) || 0,
    department_id: departmentId || null,
    is_active: true,
    allow_self_booking: true,
    color_code: colorCode || '#0d9488',
    created_at: now,
    updated_at: now
  };

  await db.query(
    `INSERT INTO appointment_types 
      (id, organization_id, name, code, description, duration_minutes, buffer_before_minutes, buffer_after_minutes, department_id, is_active, allow_self_booking, color_code, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      newType.id,
      newType.organization_id,
      newType.name,
      newType.code,
      newType.description,
      newType.duration_minutes,
      newType.buffer_before_minutes,
      newType.buffer_after_minutes,
      newType.department_id,
      newType.is_active,
      newType.allow_self_booking,
      newType.color_code,
      newType.created_at,
      newType.updated_at
    ]
  );

  res.status(201).json({ data: { appointmentType: newType } });
});
