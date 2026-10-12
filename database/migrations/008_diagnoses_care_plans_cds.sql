-- Migration: 008_diagnoses_care_plans_cds.sql
-- Description: Phase 9 Encounter diagnoses, longitudinal problem lists, care plans, plan items, follow-up instructions, and clinical decision support foundations

-- 1. Standardized Terminology Catalog
CREATE TABLE IF NOT EXISTS terminology_concepts (
    id VARCHAR(64) PRIMARY KEY,
    system VARCHAR(64) NOT NULL,
    version VARCHAR(32) NOT NULL DEFAULT '2026',
    code VARCHAR(64) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    category VARCHAR(64) DEFAULT 'DIAGNOSIS',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (system, code)
);

-- 2. Encounter Diagnoses Table
CREATE TABLE IF NOT EXISTS encounter_diagnoses (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    patient_id VARCHAR(64) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id VARCHAR(64) NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
    diagnosis_code VARCHAR(64),
    terminology_system VARCHAR(64) DEFAULT 'ICD-10',
    terminology_version VARCHAR(32) DEFAULT '2026',
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    diagnosis_type VARCHAR(64) NOT NULL DEFAULT 'PRIMARY',
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    clinical_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    onset_date DATE,
    diagnosed_date DATE NOT NULL DEFAULT CURRENT_DATE,
    recorded_by_user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Longitudinal Patient Problems Table (Separate from single-encounter visits!)
CREATE TABLE IF NOT EXISTS patient_problems (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    patient_id VARCHAR(64) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    problem_name VARCHAR(255) NOT NULL,
    code VARCHAR(64),
    terminology_system VARCHAR(64) DEFAULT 'ICD-10',
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    onset_date DATE,
    resolved_date DATE,
    resolution_notes TEXT,
    encounter_id VARCHAR(64) REFERENCES encounters(id) ON DELETE SET NULL,
    recorded_by_user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    reviewed_by_user_id VARCHAR(64) REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Care Plans Table
CREATE TABLE IF NOT EXISTS care_plans (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    patient_id VARCHAR(64) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id VARCHAR(64) REFERENCES encounters(id) ON DELETE SET NULL,
    responsible_provider_id VARCHAR(64) REFERENCES providers(id) ON DELETE RESTRICT,
    title VARCHAR(255) NOT NULL,
    clinical_rationale TEXT,
    description TEXT,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    review_date DATE,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    status_reason TEXT,
    created_by_user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    updated_by_user_id VARCHAR(64) REFERENCES users(id),
    completed_at TIMESTAMPTZ,
    completed_by_user_id VARCHAR(64) REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Care Plan Items Table
CREATE TABLE IF NOT EXISTS care_plan_items (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    care_plan_id VARCHAR(64) NOT NULL REFERENCES care_plans(id) ON DELETE CASCADE,
    patient_id VARCHAR(64) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    category VARCHAR(64) NOT NULL DEFAULT 'SELF_CARE',
    description TEXT NOT NULL,
    responsible_role VARCHAR(64) DEFAULT 'PATIENT',
    due_date DATE,
    status VARCHAR(32) NOT NULL DEFAULT 'PLANNED',
    completion_notes TEXT,
    completed_at TIMESTAMPTZ,
    completed_by_user_id VARCHAR(64) REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. Follow-Up Instructions Table
CREATE TABLE IF NOT EXISTS follow_up_instructions (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    patient_id VARCHAR(64) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id VARCHAR(64) REFERENCES encounters(id) ON DELETE CASCADE,
    care_plan_id VARCHAR(64) REFERENCES care_plans(id) ON DELETE SET NULL,
    timeframe VARCHAR(100),
    reassessment_date DATE,
    instructions TEXT NOT NULL,
    warning_signs TEXT,
    is_patient_facing BOOLEAN NOT NULL DEFAULT TRUE,
    author_id VARCHAR(64) NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. Clinical Decision Support Rules & Alerts (Clinician-Reviewed Safety Foundation)
CREATE TABLE IF NOT EXISTS clinical_rules (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    clinical_context VARCHAR(100) NOT NULL,
    rule_status VARCHAR(32) NOT NULL DEFAULT 'DISABLED',
    severity VARCHAR(32) NOT NULL DEFAULT 'INFO',
    evidence_reference TEXT,
    human_explanation TEXT NOT NULL,
    created_by_user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    activated_at TIMESTAMPTZ,
    activated_by_user_id VARCHAR(64) REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clinical_alerts (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    patient_id VARCHAR(64) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id VARCHAR(64) REFERENCES encounters(id) ON DELETE CASCADE,
    rule_id VARCHAR(64) NOT NULL REFERENCES clinical_rules(id) ON DELETE CASCADE,
    rule_version VARCHAR(32) DEFAULT '1.0',
    severity VARCHAR(32) NOT NULL DEFAULT 'INFO',
    explanation TEXT NOT NULL,
    trigger_context TEXT,
    review_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    reviewed_by_user_id VARCHAR(64) REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. Indexes for Efficient Querying
CREATE INDEX IF NOT EXISTS idx_encounter_diagnoses_enc ON encounter_diagnoses(encounter_id);
CREATE INDEX IF NOT EXISTS idx_encounter_diagnoses_pat ON encounter_diagnoses(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_problems_pat ON patient_problems(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_problems_status ON patient_problems(status);
CREATE INDEX IF NOT EXISTS idx_care_plans_pat ON care_plans(patient_id);
CREATE INDEX IF NOT EXISTS idx_care_plan_items_plan ON care_plan_items(care_plan_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_enc ON follow_up_instructions(encounter_id);
CREATE INDEX IF NOT EXISTS idx_clinical_alerts_pat ON clinical_alerts(patient_id);
