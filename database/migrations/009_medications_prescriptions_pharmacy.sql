-- Migration: 009_medications_prescriptions_pharmacy.sql
-- Description: Phase 10 Medication catalog, patient medications, allergies, pharmacies, prescriptions, items, dispensations, and reconciliations

-- 1. Medication Catalog Abstraction
CREATE TABLE IF NOT EXISTS medication_catalog (
    id VARCHAR(64) PRIMARY KEY,
    display_name VARCHAR(255) NOT NULL,
    generic_name VARCHAR(255),
    active_ingredients TEXT,
    strength VARCHAR(64),
    strength_unit VARCHAR(32),
    dosage_form VARCHAR(64) NOT NULL DEFAULT 'TABLET',
    route_of_administration VARCHAR(64) NOT NULL DEFAULT 'ORAL',
    classification VARCHAR(32) NOT NULL DEFAULT 'GENERIC',
    catalog_source VARCHAR(64) NOT NULL DEFAULT 'LOCAL_CATALOG',
    source_version VARCHAR(32) NOT NULL DEFAULT '2026.1',
    external_code VARCHAR(64),
    terminology_system VARCHAR(64),
    is_verified BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Patient Allergies & Adverse Reactions
CREATE TABLE IF NOT EXISTS patient_allergies (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    patient_id VARCHAR(64) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    substance_name VARCHAR(255) NOT NULL,
    allergen_type VARCHAR(64) NOT NULL DEFAULT 'MEDICATION',
    reaction_description TEXT NOT NULL,
    severity VARCHAR(32) NOT NULL DEFAULT 'MODERATE',
    verification_status VARCHAR(32) NOT NULL DEFAULT 'CONFIRMED',
    clinical_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    source_of_information VARCHAR(64) NOT NULL DEFAULT 'CLINICIAN_OBSERVED',
    recorded_by_user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    reviewed_by_user_id VARCHAR(64) REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Patient Medication Records (Longitudinal Medication History)
CREATE TABLE IF NOT EXISTS patient_medications (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    patient_id VARCHAR(64) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    medication_catalog_id VARCHAR(64) REFERENCES medication_catalog(id) ON DELETE SET NULL,
    medication_name VARCHAR(255) NOT NULL,
    dosage VARCHAR(100),
    route VARCHAR(64) DEFAULT 'ORAL',
    frequency VARCHAR(100),
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    source VARCHAR(64) NOT NULL DEFAULT 'CLINICIAN_RECORDED',
    is_patient_reported BOOLEAN NOT NULL DEFAULT FALSE,
    reconciliation_status VARCHAR(32) NOT NULL DEFAULT 'UNRECONCILED',
    encounter_id VARCHAR(64) REFERENCES encounters(id) ON DELETE SET NULL,
    recorded_by_user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    start_date DATE,
    end_date DATE,
    sig_instructions TEXT,
    discontinuation_reason TEXT,
    discontinued_at TIMESTAMPTZ,
    discontinued_by_user_id VARCHAR(64) REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Pharmacies Table (In-house & External dispensing locations)
CREATE TABLE IF NOT EXISTS pharmacies (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(32),
    email VARCHAR(255),
    address_line1 VARCHAR(255),
    city VARCHAR(100),
    postal_code VARCHAR(32),
    country_code VARCHAR(3) NOT NULL DEFAULT 'GBR',
    is_internal BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    integration_status VARCHAR(64) NOT NULL DEFAULT 'LOCAL_WORKFLOW_ONLY',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Prescription Orders Table (Comprehensive Lifecycle State Machine)
CREATE TABLE IF NOT EXISTS prescription_orders (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    patient_id VARCHAR(64) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    provider_id VARCHAR(64) NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
    encounter_id VARCHAR(64) REFERENCES encounters(id) ON DELETE SET NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    priority VARCHAR(32) NOT NULL DEFAULT 'ROUTINE',
    signed_at TIMESTAMPTZ,
    signed_by_user_id VARCHAR(64) REFERENCES users(id),
    signature_hash VARCHAR(128),
    cancelled_at TIMESTAMPTZ,
    cancelled_by_user_id VARCHAR(64) REFERENCES users(id),
    cancellation_reason TEXT,
    replaced_by_prescription_id VARCHAR(64),
    replaces_prescription_id VARCHAR(64),
    pharmacy_id VARCHAR(64) REFERENCES pharmacies(id) ON DELETE SET NULL,
    expires_at DATE,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. Prescription Items Table (Structured Meds, Dose, Route, Quantity, Refills)
CREATE TABLE IF NOT EXISTS prescription_items (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    prescription_id VARCHAR(64) NOT NULL REFERENCES prescription_orders(id) ON DELETE CASCADE,
    medication_catalog_id VARCHAR(64) REFERENCES medication_catalog(id) ON DELETE SET NULL,
    medication_name VARCHAR(255) NOT NULL,
    dosage_form VARCHAR(64) NOT NULL DEFAULT 'TABLET',
    dose_amount VARCHAR(32),
    dose_unit VARCHAR(32),
    route VARCHAR(64) NOT NULL DEFAULT 'ORAL',
    frequency VARCHAR(100) NOT NULL,
    duration VARCHAR(64),
    quantity INT NOT NULL DEFAULT 30,
    quantity_unit VARCHAR(32) DEFAULT 'TABLET',
    refills_authorized INT NOT NULL DEFAULT 0,
    refills_remaining INT NOT NULL DEFAULT 0,
    sig_instructions TEXT NOT NULL,
    indication TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. Prescription Dispensations Table
CREATE TABLE IF NOT EXISTS prescription_dispensations (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    prescription_id VARCHAR(64) NOT NULL REFERENCES prescription_orders(id) ON DELETE CASCADE,
    prescription_item_id VARCHAR(64) REFERENCES prescription_items(id) ON DELETE SET NULL,
    pharmacy_id VARCHAR(64) NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
    dispensed_medication_name VARCHAR(255) NOT NULL,
    quantity_dispensed INT NOT NULL,
    dispensation_status VARCHAR(32) NOT NULL DEFAULT 'COMPLETE',
    dispensed_by_user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    dispensed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. Medication Reconciliations Table
CREATE TABLE IF NOT EXISTS medication_reconciliations (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    patient_id VARCHAR(64) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id VARCHAR(64) REFERENCES encounters(id) ON DELETE SET NULL,
    reconciled_by_user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    notes TEXT,
    discrepancy_count INT NOT NULL DEFAULT 0,
    reconciled_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 9. Safety Check Overrides Table (Audit of Clinician Decision-Making)
CREATE TABLE IF NOT EXISTS safety_check_overrides (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    prescription_id VARCHAR(64) REFERENCES prescription_orders(id) ON DELETE CASCADE,
    patient_id VARCHAR(64) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    allergy_id VARCHAR(64),
    alert_type VARCHAR(64) NOT NULL,
    alert_description TEXT NOT NULL,
    override_reason TEXT NOT NULL,
    overridden_by_user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    overridden_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 10. Performance & Search Indexes
CREATE INDEX IF NOT EXISTS idx_med_cat_name ON medication_catalog(display_name);
CREATE INDEX IF NOT EXISTS idx_pat_med_pat ON patient_medications(patient_id);
CREATE INDEX IF NOT EXISTS idx_pat_med_org ON patient_medications(organization_id);
CREATE INDEX IF NOT EXISTS idx_pat_med_status ON patient_medications(status);
CREATE INDEX IF NOT EXISTS idx_pat_all_pat ON patient_allergies(patient_id);
CREATE INDEX IF NOT EXISTS idx_pat_all_org ON patient_allergies(organization_id);
CREATE INDEX IF NOT EXISTS idx_rx_orders_pat ON prescription_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_rx_orders_org ON prescription_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_rx_orders_prov ON prescription_orders(provider_id);
CREATE INDEX IF NOT EXISTS idx_rx_orders_stat ON prescription_orders(status);
CREATE INDEX IF NOT EXISTS idx_rx_items_order ON prescription_items(prescription_id);
CREATE INDEX IF NOT EXISTS idx_rx_disp_order ON prescription_dispensations(prescription_id);
CREATE INDEX IF NOT EXISTS idx_rx_disp_pharm ON prescription_dispensations(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_med_rec_pat ON medication_reconciliations(patient_id);
