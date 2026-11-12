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
  entitlements: Record<string, boolean | number | string | null>;
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

const COMMON_ENTITLEMENTS = {
  patient_records: true,
  appointments: true,
  encounters: true,
  clinical_notes: true,
  diagnoses: true,
  care_plans: true,
  follow_up: true,
  billing: true
} as const;

/** Monthly seat bands. Prices are configuration defaults and should be confirmed before production launch. */
export const SUBSCRIPTION_PLANS: Array<Omit<SubscriptionPlan, 'id'> & { id: string }> = [
  {
    id: 'plan_staff_1_10_v1', code: 'staff_1_10', name: 'Clinic 1–10',
    description: 'Monthly clinic workspace for 1 to 10 active staff.', amount_minor: 2900, currency: 'GBP', interval: 'month', trial_days: 7,
    entitlements: { ...COMMON_ENTITLEMENTS, staff_seats: 10, staff_min: 1, staff_max: 10 }, version: 1, is_active: true
  },
  {
    id: 'plan_staff_11_20_v1', code: 'staff_11_20', name: 'Clinic 11–20',
    description: 'Monthly clinic workspace for 11 to 20 active staff.', amount_minor: 4900, currency: 'GBP', interval: 'month', trial_days: 7,
    entitlements: { ...COMMON_ENTITLEMENTS, staff_seats: 20, staff_min: 11, staff_max: 20 }, version: 1, is_active: true
  },
  {
    id: 'plan_staff_21_50_v1', code: 'staff_21_50', name: 'Clinic 21–50',
    description: 'Monthly clinic workspace for 21 to 50 active staff.', amount_minor: 7900, currency: 'GBP', interval: 'month', trial_days: 7,
    entitlements: { ...COMMON_ENTITLEMENTS, staff_seats: 50, staff_min: 21, staff_max: 50 }, version: 1, is_active: true
  },
  {
    id: 'plan_staff_51_100_v1', code: 'staff_51_100', name: 'Clinic 51–100',
    description: 'Monthly clinic workspace for 51 to 100 active staff.', amount_minor: 12900, currency: 'GBP', interval: 'month', trial_days: 7,
    entitlements: { ...COMMON_ENTITLEMENTS, staff_seats: 100, staff_min: 51, staff_max: 100 }, version: 1, is_active: true
  },
  {
    id: 'plan_staff_101_plus_v1', code: 'staff_101_plus', name: 'Clinic 101+',
    description: 'Monthly clinic workspace for 101 or more active staff.', amount_minor: 19900, currency: 'GBP', interval: 'month', trial_days: 7,
    entitlements: { ...COMMON_ENTITLEMENTS, staff_seats: 'custom', staff_min: 101, staff_max: null }, version: 1, is_active: true
  }
];

// Kept as a compatibility export for callers that used the former single-plan model.
export const STANDARD_PLAN = SUBSCRIPTION_PLANS[0];

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

function normalizePlan(plan: SubscriptionPlan): SubscriptionPlan {
  const rawEntitlements = (plan as unknown as { entitlements?: unknown }).entitlements;
  const entitlements = typeof rawEntitlements === 'string' ? JSON.parse(rawEntitlements) : (rawEntitlements || {});
  return { ...plan, entitlements, amount_minor: Number(plan.amount_minor), trial_days: Number(plan.trial_days), version: Number(plan.version) };
}

export class SubscriptionService {
  constructor(private readonly db = getDatabaseClient()) {}

  async ensureSubscriptionPlans(client: IDatabaseClient = this.db): Promise<SubscriptionPlan[]> {
    const plans: SubscriptionPlan[] = [];
    for (const plan of SUBSCRIPTION_PLANS) {
      const result = await client.query<SubscriptionPlan>(
        `INSERT INTO subscription_plans
          (id, code, name, description, amount_minor, currency, interval, trial_days, entitlements, version, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [plan.id, plan.code, plan.name, plan.description, plan.amount_minor, plan.currency, plan.interval, plan.trial_days, JSON.stringify(plan.entitlements), plan.version, plan.is_active]
      );
      plans.push(result.rows[0] || { ...plan });
    }
    // Do not keep exposing the pre-seat legacy plan in the plan picker.
    await client.query("UPDATE subscription_plans SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE code = 'standard'");
    return plans.map(normalizePlan);
  }

  async ensureStandardPlan(client: IDatabaseClient = this.db): Promise<SubscriptionPlan> {
    const plans = await this.ensureSubscriptionPlans(client);
    return plans[0] || { ...STANDARD_PLAN };
  }

  async getStaffCount(organizationId: string, client: IDatabaseClient = this.db): Promise<number> {
    const memberships = await client.query<{ user_id: string; role_id: string }>(
      'SELECT user_id, role_id FROM user_organizations WHERE organization_id = $1 AND status = $2', [organizationId, 'ACTIVE']
    );
    let count = 0;
    for (const membership of memberships.rows) {
      const userResult = await client.query<{ status: string; is_super_admin: boolean }>('SELECT status, is_super_admin FROM users WHERE id = $1', [membership.user_id]);
      const user = userResult.rows[0];
      if (!user || user.status !== 'ACTIVE' || user.is_super_admin) continue;
      const roleResult = await client.query<{ code: string }>('SELECT code FROM roles WHERE id = $1', [membership.role_id]);
      if (roleResult.rows[0]?.code !== 'PATIENT') count += 1;
    }
    return count;
  }

  private selectPlan(plans: SubscriptionPlan[], staffCount: number): SubscriptionPlan {
    return plans.find((plan) => {
      const min = Number(plan.entitlements.staff_min || 1);
      const max = plan.entitlements.staff_max == null ? Number.POSITIVE_INFINITY : Number(plan.entitlements.staff_max);
      return staffCount >= min && staffCount <= max;
    }) || plans[plans.length - 1] || { ...STANDARD_PLAN };
  }

  async getPlansForOrganization(organizationId: string): Promise<{ plans: SubscriptionPlan[]; staffCount: number; recommendedPlanCode: string }> {
    const plans = await this.ensureSubscriptionPlans();
    const result = await this.db.query<SubscriptionPlan>('SELECT * FROM subscription_plans WHERE is_active = TRUE ORDER BY amount_minor ASC, version DESC');
    const normalized = result.rows.map(normalizePlan);
    const staffCount = await this.getStaffCount(organizationId);
    const recommended = this.selectPlan(normalized.length ? normalized : plans, staffCount);
    return { plans: normalized.length ? normalized : plans, staffCount, recommendedPlanCode: recommended.code };
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

      const plans = await this.ensureSubscriptionPlans(tx);
      const staffCount = await this.getStaffCount(organizationId, tx);
      const plan = this.selectPlan(plans, staffCount);
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
    return { subscription, plan: normalizePlan(plan) };
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
