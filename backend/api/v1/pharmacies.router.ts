/**
 * CLINILYNC Pharmacies API Router (v1)
 * 
 * Base path: /api/v1/pharmacies
 */

import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth.js';
import { enforceTenantIsolation } from '../../middleware/tenant.js';
import { Permissions } from '../../security/permissions.js';
import { MedicationService, MedicationError } from '../../services/medication.service.js';

export const v1PharmaciesRouter = Router();

v1PharmaciesRouter.use(authenticateToken);
v1PharmaciesRouter.use(enforceTenantIsolation);

// GET /api/v1/pharmacies
v1PharmaciesRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;

  if (!context.permissions.includes(Permissions.PHARMACY_VIEW)) {
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'User lacks pharmacy.view permission' }
    });
    return;
  }

  try {
    const result = await MedicationService.listPharmacies(context.activeOrganization.id);
    res.json({
      data: result.pharmacies,
      meta: { total: result.total }
    });
  } catch (err) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list pharmacies' } });
  }
});

// POST /api/v1/pharmacies
v1PharmaciesRouter.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;

  if (!context.permissions.includes(Permissions.PHARMACY_MANAGE)) {
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'User lacks pharmacy.manage permission' }
    });
    return;
  }

  try {
    const pharmacy = await MedicationService.createPharmacy(
      req.body,
      {
        organizationId: context.activeOrganization.id,
        userId: context.user.id,
        userRole: context.membership?.role || context.roles[0]?.code,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      }
    );

    res.status(201).json({
      data: pharmacy,
      meta: { message: 'Pharmacy location registered successfully' }
    });
  } catch (err) {
    if (err instanceof MedicationError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create pharmacy' } });
  }
});
