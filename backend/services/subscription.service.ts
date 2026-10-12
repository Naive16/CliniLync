import crypto from 'node:crypto';
import { getDatabaseClient, IDatabaseClient } from '../../database/db.js';

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';

export interface SubscriptionPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  amount_minor: number;
  currency: string;
  interval: 'month' | 'year';
  trial_days: number;
  entitlements: Record<string, boolean | number | string>;
  version: number;
  is_active: boolean;
}

export interface OrganizationSubscription {
  id: string;
  organization_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  provider: string | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
}

export const STANDARD_PLAN: Omit<SubscriptionPlan, 'id'> & { id: string } = {
  id: 'plan_standard_v1',
  code: 'standard',
  name: 'Standard',
  description: 'Core clinic operations for one organization.',
  amount_minor: 0,
  currency: 'GBP',
  interval: 'month',
  trial_days: 7,
  entitlements: {
    patient_records: true,
    appointments: true,
    encounters: true,
    clinical_notes: true,
    diagnoses: true,
    care_plans: true,
    follow_up: true,
    billing: true,
    staff_seats: 25
  },
  version: 1,
  is_active: true
};

export class SubscriptionError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export class SubscriptionService {
  constructor(private readonly db = getDatabaseClient()) {}

  async ensureStandardPlan(client: IDatabaseClient = this.db): Promise<SubscriptionPlan> {
    const result = await client.query<SubscriptionPlan>(
      `INSERT INTO subscription_plans
        (id, code, name, description, amount_minor, currency, interval, trial_days, entitlements, version, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        STANDARD_PLAN.id, STANDARD_PLAN.code, STANDARD_PLAN.name, STANDARD_PLAN.description,
        STANDARD_PLAN.amount_minor, STANDARD_PLAN.currency, STANDARD_PLAN.interval,
        STANDARD_PLAN.trial_days, JSON.stringify(STANDARD_PLAN.entitlements), STANDARD_PLAN.version,
        STANDARD_PLAN.is_active
      ]
    );
    return result.rows[0] || { ...STANDARD_PLAN };
  }

  async listPlans(): Promise<SubscriptionPlan[]> {
    await this.ensureStandardPlan();
    const result = await this.db.query<SubscriptionPlan>('SELECT * FROM subscription_plans WHERE is_active = TRUE ORDER BY amount_minor ASC, version DESC');
    return result.rows;
  }

  async getCurrent(organizationId: string): Promise<{ subscription: OrganizationSubscription | null; plan: SubscriptionPlan | null }> {
    return this.getCurrentWithClient(this.db, organizationId);
  }

  async startTrial(organizationId: string, actorId: string): Promise<{ subscription: OrganizationSubscription; plan: SubscriptionPlan; created: boolean }> {
    return this.db.transaction(async (tx) => {
      const existing = await this.getCurrentWithClient(tx, organizationId);
      if (existing.subscription && existing.plan) {
        return { subscription: existing.subscription, plan: existing.plan, created: false };
      }

      const plan = await this.ensureStandardPlan(tx);
      const started = new Date();
      const ends = addDays(started, plan.trial_days);
      const subscriptionId = id('sub');
      const subscriptionResult = await tx.query<OrganizationSubscription>(
        `INSERT INTO organization_subscriptions
          (id, organization_id, plan_id, status, trial_started_at, trial_ends_at, current_period_start, current_period_end)
         VALUES ($1,$2,$3,$4,$5,$6,$5,$6) RETURNING *`,
        [subscriptionId, organizationId, plan.id, 'trialing', started.toISOString(), ends.toISOString()]
      );
      const subscription = subscriptionResult.rows[0];
      await tx.query(
        `INSERT INTO subscription_events (id, organization_id, subscription_id, event_type, status, metadata)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id('subevt'), organizationId, subscription.id, 'trial.started', 'processed', JSON.stringify({ actorId, trialDays: plan.trial_days })]
      );
      return { subscription, plan, created: true };
    });
  }

  async cancelAtPeriodEnd(organizationId: string, actorId: string): Promise<OrganizationSubscription> {
    return this.db.transaction(async (tx) => {
      const current = await this.getCurrentWithClient(tx, organizationId);
      if (!current.subscription) throw new SubscriptionError('SUBSCRIPTION_NOT_FOUND', 'This organization has no subscription.', 404);
      if (current.subscription.status === 'canceled' || current.subscription.status === 'expired') {
        throw new SubscriptionError('SUBSCRIPTION_INACTIVE', 'The organization subscription is already inactive.');
      }
      const result = await tx.query<OrganizationSubscription>(
        `UPDATE organization_subscriptions
         SET cancel_at_period_end = TRUE, canceled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND organization_id = $2 RETURNING *`, [current.subscription.id, organizationId]
      );
      await tx.query(
        `INSERT INTO subscription_events (id, organization_id, subscription_id, event_type, status, metadata)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id('subevt'), organizationId, current.subscription.id, 'subscription.cancel_requested', 'processed', JSON.stringify({ actorId })]
      );
      return result.rows[0];
    });
  }

  async getCurrentWithClient(client: IDatabaseClient, organizationId: string): Promise<{ subscription: OrganizationSubscription | null; plan: SubscriptionPlan | null }> {
    const subscriptionResult = await client.query<OrganizationSubscription>(
      'SELECT * FROM organization_subscriptions WHERE organization_id = $1', [organizationId]
    );
    const subscription = subscriptionResult.rows[0];
    if (!subscription) return { subscription: null, plan: null };
    const planResult = await client.query<SubscriptionPlan>(
      'SELECT * FROM subscription_plans WHERE id = $1', [subscription.plan_id]
    );
    const plan = planResult.rows[0];
    if (!plan) throw new SubscriptionError('SUBSCRIPTION_PLAN_MISSING', 'The subscription plan is missing from the database.', 500);
    return { subscription, plan: { ...plan, amount_minor: Number(plan.amount_minor), trial_days: Number(plan.trial_days), version: Number(plan.version) } };
  }
}

export interface CheckoutRequest {
  organizationId: string;
  planCode: string;
  successUrl: string;
  cancelUrl: string;
}

export interface BillingProvider {
  readonly name: string;
  createCheckoutSession(request: CheckoutRequest): Promise<{ checkoutUrl: string; providerSessionId: string }>;
}

export class UnconfiguredBillingProvider implements BillingProvider {
  readonly name = 'unconfigured';
  async createCheckoutSession(_request: CheckoutRequest): Promise<never> {
    throw new SubscriptionError('PAYMENT_PROVIDER_NOT_CONFIGURED', 'Online checkout is unavailable until a supported payment provider and settlement market are configured.', 503);
  }
}
