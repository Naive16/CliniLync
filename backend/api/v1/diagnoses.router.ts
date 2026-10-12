/**
 * CLINILYNC Diagnoses API Router (v1)
 * 
 * Base path: /api/v1/diagnoses
 */

import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest, requirePermission } from '../../middleware/auth.js';
import { Permissions } from '../../security/permissions.js';
import { DiagnosisService, DiagnosisError } from '../../services/diagnosis.service.js';

export const v1DiagnosesRouter = Router();

v1DiagnosesRouter.use(authenticateToken);

/**
 * PATCH /api/v1/diagnoses/:diagnosisId
 * Update diagnosis details or primary/secondary designation
 */
v1DiagnosesRouter.patch('/:diagnosisId', requirePermission(Permissions.DIAGNOSIS_UPDATE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { diagnosisId } = req.params;
  const { displayName, description, isPrimary, clinicalStatus, diagnosisType } = req.body;

  try {
    const diagnosis = await DiagnosisService.updateDiagnosis({
      organizationId: context.activeOrganization.id,
      diagnosisId,
      displayName,
      description,
      isPrimary,
      clinicalStatus,
      diagnosisType,
      userId: context.user.id,
      userRole: context.roles[0]?.code,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ data: { diagnosis } });
  } catch (err) {
    if (err instanceof DiagnosisError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update diagnosis.' } });
  }
});

/**
 * POST /api/v1/diagnoses/:diagnosisId/resolve
 * Mark diagnosis as resolved
 */
v1DiagnosesRouter.post('/:diagnosisId/resolve', requirePermission(Permissions.DIAGNOSIS_RESOLVE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { diagnosisId } = req.params;

  try {
    const diagnosis = await DiagnosisService.resolveDiagnosis({
      organizationId: context.activeOrganization.id,
      diagnosisId,
      userId: context.user.id,
      userRole: context.roles[0]?.code,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ data: { diagnosis } });
  } catch (err) {
    if (err instanceof DiagnosisError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to resolve diagnosis.' } });
  }
});
