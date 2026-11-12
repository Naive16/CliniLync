import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth.js';
import { enforceTenantIsolation } from '../../middleware/tenant.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { Permissions } from '../../security/permissions.js';
import { SubscriptionError, SubscriptionService, UnconfiguredBillingProvider } from '../../services/subscription.service.js';
import { config } from '../../config/index.js';

export const v1SubscriptionsRouter = Router();
v1SubscriptionsRouter.use(authenticateToken, enforceTenantIsolation);

v1SubscriptionsRouter.get('/plans', requirePermission(Permissions.SUBSCRIPTION_VIEW), async (req: AuthenticatedRequest, res: Response) => {
  const context = req.securityContext!;
  res.json({ data: await new SubscriptionService().getPlansForOrganization(context.activeOrganization.id) });
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
    const planCode = String(req.body?.planCode || '').trim();
    const plans = await new SubscriptionService().getPlansForOrganization(context.activeOrganization.id);
    if (!plans.plans.some((plan) => plan.code === planCode)) {
      res.status(400).json({ error: { code: 'SUBSCRIPTION_PLAN_INVALID', message: 'Choose an available monthly staff plan.' } });
      return;
    }
    const result = await new UnconfiguredBillingProvider().createCheckoutSession({
      organizationId: context.activeOrganization.id,
      planCode,
      successUrl: `${config.appUrl.replace(/\/$/, '')}/app/settings?subscription=success`,
      cancelUrl: `${config.appUrl.replace(/\/$/, '')}/app/settings?subscription=canceled`
    });
    res.status(200).json({ data: result });
  } catch (error) {
    const e = error as SubscriptionError;
    res.status(e.status).json({ error: { code: e.code, message: e.message } });
  }
});
