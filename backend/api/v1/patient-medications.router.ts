/**
 * CLINILYNC Patient Medications Direct API Router (v1)
 * 
 * Base path: /api/v1/patient-medications
 */

import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth.js';
import { enforceTenantIsolation } from '../../middleware/tenant.js';
import { Permissions } from '../../security/permissions.js';
import { MedicationService, MedicationError } from '../../services/medication.service.js';

export const v1PatientMedicationsRouter = Router();

v1PatientMedicationsRouter.use(authenticateToken);
v1PatientMedicationsRouter.use(enforceTenantIsolation);

// PATCH /api/v1/patient-medications/:medicationRecordId
v1PatientMedicationsRouter.patch('/:medicationRecordId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;

  if (!context.permissions.includes(Permissions.MEDICATION_UPDATE)) {
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'User lacks medication.update permission' }
    });
    return;
  }

  try {
    const updated = await MedicationService.updatePatientMedication(
      req.params.medicationRecordId,
      req.body,
      {
        organizationId: context.activeOrganization.id,
        userId: context.user.id,
        userRole: context.membership?.role || context.roles[0]?.code,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      }
    );

    res.json({
      data: updated,
      meta: { message: 'Medication record updated' }
    });
  } catch (err) {
    if (err instanceof MedicationError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update medication record' } });
  }
});

// POST /api/v1/patient-medications/:medicationRecordId/discontinue
v1PatientMedicationsRouter.post('/:medicationRecordId/discontinue', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;

  if (!context.permissions.includes(Permissions.MEDICATION_DISCONTINUE)) {
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'User lacks medication.discontinue permission' }
    });
    return;
  }

  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    res.status(400).json({ error: { code: 'REASON_REQUIRED', message: 'A clinical reason is mandatory to discontinue a medication' } });
    return;
  }

  try {
    const discontinued = await MedicationService.discontinuePatientMedication(
      req.params.medicationRecordId,
      reason,
      {
        organizationId: context.activeOrganization.id,
        userId: context.user.id,
        userRole: context.membership?.role || context.roles[0]?.code,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      }
    );

    res.json({
      data: discontinued,
      meta: { message: 'Medication marked as discontinued with clinical justification' }
    });
  } catch (err) {
    if (err instanceof MedicationError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to discontinue medication' } });
  }
});
