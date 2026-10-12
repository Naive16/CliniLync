/**
 * CLINILYNC Allergies Direct API Router (v1)
 * 
 * Base path: /api/v1/allergies
 */

import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth.js';
import { enforceTenantIsolation } from '../../middleware/tenant.js';
import { Permissions } from '../../security/permissions.js';
import { MedicationService, MedicationError } from '../../services/medication.service.js';

export const v1AllergiesRouter = Router();

v1AllergiesRouter.use(authenticateToken);
v1AllergiesRouter.use(enforceTenantIsolation);

// PATCH /api/v1/allergies/:allergyId
v1AllergiesRouter.patch('/:allergyId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;

  if (!context.permissions.includes(Permissions.ALLERGY_MANAGE)) {
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'User lacks allergy.manage permission' }
    });
    return;
  }

  try {
    const updated = await MedicationService.updatePatientAllergy(
      req.params.allergyId,
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
      meta: { message: 'Allergy record updated successfully' }
    });
  } catch (err) {
    if (err instanceof MedicationError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update allergy record' } });
  }
});
