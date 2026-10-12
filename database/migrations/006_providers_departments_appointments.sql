-- Migration: 006_providers_departments_appointments.sql
-- Description: Phase 7 Providers, Departments, Specialties, Schedules, and Appointments schema

-- 1. Specialties Catalog
CREATE TABLE IF NOT EXISTS specialties (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(32) UNIQUE NOT NULL,
    description TEXT,
    category VARCHAR(64) DEFAULT 'CLINICAL',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Department Extensions (hierarchy, contact, description)
ALTER TABLE departments ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS parent_department_id VARCHAR(64) REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE departments ADD COLUMN IF NOT EXISTS phone VARCHAR(32);
ALTER TABLE departments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 3. Provider Extensions (profiles, titles, bio, status, qualifications, verified credentials)
ALTER TABLE providers ADD COLUMN IF NOT EXISTS title VARCHAR(32) DEFAULT 'Dr.';
ALTER TABLE providers ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);
ALTER TABLE providers ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);
ALTER TABLE providers ADD COLUMN IF NOT EXISTS display_name VARCHAR(200);
ALTER TABLE providers ADD COLUMN IF NOT EXISTS specialty_id VARCHAR(64) REFERENCES specialties(id) ON DELETE SET NULL;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE providers ADD COLUMN IF NOT EXISTS phone VARCHAR(32);
ALTER TABLE providers ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS qualifications TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS is_credential_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE providers ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS archived_reason TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 4. Provider-to-Department Assignments Join Table
CREATE TABLE IF NOT EXISTS provider_departments (
    id VARCHAR(64) PRIMARY KEY,
    provider_id VARCHAR(64) NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    department_id VARCHAR(64) NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (provider_id, department_id)
);

-- 5. Appointment Types Table
CREATE TABLE IF NOT EXISTS appointment_types (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(32) NOT NULL,
    description TEXT,
    duration_minutes INT NOT NULL DEFAULT 30,
    buffer_before_minutes INT NOT NULL DEFAULT 0,
    buffer_after_minutes INT NOT NULL DEFAULT 0,
    department_id VARCHAR(64) REFERENCES departments(id) ON DELETE SET NULL,
    specialty_id VARCHAR(64) REFERENCES specialties(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    allow_self_booking BOOLEAN NOT NULL DEFAULT FALSE,
    color_code VARCHAR(16) DEFAULT '#0d9488',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (organization_id, code)
);

-- 6. Provider Availability Table (Recurring Weekly Schedules)
CREATE TABLE IF NOT EXISTS provider_availability (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider_id VARCHAR(64) NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL,
    start_time VARCHAR(5) NOT NULL,
    end_time VARCHAR(5) NOT NULL,
    timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/London',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    effective_start_date DATE,
    effective_end_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. Provider Schedule Exceptions / Leaves / Blocks Table
CREATE TABLE IF NOT EXISTS provider_schedule_exceptions (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider_id VARCHAR(64) NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    start_datetime TIMESTAMPTZ NOT NULL,
    end_datetime TIMESTAMPTZ NOT NULL,
    reason TEXT NOT NULL,
    is_all_day BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. Appointments Schema Extensions
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS appointment_type_id VARCHAR(64) REFERENCES appointment_types(id) ON DELETE SET NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/London';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS creation_source VARCHAR(32) NOT NULL DEFAULT 'STAFF';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS created_by_user_id VARCHAR(64) REFERENCES users(id);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancelled_by_user_id VARCHAR(64) REFERENCES users(id);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS rescheduled_from_appointment_id VARCHAR(64) REFERENCES appointments(id) ON DELETE SET NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS rescheduled_to_appointment_id VARCHAR(64) REFERENCES appointments(id) ON DELETE SET NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS checked_in_by_user_id VARCHAR(64) REFERENCES users(id);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS started_by_user_id VARCHAR(64) REFERENCES users(id);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS completed_by_user_id VARCHAR(64) REFERENCES users(id);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS no_show_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS no_show_by_user_id VARCHAR(64) REFERENCES users(id);

-- 9. Performance & Conflict Prevention Indexes
CREATE INDEX IF NOT EXISTS idx_appointments_org_provider_time ON appointments(organization_id, provider_id, scheduled_time, status);
CREATE INDEX IF NOT EXISTS idx_appointments_org_patient_time ON appointments(organization_id, patient_id, scheduled_time);
CREATE INDEX IF NOT EXISTS idx_provider_availability_prov ON provider_availability(provider_id, day_of_week, is_active);
CREATE INDEX IF NOT EXISTS idx_provider_schedule_exceptions_prov ON provider_schedule_exceptions(provider_id, start_datetime, end_datetime);
