/**
 * CLINILYNC Care Plans API Router (v1)
 * 
 * Base path: /api/v1/care-plans
 */

import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest, requirePermission } from '../../middleware/auth.js';
import { Permissions } from '../../security/permissions.js';
import { CarePlanService, CarePlanError } from '../../services/care-plan.service.js';

export const v1CarePlansRouter = Router();

v1CarePlansRouter.use(authenticateToken);

/**
 * GET /api/v1/care-plans/:carePlanId
 * Get care plan with items
 */
v1CarePlansRouter.get('/:carePlanId', requirePermission(Permissions.CARE_PLAN_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { carePlanId } = req.params;

  try {
    const carePlan = await CarePlanService.getCarePlanById(
      context.activeOrganization.id,
      carePlanId,
      context.user.id,
      context.roles[0]?.code
    );

    res.json({ data: { carePlan } });
  } catch (err) {
    if (err instanceof CarePlanError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve care plan.' } });
  }
});

/**
 * PATCH /api/v1/care-plans/:carePlanId
 * Update care plan title, rationale, description, review date
 */
v1CarePlansRouter.patch('/:carePlanId', requirePermission(Permissions.CARE_PLAN_UPDATE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { carePlanId } = req.params;
  const { title, clinicalRationale, description, reviewDate } = req.body;

  try {
    const carePlan = await CarePlanService.updateCarePlan({
      organizationId: context.activeOrganization.id,
      carePlanId,
      title,
      clinicalRationale,
      description,
      reviewDate,
      userId: context.user.id,
      userRole: context.roles[0]?.code,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ data: { carePlan } });
  } catch (err) {
    if (err instanceof CarePlanError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update care plan.' } });
  }
});

/**
 * POST /api/v1/care-plans/:carePlanId/activate
 * Activate a draft or on-hold care plan
 */
v1CarePlansRouter.post('/:carePlanId/activate', requirePermission(Permissions.CARE_PLAN_UPDATE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { carePlanId } = req.params;

  try {
    const carePlan = await CarePlanService.transitionCarePlanStatus({
      organizationId: context.activeOrganization.id,
      carePlanId,
      targetStatus: 'ACTIVE',
      userId: context.user.id,
      userRole: context.roles[0]?.code,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ data: { carePlan } });
  } catch (err) {
    if (err instanceof CarePlanError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to activate care plan.' } });
  }
});

/**
 * POST /api/v1/care-plans/:carePlanId/complete
 * Complete a care plan
 */
v1CarePlansRouter.post('/:carePlanId/complete', requirePermission(Permissions.CARE_PLAN_COMPLETE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { carePlanId } = req.params;
  const { statusReason } = req.body;

  try {
    const carePlan = await CarePlanService.transitionCarePlanStatus({
      organizationId: context.activeOrganization.id,
      carePlanId,
      targetStatus: 'COMPLETED',
      statusReason,
      userId: context.user.id,
      userRole: context.roles[0]?.code,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ data: { carePlan } });
  } catch (err) {
    if (err instanceof CarePlanError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to complete care plan.' } });
  }
});

/**
 * POST /api/v1/care-plans/:carePlanId/cancel
 * Cancel a care plan
 */
v1CarePlansRouter.post('/:carePlanId/cancel', requirePermission(Permissions.CARE_PLAN_CANCEL), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { carePlanId } = req.params;
  const { statusReason } = req.body;

  try {
    const carePlan = await CarePlanService.transitionCarePlanStatus({
      organizationId: context.activeOrganization.id,
      carePlanId,
      targetStatus: 'CANCELLED',
      statusReason,
      userId: context.user.id,
      userRole: context.roles[0]?.code,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ data: { carePlan } });
  } catch (err) {
    if (err instanceof CarePlanError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to cancel care plan.' } });
  }
});

/**
 * POST /api/v1/care-plans/:carePlanId/items
 * Add an item/action to a care plan
 */
v1CarePlansRouter.post('/:carePlanId/items', requirePermission(Permissions.CARE_PLAN_UPDATE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { carePlanId } = req.params;
  const { category, description, responsibleRole, dueDate } = req.body;

  try {
    const item = await CarePlanService.addCarePlanItem({
      organizationId: context.activeOrganization.id,
      carePlanId,
      category,
      description,
      responsibleRole,
      dueDate,
      userId: context.user.id,
      userRole: context.roles[0]?.code,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(201).json({ data: { item } });
  } catch (err) {
    if (err instanceof CarePlanError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to add item to care plan.' } });
  }
});

/**
 * PATCH /api/v1/care-plans/:carePlanId/items/:itemId
 * Update care plan item
 */
v1CarePlansRouter.patch('/:carePlanId/items/:itemId', requirePermission(Permissions.CARE_PLAN_UPDATE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { carePlanId, itemId } = req.params;
  const { description, status, completionNotes } = req.body;

  try {
    const item = await CarePlanService.updateCarePlanItem({
      organizationId: context.activeOrganization.id,
      carePlanId,
      itemId,
      description,
      status,
      completionNotes,
      userId: context.user.id,
      userRole: context.roles[0]?.code,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ data: { item } });
  } catch (err) {
    if (err instanceof CarePlanError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update care plan item.' } });
  }
});

/**
 * POST /api/v1/care-plans/:carePlanId/items/:itemId/complete
 * Mark item completed
 */
v1CarePlansRouter.post('/:carePlanId/items/:itemId/complete', requirePermission(Permissions.CARE_PLAN_UPDATE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { carePlanId, itemId } = req.params;
  const { completionNotes } = req.body;

  try {
    const item = await CarePlanService.updateCarePlanItem({
      organizationId: context.activeOrganization.id,
      carePlanId,
      itemId,
      status: 'COMPLETED',
      completionNotes,
      userId: context.user.id,
      userRole: context.roles[0]?.code,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ data: { item } });
  } catch (err) {
    if (err instanceof CarePlanError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to complete item.' } });
  }
});
