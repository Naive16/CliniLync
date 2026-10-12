-- Migration: 004_phase5_rbac_and_memberships.sql
-- Description: Phase 5 RBAC completeness, organization management permissions, and multi-tenant membership tests

-- 1. Insert New Permissions
INSERT INTO permissions (id, code, category, description, created_at)
VALUES 
  ('perm_organization.view', 'organization.view', 'organization', 'Grants organization.view capability across organization', CURRENT_TIMESTAMP),
  ('perm_organization.update', 'organization.update', 'organization', 'Grants organization.update capability across organization', CURRENT_TIMESTAMP),
  ('perm_role.view', 'role.view', 'role', 'Grants role.view capability across organization', CURRENT_TIMESTAMP),
  ('perm_role.create', 'role.create', 'role', 'Grants role.create capability across organization', CURRENT_TIMESTAMP),
  ('perm_role.update', 'role.update', 'role', 'Grants role.update capability across organization', CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;

-- Roles, role-permission mappings, and memberships are demo fixtures owned by
-- database/seed.ts. Keeping them out of migrations makes a clean schema
-- installable before any users, organizations, or fixture data exist.
