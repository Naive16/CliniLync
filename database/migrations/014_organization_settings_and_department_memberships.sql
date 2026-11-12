-- Migration: 014_organization_settings_and_department_memberships.sql
-- Adds editable clinic location data and secure department-scoped staff memberships.

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS region VARCHAR(100);
ALTER TABLE organization_invitations ADD COLUMN IF NOT EXISTS department_id VARCHAR(64) REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS administrator_user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS department_memberships (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    department_id VARCHAR(64) NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    membership_role VARCHAR(32) NOT NULL DEFAULT 'STAFF',
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    assigned_by_user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (organization_id, department_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_department_memberships_department ON department_memberships (organization_id, department_id, status);
CREATE INDEX IF NOT EXISTS idx_department_memberships_user ON department_memberships (organization_id, user_id, status);
