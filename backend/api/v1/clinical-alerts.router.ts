/**
 * CLINILYNC Clinical Alerts & Rules API Router (v1)
 * 
 * Base path: /api/v1/clinical-alerts & /api/v1/clinical-rules
 * 
 * Enforces:
 * 1. Clinician-reviewed evaluation (zero autonomous diagnosis/prescribing)
 * 2. Organization isolation
 * 3. Append-only sanitized audit trail
 */

import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest, requirePermission } from '../../middleware/auth.js';
import { Permissions } from '../../security/permissions.js';
import { CDSService, CDSError } from '../../services/cds.service.js';

export const v1ClinicalAlertsRouter = Router();
export const v1ClinicalRulesRouter = Router();

v1ClinicalAlertsRouter.use(authenticateToken);
v1ClinicalRulesRouter.use(authenticateToken);

/**
 * GET /api/v1/clinical-alerts
 * List clinical alerts for organization, optionally filtered by patientId or encounterId
 */
v1ClinicalAlertsRouter.get('/', requirePermission(Permissions.CLINICAL_ALERT_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { patientId, encounterId } = req.query;

  try {
    const alerts = await CDSService.getClinicalAlerts({
      organizationId: context.activeOrganization.id,
      patientId: patientId ? String(patientId) : undefined,
      encounterId: encounterId ? String(encounterId) : undefined,
      userId: context.user.id,
      userRole: context.roles[0]?.code
    });

    res.json({
      data: {
        alerts,
        total: alerts.length
      }
    });
  } catch (err) {
    if (err instanceof CDSError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve clinical alerts.' } });
  }
});

/**
 * GET /api/v1/clinical-alerts/:alertId
 * Get single clinical alert
 */
v1ClinicalAlertsRouter.get('/:alertId', requirePermission(Permissions.CLINICAL_ALERT_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { alertId } = req.params;

  try {
    const alert = await CDSService.getClinicalAlertById(
      context.activeOrganization.id,
      alertId,
      context.user.id,
      context.roles[0]?.code
    );

    res.json({ data: { alert } });
  } catch (err) {
    if (err instanceof CDSError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve clinical alert.' } });
  }
});

/**
 * POST /api/v1/clinical-alerts/:alertId/review
 * Clinician review of clinical alert (ACKNOWLEDGED, DISMISSED, ACTION_TAKEN)
 */
v1ClinicalAlertsRouter.post('/:alertId/review', requirePermission(Permissions.CLINICAL_ALERT_REVIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { alertId } = req.params;
  const { reviewStatus, reviewNotes } = req.body;

  if (!reviewStatus || !['ACKNOWLEDGED', 'DISMISSED', 'ACTION_TAKEN'].includes(reviewStatus)) {
    res.status(400).json({ error: { code: 'INVALID_STATUS', message: 'Valid reviewStatus is required (ACKNOWLEDGED, DISMISSED, ACTION_TAKEN).' } });
    return;
  }

  try {
    const alert = await CDSService.reviewClinicalAlert({
      organizationId: context.activeOrganization.id,
      alertId,
      reviewStatus,
      reviewNotes,
      userId: context.user.id,
      userRole: context.roles[0]?.code,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ data: { alert } });
  } catch (err) {
    if (err instanceof CDSError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to review clinical alert.' } });
  }
});

/**
 * GET /api/v1/clinical-rules
 * List clinical decision support rules
 */
v1ClinicalRulesRouter.get('/', requirePermission(Permissions.CLINICAL_ALERT_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;

  try {
    const rules = await CDSService.getClinicalRules(
      context.activeOrganization.id,
      context.user.id,
      context.roles[0]?.code
    );

    res.json({
      data: {
        rules,
        total: rules.length
      }
    });
  } catch (err) {
    if (err instanceof CDSError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve clinical rules.' } });
  }
});

/**
 * POST /api/v1/clinical-rules/:ruleId/toggle
 * Toggle clinical rule status (DISABLED, TESTING, ACTIVE)
 */
v1ClinicalRulesRouter.post('/:ruleId/toggle', requirePermission(Permissions.CLINICAL_RULE_MANAGE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { ruleId } = req.params;
  const { targetStatus } = req.body;

  if (!targetStatus || !['DISABLED', 'TESTING', 'ACTIVE'].includes(targetStatus)) {
    res.status(400).json({ error: { code: 'INVALID_STATUS', message: 'targetStatus must be DISABLED, TESTING, or ACTIVE.' } });
    return;
  }

  try {
    const rule = await CDSService.toggleRuleStatus({
      organizationId: context.activeOrganization.id,
      ruleId,
      targetStatus,
      userId: context.user.id,
      userRole: context.roles[0]?.code,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ data: { rule } });
  } catch (err) {
    if (err instanceof CDSError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to toggle clinical rule.' } });
  }
});
