/**
 * CLINILYNC Medications API Router (v1)
 * 
 * Base path: /api/v1/medications
 */

import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth.js';
import { enforceTenantIsolation } from '../../middleware/tenant.js';
import { Permissions } from '../../security/permissions.js';
import { MedicationService, MedicationError } from '../../services/medication.service.js';

export const v1MedicationsRouter = Router();

v1MedicationsRouter.use(authenticateToken);
v1MedicationsRouter.use(enforceTenantIsolation);

// GET /api/v1/medications/catalog
v1MedicationsRouter.get('/catalog', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;

  if (
    !context.permissions.includes(Permissions.MEDICATION_VIEW) &&
    !context.permissions.includes(Permissions.PRESCRIPTION_VIEW)
  ) {
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'User lacks medication.view or prescription.view permission' }
    });
    return;
  }

  const query = typeof req.query.q === 'string' ? req.query.q : undefined;
  const form = typeof req.query.form === 'string' ? req.query.form : undefined;

  const result = await MedicationService.searchCatalog(query, { form });
  res.json({
    data: result.items,
    meta: { total: result.total }
  });
});

// POST /api/v1/medications/catalog (Local ad-hoc entry)
v1MedicationsRouter.post('/catalog', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;

  if (
    !context.permissions.includes(Permissions.MEDICATION_RECORD) &&
    !context.permissions.includes(Permissions.PRESCRIPTION_CREATE)
  ) {
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'User lacks medication.record or prescription.create permission' }
    });
    return;
  }

  try {
    const item = await MedicationService.createLocalCatalogEntry(
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
      data: item,
      meta: { message: 'Local medication catalog entry registered successfully' }
    });
  } catch (err) {
    if (err instanceof MedicationError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create catalog entry' } });
  }
});
