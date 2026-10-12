import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth.js';
import { enforceTenantIsolation } from '../../middleware/tenant.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { Permissions } from '../../security/permissions.js';
import { SubscriptionError, SubscriptionService, UnconfiguredBillingProvider } from '../../services/subscription.service.js';

export const v1SubscriptionsRouter = Router();
v1SubscriptionsRouter.use(authenticateToken, enforceTenantIsolation);

v1SubscriptionsRouter.get('/plans', requirePermission(Permissions.SUBSCRIPTION_VIEW), async (_req: AuthenticatedRequest, res: Response) => {
  res.json({ data: { plans: await new SubscriptionService().listPlans() } });
});

v1SubscriptionsRouter.get('/current', requirePermission(Permissions.SUBSCRIPTION_VIEW), async (req: AuthenticatedRequest, res: Response) => {
  const context = req.securityContext!;
  res.json({ data: await new SubscriptionService().getCurrent(context.activeOrganization.id) });
});

v1SubscriptionsRouter.post('/trial', requirePermission(Permissions.SUBSCRIPTION_MANAGE), async (req: AuthenticatedRequest, res: Response) => {
  const context = req.securityContext!;
  try {
    const result = await new SubscriptionService().startTrial(context.activeOrganization.id, context.user.id);
    res.status(result.created ? 201 : 200).json({ data: result });
  } catch (error) {
    const e = error as SubscriptionError;
    res.status(e.status || 500).json({ error: { code: e.code || 'SUBSCRIPTION_ERROR', message: e.message } });
  }
});

v1SubscriptionsRouter.post('/cancel', requirePermission(Permissions.SUBSCRIPTION_MANAGE), async (req: AuthenticatedRequest, res: Response) => {
  const context = req.securityContext!;
  try {
    const subscription = await new SubscriptionService().cancelAtPeriodEnd(context.activeOrganization.id, context.user.id);
    res.json({ data: { subscription } });
  } catch (error) {
    const e = error as SubscriptionError;
    res.status(e.status || 500).json({ error: { code: e.code || 'SUBSCRIPTION_ERROR', message: e.message } });
  }
});

v1SubscriptionsRouter.post('/checkout', requirePermission(Permissions.SUBSCRIPTION_MANAGE), async (req: AuthenticatedRequest, res: Response) => {
  const context = req.securityContext!;
  try {
    await new UnconfiguredBillingProvider().createCheckoutSession({
      organizationId: context.activeOrganization.id,
      planCode: String(req.body?.planCode || ''),
      successUrl: String(req.body?.successUrl || ''),
      cancelUrl: String(req.body?.cancelUrl || '')
    });
  } catch (error) {
    const e = error as SubscriptionError;
    res.status(e.status).json({ error: { code: e.code, message: e.message } });
  }
});
