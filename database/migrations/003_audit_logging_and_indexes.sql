-- Migration: 003_audit_logging_and_indexes.sql
-- Description: Immutable audit logs table and performance indexing

CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL,
    actor_id VARCHAR(64) NOT NULL,
    actor_role VARCHAR(64),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(64) NOT NULL,
    resource_id VARCHAR(64),
    ip_address VARCHAR(45),
    user_agent TEXT,
    metadata JSONB,
    severity VARCHAR(16) NOT NULL DEFAULT 'INFO',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(64) PRIMARY KEY,
    organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    sender_id VARCHAR(64) NOT NULL REFERENCES users(id),
    recipient_id VARCHAR(64) NOT NULL REFERENCES users(id),
    patient_id VARCHAR(64) REFERENCES patients(id) ON DELETE SET NULL,
    subject VARCHAR(255),
    body TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_patients_org ON patients(organization_id, mrn);
CREATE INDEX IF NOT EXISTS idx_appointments_org_date ON appointments(organization_id, scheduled_time);
CREATE INDEX IF NOT EXISTS idx_clinical_patient ON clinical_records(organization_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON audit_logs(organization_id, created_at DESC);
