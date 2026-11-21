-- Migration: 019_onboarding_performance_indexes.sql
-- Description: Add supporting indexes for the clinic onboarding snapshot and staff directory.
-- Safe additive migration: creates indexes only and does not modify existing records.

CREATE INDEX IF NOT EXISTS idx_departments_onboarding_org_active_name
  ON departments (organization_id, is_active, name);

CREATE INDEX IF NOT EXISTS idx_org_invitations_onboarding_pending
  ON organization_invitations (organization_id, expires_at DESC)
  WHERE accepted_at IS NULL AND revoked_at IS NULL AND department_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_organizations_onboarding_directory
  ON user_organizations (organization_id, status, user_id, role_id);
