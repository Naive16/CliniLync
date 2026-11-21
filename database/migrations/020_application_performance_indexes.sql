-- Migration: 020_application_performance_indexes.sql
-- Description: Add indexes for common tenant-scoped list and schedule queries.
-- Safe additive migration: no records or existing schema objects are changed.

CREATE INDEX IF NOT EXISTS idx_patients_org_created_at
  ON patients (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_appointments_org_scheduled_time
  ON appointments (organization_id, scheduled_time ASC);
