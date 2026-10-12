-- Migration: 005_patient_management.sql
-- Description: Phase 6 Patient management schema extensions, emergency contacts, and consent records

-- 1. Extend patients table with lifecycle status, language, preferences, and archiving metadata
ALTER TABLE patients ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(32) DEFAULT 'en';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS contact_preference VARCHAR(32) DEFAULT 'EMAIL';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS archived_reason TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS archived_by VARCHAR(64) REFERENCES users(id);

-- 2. Structured Patient Emergency & Personal Contacts Table
CREATE TABLE IF NOT EXISTS patient_contacts (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    patient_id VARCHAR(64) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    relationship VARCHAR(64) NOT NULL,
    phone VARCHAR(32) NOT NULL,
    email VARCHAR(255),
    is_emergency_contact BOOLEAN NOT NULL DEFAULT TRUE,
    has_legal_authority BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Patient Informed Consent Foundations Table
CREATE TABLE IF NOT EXISTS patient_consents (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    patient_id VARCHAR(64) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    consent_type VARCHAR(64) NOT NULL,
    purpose TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'GRANTED',
    granted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    revoked_by_user_id VARCHAR(64) REFERENCES users(id),
    recorded_by_user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Fast Retrieval Indexes
CREATE INDEX IF NOT EXISTS idx_patients_org_status ON patients(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_patient_contacts_patient ON patient_contacts(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_consents_patient ON patient_consents(patient_id);

-- Demo contacts and consent records are created by database/seed.ts after
-- organizations, patients, and users exist. Migrations remain schema-only.
