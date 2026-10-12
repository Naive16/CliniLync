-- Migration: 007_clinical_encounters_notes_observations.sql
-- Description: Phase 8 Clinical encounters, clinical notes, note version snapshots, and observations schema

-- 1. Clinical Encounters Table
CREATE TABLE IF NOT EXISTS encounters (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    patient_id VARCHAR(64) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    provider_id VARCHAR(64) NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
    appointment_id VARCHAR(64) REFERENCES appointments(id) ON DELETE SET NULL,
    encounter_type VARCHAR(64) NOT NULL DEFAULT 'IN_PERSON',
    status VARCHAR(32) NOT NULL DEFAULT 'PLANNED',
    reason_for_visit TEXT,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/London',
    cancellation_reason TEXT,
    cancelled_at TIMESTAMPTZ,
    cancelled_by_user_id VARCHAR(64) REFERENCES users(id),
    completed_at TIMESTAMPTZ,
    completed_by_user_id VARCHAR(64) REFERENCES users(id),
    created_by_user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    updated_by_user_id VARCHAR(64) REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Clinical Notes Table
CREATE TABLE IF NOT EXISTS clinical_notes (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    encounter_id VARCHAR(64) NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
    patient_id VARCHAR(64) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    author_id VARCHAR(64) NOT NULL REFERENCES users(id),
    author_provider_id VARCHAR(64) REFERENCES providers(id),
    note_type VARCHAR(64) NOT NULL DEFAULT 'PROGRESS_NOTE',
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    version INT NOT NULL DEFAULT 1,
    chief_complaint TEXT,
    history_of_present_illness TEXT,
    past_medical_history TEXT,
    surgical_history TEXT,
    family_social_history TEXT,
    review_of_systems TEXT,
    physical_examination TEXT,
    assessment TEXT,
    plan TEXT,
    follow_up_instructions TEXT,
    signed_at TIMESTAMPTZ,
    signed_by_user_id VARCHAR(64) REFERENCES users(id),
    amended_from_note_id VARCHAR(64) REFERENCES clinical_notes(id),
    amendment_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Clinical Note Versions Table (Defensible immutable audit & amendment history)
CREATE TABLE IF NOT EXISTS clinical_note_versions (
    id VARCHAR(64) PRIMARY KEY,
    note_id VARCHAR(64) NOT NULL REFERENCES clinical_notes(id) ON DELETE CASCADE,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    status VARCHAR(32) NOT NULL,
    snapshot_data TEXT NOT NULL,
    author_id VARCHAR(64) NOT NULL REFERENCES users(id),
    signed_by_user_id VARCHAR(64) REFERENCES users(id),
    signed_at TIMESTAMPTZ,
    amended_by_user_id VARCHAR(64) REFERENCES users(id),
    amended_at TIMESTAMPTZ,
    amendment_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Clinical Observations & Vital Signs Table
CREATE TABLE IF NOT EXISTS clinical_observations (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    encounter_id VARCHAR(64) NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
    patient_id VARCHAR(64) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    recorded_by_user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    observation_type VARCHAR(64) NOT NULL,
    numeric_value DECIMAL(10, 2),
    text_value VARCHAR(255),
    unit VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'FINAL',
    notes TEXT,
    measured_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Indexes for fast retrieval
CREATE INDEX IF NOT EXISTS idx_encounters_patient_id ON encounters(patient_id);
CREATE INDEX IF NOT EXISTS idx_encounters_provider_id ON encounters(provider_id);
CREATE INDEX IF NOT EXISTS idx_encounters_org_id ON encounters(organization_id);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_encounter_id ON clinical_notes(encounter_id);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_patient_id ON clinical_notes(patient_id);
CREATE INDEX IF NOT EXISTS idx_clinical_note_versions_note_id ON clinical_note_versions(note_id);
CREATE INDEX IF NOT EXISTS idx_clinical_observations_encounter ON clinical_observations(encounter_id);
CREATE INDEX IF NOT EXISTS idx_clinical_observations_patient ON clinical_observations(patient_id);
