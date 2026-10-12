/**
 * CLINILYNC Follow-Up API Router (v1)
 * 
 * Base path: /api/v1/follow-up
 */

import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest, requirePermission } from '../../middleware/auth.js';
import { Permissions } from '../../security/permissions.js';
import { CarePlanService, CarePlanError } from '../../services/care-plan.service.js';

export const v1FollowUpRouter = Router();

v1FollowUpRouter.use(authenticateToken);

/**
 * PATCH /api/v1/follow-up/:followUpId
 * Update follow-up instruction
 */
v1FollowUpRouter.patch('/:followUpId', requirePermission(Permissions.FOLLOW_UP_MANAGE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { followUpId } = req.params;
  const { timeframe, reassessmentDate, instructions, warningSigns, isPatientFacing } = req.body;

  try {
    const followUp = await CarePlanService.updateFollowUp({
      organizationId: context.activeOrganization.id,
      followUpId,
      timeframe,
      reassessmentDate,
      instructions,
      warningSigns,
      isPatientFacing,
      userId: context.user.id,
      userRole: context.roles[0]?.code,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ data: { followUp } });
  } catch (err) {
    if (err instanceof CarePlanError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update follow-up instruction.' } });
  }
});
