import { SubscriptionError, SubscriptionService, UnconfiguredBillingProvider } from '../backend/services/subscription.service.js';
import { getDatabaseClient } from '../database/db.js';

interface TestResult { name: string; passed: boolean; error?: string }

export async function runSubscriptionTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const service = new SubscriptionService(getDatabaseClient());
  const organizationId = 'org_st_jude';

  try {
    const first = await service.startTrial(organizationId, 'usr_owner');
    if (!first.created || first.subscription.status !== 'trialing' || first.plan.trial_days !== 7) throw new Error('The standard seven-day trial was not provisioned correctly.');
    const second = await service.startTrial(organizationId, 'usr_owner');
    if (second.created || second.subscription.id !== first.subscription.id) throw new Error('Trial provisioning is not idempotent.');
    results.push({ name: 'Subscriptions - Idempotent Seven-Day Trial Provisioning', passed: true });
  } catch (error) {
    results.push({ name: 'Subscriptions - Idempotent Seven-Day Trial Provisioning', passed: false, error: (error as Error).message });
  }

  try {
    const foreign = await service.getCurrent('org_metro_health');
    if (foreign.subscription) throw new Error('A subscription leaked across organizations.');
    results.push({ name: 'Subscriptions - Organization Isolation', passed: true });
  } catch (error) {
    results.push({ name: 'Subscriptions - Organization Isolation', passed: false, error: (error as Error).message });
  }

  try {
    const canceled = await service.cancelAtPeriodEnd(organizationId, 'usr_owner');
    if (!canceled.cancel_at_period_end || !canceled.canceled_at) throw new Error('Cancellation was not recorded.');
    results.push({ name: 'Subscriptions - Cancel at Period End', passed: true });
  } catch (error) {
    results.push({ name: 'Subscriptions - Cancel at Period End', passed: false, error: (error as Error).message });
  }

  try {
    await new UnconfiguredBillingProvider().createCheckoutSession({ organizationId, planCode: 'standard', successUrl: 'https://example.invalid/success', cancelUrl: 'https://example.invalid/cancel' });
    results.push({ name: 'Subscriptions - Checkout Never Falsely Activates Payment', passed: false, error: 'Checkout unexpectedly succeeded.' });
  } catch (error) {
    if (!(error instanceof SubscriptionError) || error.code !== 'PAYMENT_PROVIDER_NOT_CONFIGURED') results.push({ name: 'Subscriptions - Checkout Never Falsely Activates Payment', passed: false, error: (error as Error).message });
    else results.push({ name: 'Subscriptions - Checkout Never Falsely Activates Payment', passed: true });
  }

  return results;
}
