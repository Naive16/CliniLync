-- Migration: 016_patient_portal_invitations.sql
-- Description: Secure, expiring clinic-issued invitations for patient portal activation

CREATE TABLE IF NOT EXISTS patient_portal_invitations (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    patient_id VARCHAR(64) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    invited_by_user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    email VARCHAR(255) NOT NULL,
    token_hash VARCHAR(128) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_patient_portal_invitations_token ON patient_portal_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_patient_portal_invitations_patient ON patient_portal_invitations(organization_id, patient_id);
