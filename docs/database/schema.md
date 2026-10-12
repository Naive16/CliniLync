# CLINILYNC Relational Database Schema Design

## 1. Engine & Conventions
- **RDBMS:** PostgreSQL 16+
- **Primary Keys:** UUID v4 (`uuid_generate_v4()`)
- **Foreign Keys:** Explicit referential integrity with `ON DELETE RESTRICT` or `ON DELETE CASCADE` where parent owns child.
- **Timestamps:** `created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`.
- **Tenancy Column:** Non-nullable `organization_id UUID NOT NULL REFERENCES organizations(id)` on every tenant-scoped table.
- **Indexes:** Multi-column index on `(organization_id, id)` and relevant search attributes (`patient_id`, `provider_id`, `created_at`).

## 2. Core Entities
1. `organizations`: Tenant metadata, currency, timezone, regulatory jurisdiction.
2. `users`: Credentials, name, email, phone, status, MFA preferences.
3. `roles`: Role definitions (e.g., Doctor, Nurse, Receptionist, Patient, SuperAdmin).
4. `permissions`: Atomic permissions (`patient.view`, `clinical.create`, etc.).
5. `role_permissions`: Association between roles and granted permissions.
6. `user_roles`: Association between users and roles, scoped to an organization.
7. `patients`: Medical record number (MRN), demographics, emergency contact, allergies summary, blood type, primary provider.
8. `providers`: Clinician credentials, NPI/license number, specialization, department.
9. `departments`: Clinical or administrative unit (e.g., Cardiology, Triage, Billing).
10. `appointments`: Time slot, patient, provider, type, status (scheduled, checked_in, in_consultation, completed, cancelled).
11. `clinical_records`: Encounter notes, subjective/objective/assessment/plan (SOAP), signed-off status, provider signature.
12. `diagnoses`: Condition, ICD-10 code, SNOMED concept, onset date, status (active, resolved, chronic).
13. `allergies`: Allergen, reaction type, severity (mild, moderate, life-threatening), status.
14. `vitals`: Blood pressure systolic/diastolic, heart rate, respiratory rate, temperature, SpO2, BMI, recorded_at.
15. `medications`: Pharmaceutical master list, generic name, brand name, strength, form.
16. `prescriptions`: Patient, provider, medication, dosage, frequency, duration, quantity, refills, status.
17. `lab_orders`: Diagnostic lab requisitions, test codes, priority (routine, urgent, STAT), status.
18. `lab_results`: Order test components, numeric result value, reference range, abnormal flag, pathologist signoff.
19. `treatment_plans`: Long-term clinical care pathway, goals, review dates.
20. `documents`: Medical records attachments, consent forms, imaging reports (MIME type, storage key, SHA-256 hash).
21. `messages`: Encrypted clinical communication threads between staff or patient-to-care-team.
22. `tasks`: Clinical and administrative to-do items, assignee, due date, priority.
23. `services`: Charge master / fee schedule, CPT code, description, unit price, currency.
24. `invoices`: Patient, organization, invoice number, issue date, due date, subtotal, tax, discount, balance, status.
25. `invoice_items`: Line items linked to service and invoice.
26. `payments`: Amount, payment method (card, cash, insurance, wire), transaction ref, status.
27. `audit_logs`: Immutable security and clinical audit trail.
