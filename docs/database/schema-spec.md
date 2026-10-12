# CLINILYNC PostgreSQL Schema Specification & DDL Proposal (Phase 2)

## 1. Technical Standards & Design Rules

- **RDBMS Engine:** PostgreSQL 16+
- **Primary Keys:** `UUID` generated via `gen_random_uuid()`
- **Timestamps:** Canonical `TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP` stored in UTC.
- **Monetary Precision:** Safe fixed-point `NUMERIC(12, 2)` accompanied by mandatory ISO-4217 currency code (`VARCHAR(3)`). Floating point (`FLOAT`, `DOUBLE PRECISION`, `REAL`) is strictly prohibited.
- **Organization Boundary:** `organization_id UUID NOT NULL REFERENCES organizations(id)` on every tenant-scoped entity.
- **Referential Integrity:** `ON DELETE RESTRICT` on historical healthcare records (patients, encounters, invoices). Cascades permitted solely on internal parent-child joins (e.g. `invoice_items` when an unissued draft invoice is deleted).
- **Auditability:** Immutability on clinical notes, audit logs, and payments.

---

## 2. Comprehensive DDL Specification

```sql
-- ====================================================================
-- CLINILYNC Enterprise Database Schema Proposal
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- --------------------------------------------------------------------
-- 1. ORGANIZATIONS & SETTINGS
-- --------------------------------------------------------------------
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    legal_name VARCHAR(255),
    tax_id VARCHAR(64),
    slug VARCHAR(100) UNIQUE NOT NULL,
    country_code VARCHAR(3) NOT NULL, -- ISO 3166-1 alpha-3
    currency_code VARCHAR(3) NOT NULL DEFAULT 'USD', -- ISO 4217
    timezone VARCHAR(64) NOT NULL DEFAULT 'UTC', -- IANA Timezone string
    phone VARCHAR(32),
    email VARCHAR(255),
    address_line1 VARCHAR(255),
    city VARCHAR(100),
    postal_code VARCHAR(32),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE organization_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    setting_key VARCHAR(100) NOT NULL,
    setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (organization_id, setting_key)
);

CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(32) NOT NULL,
    head_provider_id UUID,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (organization_id, code)
);

-- --------------------------------------------------------------------
-- 2. USERS, MEMBERSHIPS & RBAC
-- --------------------------------------------------------------------
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    salt VARCHAR(64) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(32),
    avatar_url VARCHAR(512),
    is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PENDING_ACTIVATION', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE organization_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('INVITED', 'ACTIVE', 'DEACTIVATED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, organization_id)
);

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE, -- NULL indicates global system role
    name VARCHAR(100) NOT NULL,
    code VARCHAR(64) NOT NULL,
    description TEXT,
    is_system_role BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (organization_id, code)
);

CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(64) NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE membership_roles (
    membership_id UUID NOT NULL REFERENCES organization_memberships(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    PRIMARY KEY (membership_id, role_id)
);

-- --------------------------------------------------------------------
-- 3. PROVIDERS & SCHEDULES
-- --------------------------------------------------------------------
CREATE TABLE providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    license_number VARCHAR(64) NOT NULL,
    specialization VARCHAR(100) NOT NULL,
    consultation_fee NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (consultation_fee >= 0),
    is_accepting_patients BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (organization_id, user_id)
);

CREATE TABLE provider_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL CHECK (end_time > start_time),
    slot_duration_minutes INT NOT NULL DEFAULT 30 CHECK (slot_duration_minutes > 0)
);

-- --------------------------------------------------------------------
-- 4. PATIENTS, CONTACTS & CONSENTS
-- --------------------------------------------------------------------
CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    mrn VARCHAR(64) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE NOT NULL,
    sex VARCHAR(32) NOT NULL CHECK (sex IN ('MALE', 'FEMALE', 'OTHER', 'UNKNOWN')),
    blood_group VARCHAR(10),
    email VARCHAR(255),
    phone VARCHAR(32),
    address_line1 VARCHAR(255),
    city VARCHAR(100),
    postal_code VARCHAR(32),
    preferred_language VARCHAR(32) DEFAULT 'en',
    allergies_summary TEXT,
    primary_provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED', 'DECEASED', 'MERGED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (organization_id, mrn)
);

CREATE TABLE patient_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    relationship VARCHAR(64) NOT NULL,
    phone VARCHAR(32) NOT NULL,
    email VARCHAR(255),
    is_emergency_contact BOOLEAN NOT NULL DEFAULT TRUE,
    has_legal_authority BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE patient_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    consent_type VARCHAR(64) NOT NULL CHECK (consent_type IN ('GENERAL_TREATMENT', 'TELEHEALTH', 'DATA_SHARING', 'RESEARCH')),
    purpose TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'GRANTED' CHECK (status IN ('GRANTED', 'REVOKED', 'EXPIRED')),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    evidence_document_id UUID,
    recorded_by_user_id UUID NOT NULL REFERENCES users(id)
);

-- --------------------------------------------------------------------
-- 5. APPOINTMENTS & SCHEDULING
-- --------------------------------------------------------------------
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    scheduled_start TIMESTAMPTZ NOT NULL,
    scheduled_end TIMESTAMPTZ NOT NULL CHECK (scheduled_end > scheduled_start),
    duration_minutes INT NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
    appointment_type VARCHAR(64) NOT NULL DEFAULT 'CONSULTATION' CHECK (appointment_type IN ('CONSULTATION', 'FOLLOW_UP', 'TELEHEALTH', 'EMERGENCY', 'PROCEDURE')),
    status VARCHAR(32) NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('REQUESTED', 'SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'RESCHEDULED', 'NO_SHOW')),
    reason_for_visit TEXT,
    cancellation_reason TEXT,
    checked_in_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE appointment_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    previous_status VARCHAR(32) NOT NULL,
    new_status VARCHAR(32) NOT NULL,
    changed_by_user_id UUID NOT NULL REFERENCES users(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
);

-- --------------------------------------------------------------------
-- 6. CLINICAL ENCOUNTERS & MEDICAL RECORDS
-- --------------------------------------------------------------------
CREATE TABLE encounters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    encounter_class VARCHAR(64) NOT NULL DEFAULT 'AMBULATORY' CHECK (encounter_class IN ('AMBULATORY', 'INPATIENT', 'EMERGENCY', 'TELEHEALTH', 'HOME_VISIT')),
    status VARCHAR(32) NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    period_start TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    period_end TIMESTAMPTZ,
    chief_complaint TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE clinical_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    author_provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
    note_type VARCHAR(64) NOT NULL DEFAULT 'SOAP' CHECK (note_type IN ('SOAP', 'CONSULTATION', 'PROCEDURE_NOTE', 'NURSING_NOTE', 'DISCHARGE_SUMMARY')),
    title VARCHAR(255) NOT NULL,
    subjective TEXT,
    objective TEXT,
    assessment TEXT,
    plan TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'FINALIZED')),
    finalized_at TIMESTAMPTZ,
    finalized_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE clinical_note_addenda (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    clinical_note_id UUID NOT NULL REFERENCES clinical_notes(id) ON DELETE RESTRICT,
    author_provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
    reason_for_addendum TEXT NOT NULL,
    content TEXT NOT NULL,
    signed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE diagnoses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    encounter_id UUID REFERENCES encounters(id) ON DELETE SET NULL,
    coding_system VARCHAR(32) NOT NULL DEFAULT 'ICD_10' CHECK (coding_system IN ('ICD_10', 'ICD_11', 'SNOMED_CT', 'LOCAL')),
    code VARCHAR(32) NOT NULL,
    description VARCHAR(255) NOT NULL,
    clinical_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (clinical_status IN ('ACTIVE', 'RECURRENCE', 'RELAPSE', 'INACTIVE', 'REMISSION', 'RESOLVED', 'CHRONIC')),
    verification_status VARCHAR(32) NOT NULL DEFAULT 'CONFIRMED' CHECK (verification_status IN ('PROVISIONAL', 'DIFFERENTIAL', 'CONFIRMED', 'REFUTED')),
    severity VARCHAR(32) NOT NULL DEFAULT 'MODERATE' CHECK (severity IN ('MILD', 'MODERATE', 'SEVERE')),
    onset_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE allergies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    allergen VARCHAR(128) NOT NULL,
    category VARCHAR(32) NOT NULL DEFAULT 'MEDICATION' CHECK (category IN ('FOOD', 'MEDICATION', 'ENVIRONMENT', 'BIOLOGIC')),
    criticality VARCHAR(32) NOT NULL DEFAULT 'HIGH' CHECK (criticality IN ('LOW', 'HIGH', 'UNABLE_TO_ASSESS')),
    reaction VARCHAR(255) NOT NULL,
    severity VARCHAR(32) NOT NULL DEFAULT 'MODERATE' CHECK (severity IN ('MILD', 'MODERATE', 'SEVERE', 'LIFE_THREATENING')),
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'RESOLVED')),
    identified_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE vitals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    encounter_id UUID REFERENCES encounters(id) ON DELETE SET NULL,
    recorded_by_user_id UUID REFERENCES users(id),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    systolic_bp INT CHECK (systolic_bp BETWEEN 30 AND 300),
    diastolic_bp INT CHECK (diastolic_bp BETWEEN 20 AND 200),
    heart_rate INT CHECK (heart_rate BETWEEN 20 AND 300),
    respiratory_rate INT CHECK (respiratory_rate BETWEEN 4 AND 80),
    temperature_celsius NUMERIC(4, 1) CHECK (temperature_celsius BETWEEN 25.0 AND 45.0),
    oxygen_saturation INT CHECK (oxygen_saturation BETWEEN 40 AND 100),
    weight_kg NUMERIC(5, 2) CHECK (weight_kg > 0),
    height_cm NUMERIC(5, 2) CHECK (height_cm > 0),
    bmi NUMERIC(4, 1) CHECK (bmi > 0),
    blood_glucose_mmol NUMERIC(4, 1)
);

-- --------------------------------------------------------------------
-- 7. MEDICATIONS, PRESCRIPTIONS & PHARMACY
-- --------------------------------------------------------------------
CREATE TABLE medications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    generic_name VARCHAR(255) NOT NULL,
    brand_name VARCHAR(255),
    code VARCHAR(64), -- RxNorm, ATC
    form VARCHAR(64) NOT NULL, -- TABLET, SYRUP, INJECTION
    strength VARCHAR(64) NOT NULL, -- 500mg, 10mg/ml
    is_controlled BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE prescriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    encounter_id UUID REFERENCES encounters(id) ON DELETE SET NULL,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
    medication_id UUID NOT NULL REFERENCES medications(id) ON DELETE RESTRICT,
    dosage VARCHAR(100) NOT NULL,
    route VARCHAR(64) NOT NULL DEFAULT 'ORAL' CHECK (route IN ('ORAL', 'TOPICAL', 'INTRAVENOUS', 'INTRAMUSCULAR', 'SUBLINGUAL', 'INHALATION')),
    frequency VARCHAR(100) NOT NULL,
    duration VARCHAR(64) NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    refills_authorized INT NOT NULL DEFAULT 0 CHECK (refills_authorized >= 0),
    refills_remaining INT NOT NULL DEFAULT 0 CHECK (refills_remaining >= 0),
    instructions TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'DISCONTINUED', 'CANCELLED')),
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    signed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------------------------
-- 8. LABORATORY & DIAGNOSTICS
-- --------------------------------------------------------------------
CREATE TABLE lab_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    code VARCHAR(64) NOT NULL, -- LOINC
    name VARCHAR(255) NOT NULL,
    specimen_type VARCHAR(64) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE lab_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    encounter_id UUID REFERENCES encounters(id) ON DELETE SET NULL,
    ordering_provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
    test_id UUID NOT NULL REFERENCES lab_tests(id) ON DELETE RESTRICT,
    priority VARCHAR(32) NOT NULL DEFAULT 'ROUTINE' CHECK (priority IN ('ROUTINE', 'URGENT', 'STAT')),
    status VARCHAR(32) NOT NULL DEFAULT 'ORDERED' CHECK (status IN ('ORDERED', 'COLLECTED', 'IN_PROCESS', 'COMPLETED', 'CANCELLED')),
    clinical_indication TEXT,
    ordered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE lab_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    lab_order_id UUID NOT NULL REFERENCES lab_orders(id) ON DELETE RESTRICT,
    analyte_name VARCHAR(128) NOT NULL,
    result_value_numeric NUMERIC(12, 4),
    result_value_text VARCHAR(255),
    unit VARCHAR(32),
    reference_range_low NUMERIC(12, 4),
    reference_range_high NUMERIC(12, 4),
    reference_range_text VARCHAR(64),
    abnormal_flag VARCHAR(32) NOT NULL DEFAULT 'NORMAL' CHECK (abnormal_flag IN ('NORMAL', 'HIGH', 'LOW', 'CRITICAL')),
    verification_status VARCHAR(32) NOT NULL DEFAULT 'FINAL' CHECK (verification_status IN ('PRELIMINARY', 'FINAL', 'CORRECTED')),
    verified_by_user_id UUID REFERENCES users(id),
    verified_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------------------------
-- 9. TREATMENT PLANS & REFERRALS
-- --------------------------------------------------------------------
CREATE TABLE treatment_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    encounter_id UUID REFERENCES encounters(id) ON DELETE SET NULL,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'ACTIVE', 'COMPLETED', 'ABANDONED')),
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    review_date DATE,
    completion_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    referring_provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
    receiving_provider_id UUID REFERENCES providers(id),
    receiving_organization_name VARCHAR(255),
    specialty_requested VARCHAR(100) NOT NULL,
    clinical_summary TEXT NOT NULL,
    priority VARCHAR(32) NOT NULL DEFAULT 'ROUTINE' CHECK (priority IN ('ROUTINE', 'URGENT', 'TWO_WEEK_WAIT')),
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'COMPLETED', 'DECLINED')),
    referral_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------------------------
-- 10. DOCUMENTS & FILE METADATA
-- --------------------------------------------------------------------
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    patient_id UUID REFERENCES patients(id) ON DELETE RESTRICT,
    encounter_id UUID REFERENCES encounters(id) ON DELETE SET NULL,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(128) NOT NULL,
    storage_uri VARCHAR(512) NOT NULL, -- Cloudflare R2 object key
    file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0),
    sha256_hash VARCHAR(64) NOT NULL,
    document_category VARCHAR(64) NOT NULL CHECK (document_category IN ('CLINICAL_SUMMARY', 'IMAGING_REPORT', 'LAB_REPORT', 'CONSENT_FORM', 'BILLING_RECEIPT', 'INSURANCE_CARD')),
    visibility VARCHAR(32) NOT NULL DEFAULT 'CLINICAL_ONLY' CHECK (visibility IN ('CLINICAL_ONLY', 'PATIENT_PORTAL', 'ADMINISTRATIVE')),
    uploaded_by_user_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------------------------
-- 11. CRM, COMMUNICATIONS & TASKS
-- --------------------------------------------------------------------
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
    subject VARCHAR(255),
    conversation_type VARCHAR(64) NOT NULL DEFAULT 'PATIENT_INQUIRY' CHECK (conversation_type IN ('PATIENT_INQUIRY', 'APPOINTMENT_QUERY', 'CLINICAL_CONSULTATION', 'ADMINISTRATIVE')),
    status VARCHAR(32) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'ARCHIVED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE conversation_participants (
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(32) NOT NULL DEFAULT 'PATIENT' CHECK (role IN ('PATIENT', 'CLINICIAN', 'ADMINISTRATOR')),
    last_read_at TIMESTAMPTZ,
    PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_user_id UUID NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    message_type VARCHAR(32) NOT NULL DEFAULT 'TEXT' CHECK (message_type IN ('TEXT', 'ATTACHMENT', 'SYSTEM_NOTICE')),
    is_clinical BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
    assigned_to_user_id UUID NOT NULL REFERENCES users(id),
    created_by_user_id UUID NOT NULL REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    due_date TIMESTAMPTZ NOT NULL,
    priority VARCHAR(32) NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    completed_at TIMESTAMPTZ,
    completed_by_user_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel VARCHAR(32) NOT NULL DEFAULT 'IN_APP' CHECK (channel IN ('IN_APP', 'EMAIL', 'SMS', 'PUSH')),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    resource_type VARCHAR(64),
    resource_id UUID,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------------------------
-- 12. BILLING, PAYMENTS & INSURANCE
-- --------------------------------------------------------------------
CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code VARCHAR(32) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    currency_code VARCHAR(3) NOT NULL DEFAULT 'USD',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (organization_id, code)
);

CREATE TABLE insurance_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    payer_code VARCHAR(64) UNIQUE NOT NULL,
    country_code VARCHAR(3) NOT NULL,
    contact_phone VARCHAR(32),
    contact_email VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE patient_insurances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    insurance_provider_id UUID NOT NULL REFERENCES insurance_providers(id) ON DELETE RESTRICT,
    policy_number VARCHAR(128) NOT NULL,
    group_number VARCHAR(128),
    subscriber_name VARCHAR(128) NOT NULL,
    relationship_to_subscriber VARCHAR(32) NOT NULL DEFAULT 'SELF',
    valid_from DATE NOT NULL,
    valid_thru DATE,
    is_primary BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    invoice_number VARCHAR(64) NOT NULL,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
    paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0),
    balance_due NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (balance_due >= 0),
    currency_code VARCHAR(3) NOT NULL DEFAULT 'USD',
    status VARCHAR(32) NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID', 'OVERDUE')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (organization_id, invoice_number),
    CHECK (due_date >= issue_date)
);

CREATE TABLE invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    description VARCHAR(255) NOT NULL,
    quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    total_price NUMERIC(12, 2) NOT NULL CHECK (total_price >= 0)
);

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    payment_number VARCHAR(64) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    currency_code VARCHAR(3) NOT NULL DEFAULT 'USD',
    payment_method VARCHAR(32) NOT NULL CHECK (payment_method IN ('CARD', 'CASH', 'INSURANCE', 'BANK_TRANSFER', 'CHEQUE')),
    payment_reference VARCHAR(128),
    status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'REFUNDED', 'FAILED')),
    recorded_by_user_id UUID NOT NULL REFERENCES users(id),
    payment_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    UNIQUE (organization_id, payment_number)
);

CREATE TABLE insurance_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
    patient_insurance_id UUID NOT NULL REFERENCES patient_insurances(id) ON DELETE RESTRICT,
    claim_number VARCHAR(64) NOT NULL,
    amount_claimed NUMERIC(12, 2) NOT NULL CHECK (amount_claimed > 0),
    amount_adjudicated NUMERIC(12, 2) CHECK (amount_adjudicated >= 0),
    status VARCHAR(32) NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('PREPARED', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'PARTIAL_APPROVAL', 'DENIED')),
    denial_reason TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (organization_id, claim_number)
);

-- --------------------------------------------------------------------
-- 13. AUDIT LOGGING & COMPLIANCE
-- --------------------------------------------------------------------
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    actor_id UUID NOT NULL,
    actor_role VARCHAR(64),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(64) NOT NULL,
    resource_id VARCHAR(64),
    ip_address VARCHAR(45),
    user_agent TEXT,
    metadata JSONB,
    severity VARCHAR(16) NOT NULL DEFAULT 'INFO' CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------------------------
-- 14. PERFORMANCE & TENANCY INDEXES
-- --------------------------------------------------------------------
CREATE INDEX idx_memberships_user ON organization_memberships(user_id);
CREATE INDEX idx_patients_org_mrn ON patients(organization_id, mrn);
CREATE INDEX idx_patients_search ON patients(organization_id, last_name, first_name);
CREATE INDEX idx_appointments_org_start ON appointments(organization_id, scheduled_start);
CREATE INDEX idx_appointments_provider ON appointments(provider_id, scheduled_start);
CREATE INDEX idx_appointments_patient ON appointments(patient_id, scheduled_start);
CREATE INDEX idx_encounters_patient ON encounters(organization_id, patient_id, period_start DESC);
CREATE INDEX idx_clinical_notes_encounter ON clinical_notes(encounter_id);
CREATE INDEX idx_diagnoses_patient ON diagnoses(patient_id, clinical_status);
CREATE INDEX idx_allergies_patient ON allergies(patient_id, status);
CREATE INDEX idx_vitals_patient_recorded ON vitals(patient_id, recorded_at DESC);
CREATE INDEX idx_prescriptions_patient ON prescriptions(patient_id, status);
CREATE INDEX idx_lab_orders_patient ON lab_orders(patient_id, ordered_at DESC);
CREATE INDEX idx_invoices_org_status ON invoices(organization_id, status);
CREATE INDEX idx_invoices_patient ON invoices(patient_id, issue_date DESC);
CREATE INDEX idx_tasks_assigned_due ON tasks(assigned_to_user_id, status, due_date);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at ASC);
CREATE INDEX idx_audit_logs_org_created ON audit_logs(organization_id, created_at DESC);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id, created_at DESC);
```
