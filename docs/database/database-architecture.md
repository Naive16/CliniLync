# CLINILYNC Database Architecture Specification

---

## 1. Relational Database Engine
CLINILYNC uses **PostgreSQL 16+** as its primary relational data store. PostgreSQL provides the ACID transactional guarantees, foreign key referential integrity, and relational domain modeling required across organizations, users, clinical records, and billing.

---

## 2. Multi-Tenancy & Tenant Segregation Model

Multi-tenancy is enforced via row-level tenant keys:
- Every organization-scoped table contains an `organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE`.
- Database indexes are structured as composite indexes `(organization_id, id)` or `(organization_id, status)` to guarantee optimal execution of tenant-scoped queries.
- Tenant context is resolved on the backend from verified session credentials; clients cannot supply an arbitrary `organization_id` to read or mutate another clinic's data.

---

## 3. Core Relational Domains

1. **Identity & Organizations:** `organizations`, `users`, `roles`, `permissions`, `role_permissions`, `user_organizations`
2. **Clinical Practice & Care Teams:** `departments`, `providers`, `provider_departments`
3. **Patient Domain:** `patients`, `emergency_contacts`
4. **Appointments & Encounters:** `appointments`, `clinical_encounters`, `diagnoses`, `allergies`, `prescriptions`, `vital_signs`
5. **Billing & Financials:** `invoices`, `invoice_items`, `payments`
6. **Compliance & Audit:** `audit_logs` (tamper-evident, append-only)

---

## 4. Migration Strategy

- **Location:** `database/migrations/`
- **Conventions:** Forward-only numbered scripts (e.g., `001_initial_schema.sql`, `002_rbac_and_tenancy.sql`, `003_audit_logging_and_indexes.sql`).
- **Tracking:** Migrations are tracked in the `_schema_migrations` table with timestamps.
- **Rules:** Never edit an existing migration that has already been deployed. Add a subsequent forward migration script for modifications.

---

## 5. Dual-Mode Database Client (`database/db.ts`)
For explicit local unit tests and PostgreSQL-backed integration environments, CLINILYNC includes a dual-mode database client:
- **Production/Staging/Integration Mode:** Connects to PostgreSQL via `pg.Pool` when `DATABASE_URL` is set. Production startup fails closed when it is missing.
- **Unit-Test Mode:** The in-process adapter may be used for fast tests only. It is not PostgreSQL and does not prove PostgreSQL constraints, transaction isolation, or migration correctness.
