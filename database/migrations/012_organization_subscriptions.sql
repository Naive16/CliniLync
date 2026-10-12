-- Migration: 012_organization_subscriptions.sql
-- Description: Versioned organization plans, seven-day trials, subscriptions, and webhook idempotency.

CREATE TABLE IF NOT EXISTS subscription_plans (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
    currency VARCHAR(3) NOT NULL,
    interval VARCHAR(16) NOT NULL CHECK (interval IN ('month', 'year')),
    trial_days INT NOT NULL DEFAULT 7 CHECK (trial_days >= 0 AND trial_days <= 30),
    entitlements JSONB NOT NULL DEFAULT '{}'::jsonb,
    version INT NOT NULL DEFAULT 1 CHECK (version > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS organization_subscriptions (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    plan_id VARCHAR(64) NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    status VARCHAR(32) NOT NULL CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'expired')),
    trial_started_at TIMESTAMPTZ,
    trial_ends_at TIMESTAMPTZ,
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    canceled_at TIMESTAMPTZ,
    provider VARCHAR(64),
    provider_customer_id VARCHAR(255),
    provider_subscription_id VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (organization_id),
    CHECK (trial_ends_at IS NULL OR trial_started_at IS NOT NULL),
    CHECK (current_period_end > current_period_start)
);

CREATE INDEX IF NOT EXISTS idx_org_subscriptions_status ON organization_subscriptions(status, current_period_end);
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_provider ON organization_subscriptions(provider, provider_subscription_id);

CREATE TABLE IF NOT EXISTS subscription_events (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    subscription_id VARCHAR(64) NOT NULL REFERENCES organization_subscriptions(id) ON DELETE CASCADE,
    event_type VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
    id VARCHAR(128) PRIMARY KEY,
    provider VARCHAR(64) NOT NULL,
    event_type VARCHAR(128) NOT NULL,
    payload_hash VARCHAR(128) NOT NULL,
    processed_at TIMESTAMPTZ,
    processing_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_org_created ON subscription_events(organization_id, created_at DESC);
