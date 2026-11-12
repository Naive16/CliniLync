-- Migration: 015_email_verified_onboarding.sql
-- Description: Server-authoritative clinic onboarding lifecycle and email verification.

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_step INTEGER NOT NULL DEFAULT 7;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_admin_user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_started_at TIMESTAMPTZ;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS organization_onboarding_steps (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    step_key VARCHAR(64) NOT NULL,
    completed_at TIMESTAMPTZ,
    completed_by_user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    metadata TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (organization_id, step_key)
);

CREATE TABLE IF NOT EXISTS organization_email_verifications (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(128) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_onboarding_steps_org ON organization_onboarding_steps(organization_id);
CREATE INDEX IF NOT EXISTS idx_email_verifications_lookup ON organization_email_verifications(token_hash, expires_at);
