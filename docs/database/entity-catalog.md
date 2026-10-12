# CLINILYNC Entity Catalog

This catalog documents the purpose, key attributes, relationships, lifecycles, and security posture of every entity in the CLINILYNC relational model.

---

## 1. Identity & Tenancy Domain

### 1.1 `organizations`
- **Purpose:** Primary tenant entity representing a clinic, hospital, or medical group.
- **Key Fields:** `id` (UUID), `name`, `legal_name`, `tax_id`, `slug` (unique), `country_code` (ISO 3166-1 alpha-3), `currency_code` (ISO 4217), `timezone` (IANA string, e.g., 'Europe/London'), `is_active` (boolean).
- **Relationships:** Parent of all organization-scoped entities (`departments`, `patients`, `encounters`, `invoices`, etc.).
- **Lifecycle:** `ACTIVE` → `SUSPENDED` → `DEACTIVATED`. Deletion is strictly prohibited if historical clinical or billing records exist.
- **Security:** Root of organization isolation boundary.

### 1.2 `organization_settings`
- **Purpose:** Key-value organizational configuration (booking rules, branding, currency formatting, clinical defaults).
- **Key Fields:** `id` (UUID), `organization_id` (FK), `key` (VARCHAR), `value` (JSONB), `updated_at`.
- **Relationships:** Many-to-One with `organizations`.

### 1.3 `departments`
- **Purpose:** Administrative and clinical units within an organization (e.g., Cardiology, Triage, Outpatient Surgery, Laboratory).
- **Key Fields:** `id` (UUID), `organization_id` (FK), `name`, `code`, `head_provider_id` (FK nullable), `is_active`.
- **Relationships:** Belongs to `organizations`; has many `providers`, `appointments`, and `encounters`.

### 1.4 `users`
- **Purpose:** Global authentication identity for any human accessing the platform (clinicians, staff, administrators, patients).
- **Key Fields:** `id` (UUID), `email` (unique, lowercase), `password_hash`, `salt`, `first_name`, `last_name`, `phone`, `avatar_url`, `is_super_admin`, `status` (`ACTIVE`, `SUSPENDED`, `PENDING_ACTIVATION`).
- **Relationships:** One-to-Many with `organization_memberships`, `providers`, `patients`.
- **Lifecycle:** `PENDING_ACTIVATION` → `ACTIVE` → `SUSPENDED`.
- **Security:** Passwords hashed with PBKDF2 (SHA-256, 100k iterations) and random salts. Credentials never exposed to client apps.

### 1.5 `organization_memberships`
- **Purpose:** Connects a global `user` to a specific `organization`. Allows one doctor to work across multiple independent clinics without cross-contaminating access.
- **Key Fields:** `id` (UUID), `user_id` (FK), `organization_id` (FK), `is_primary` (boolean), `status` (`ACTIVE`, `INVITED`, `DEACTIVATED`).
- **Unique Constraint:** `(user_id, organization_id)`.
- **Relationships:** Many-to-One with `users` and `organizations`; One-to-Many with `membership_roles`.

### 1.6 `roles`
- **Purpose:** Role definition template (e.g., Lead Doctor, Triage Nurse, Receptionist, Patient).
- **Key Fields:** `id` (UUID), `organization_id` (FK nullable; NULL denotes platform system role), `name`, `code` (e.g., 'DOCTOR', 'NURSE'), `is_system_role`.
- **Relationships:** Many-to-Many with `permissions` via `role_permissions`.

### 1.7 `permissions`
- **Purpose:** Granular, atomic capability flags (e.g., `patient.view`, `clinical.create`, `clinical.finalize`, `billing.record_payment`).
- **Key Fields:** `id` (UUID), `code` (unique string, e.g., 'clinical.finalize'), `category`, `description`.
- **Relationships:** Many-to-Many with `roles`.

### 1.8 `role_permissions`
- **Purpose:** Junction associating permissions to roles.
- **Key Fields:** `role_id` (FK), `permission_id` (FK). Primary key: `(role_id, permission_id)`.

### 1.9 `membership_roles`
- **Purpose:** Grants one or more roles to an organization membership.
- **Key Fields:** `membership_id` (FK), `role_id` (FK). Primary key: `(membership_id, role_id)`.

---

## 2. Provider Domain

### 2.1 `providers`
- **Purpose:** Professional healthcare clinician profile.
- **Key Fields:** `id` (UUID), `organization_id` (FK), `user_id` (FK), `department_id` (FK nullable), `license_number` (e.g., GMC, NPI), `specialization`, `consultation_fee` (NUMERIC), `is_accepting_patients`, `is_active`.
- **Relationships:** Belongs to `organizations` and `users`; One-to-Many with `appointments`, `encounters`, `prescriptions`.
- **Security:** Professional license numbers and provider ID are validated on clinical orders and SOAP note sign-offs.

### 2.2 `provider_schedules`
- **Purpose:** Working hours and slot templates for booking algorithms.
- **Key Fields:** `id` (UUID), `organization_id` (FK), `provider_id` (FK), `day_of_week` (0-6), `start_time` (TIME), `end_time` (TIME), `slot_duration_minutes`.

---

## 3. Patient Domain

### 3.1 `patients`
- **Purpose:** Comprehensive patient medical record profile within an organization.
- **Key Fields:** `id` (UUID), `organization_id` (FK), `user_id` (FK nullable, linked when patient registers for portal), `mrn` (Medical Record Number, unique per org), `first_name`, `last_name`, `date_of_birth` (DATE), `sex` (`MALE`, `FEMALE`, `OTHER`, `UNKNOWN`), `blood_group`, `email`, `phone`, `address_line1`, `city`, `postal_code`, `preferred_language`, `allergies_summary`, `primary_provider_id` (FK), `status` (`ACTIVE`, `INACTIVE`, `ARCHIVED`, `DECEASED`, `MERGED`).
- **Relationships:** Belongs to `organizations`; One-to-Many with `patient_contacts`, `patient_consents`, `encounters`, `appointments`, `invoices`.
- **Lifecycle:** `ACTIVE` → `INACTIVE` → `ARCHIVED` (or `DECEASED`, `MERGED`). Hard deletion is strictly forbidden to protect clinical audit history.
- **Security:** Core Protected Health Information (PHI). Access strictly gated by tenancy and Resource-Level Access Control (RLAC).

### 3.2 `patient_contacts`
- **Purpose:** Emergency contacts, next of kin, guardians, caregivers.
- **Key Fields:** `id` (UUID), `organization_id` (FK), `patient_id` (FK), `name`, `relationship`, `phone`, `email`, `is_emergency_contact`, `has_legal_authority`.

### 3.3 `patient_consents`
- **Purpose:** Explicit informed consent tracking for procedures, tele-health, data sharing, or research.
- **Key Fields:** `id` (UUID), `organization_id` (FK), `patient_id` (FK), `consent_type` (`TREATMENT`, `TELEHEALTH`, `DATA_SHARING`, `RESEARCH`), `status` (`GRANTED`, `REVOKED`, `EXPIRED`), `granted_at` (TIMESTAMPTZ), `expires_at` (TIMESTAMPTZ nullable), `revoked_at` (TIMESTAMPTZ nullable), `evidence_document_id` (FK nullable).

---

## 4. Appointments & Scheduling Domain

### 4.1 `appointments`
- **Purpose:** Reserved clinical or administrative consultation slot.
- **Key Fields:** `id` (UUID), `organization_id` (FK), `patient_id` (FK), `provider_id` (FK), `department_id` (FK nullable), `scheduled_start` (TIMESTAMPTZ), `scheduled_end` (TIMESTAMPTZ), `duration_minutes`, `appointment_type` (`CONSULTATION`, `FOLLOW_UP`, `TELEHEALTH`, `EMERGENCY`), `status` (`REQUESTED`, `SCHEDULED`, `CONFIRMED`, `CHECKED_IN`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `RESCHEDULED`, `NO_SHOW`), `reason_for_visit`, `cancellation_reason`, `checked_in_at` (TIMESTAMPTZ), `completed_at` (TIMESTAMPTZ).
- **Lifecycle:** Linear transition: `SCHEDULED` → `CHECKED_IN` → `IN_PROGRESS` → `COMPLETED` (or terminal: `CANCELLED` / `NO_SHOW`).
- **Security:** Providers only view appointments in their organization/department. Patients only view their own appointments.

### 4.2 `appointment_status_history`
- **Purpose:** Audit log of status transitions on appointments (who changed status, timestamp, previous and new status).

---

## 5. Clinical Encounter & EMR Domain

### 5.1 `encounters`
- **Purpose:** The central interaction hub for a clinical visit. Binds notes, diagnoses, vitals, prescriptions, and lab orders together.
- **Key Fields:** `id` (UUID), `organization_id` (FK), `patient_id` (FK), `provider_id` (FK), `appointment_id` (FK nullable), `department_id` (FK nullable), `encounter_class` (`AMBULATORY`, `INPATIENT`, `EMERGENCY`, `TELEHEALTH`), `status` (`PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`), `period_start` (TIMESTAMPTZ), `period_end` (TIMESTAMPTZ nullable), `chief_complaint`.
- **Relationships:** Parent of `clinical_notes`, `diagnoses`, `vitals`, `prescriptions`, `lab_orders`, `treatment_plans`.

### 5.2 `clinical_notes`
- **Purpose:** Structured clinical documentation (SOAP notes, intake evaluations, discharge summaries).
- **Key Fields:** `id` (UUID), `organization_id` (FK), `encounter_id` (FK), `patient_id` (FK), `author_provider_id` (FK), `note_type` (`SOAP`, `CONSULTATION`, `PROCEDURE_NOTE`, `DISCHARGE_SUMMARY`), `title`, `subjective` (TEXT), `objective` (TEXT), `assessment` (TEXT), `plan` (TEXT), `status` (`DRAFT`, `FINALIZED`), `finalized_at` (TIMESTAMPTZ nullable), `finalized_by` (FK nullable).
- **Lifecycle:** `DRAFT` → `FINALIZED`.
- **Immutability:** Once finalized, `clinical_notes` rows cannot be updated or deleted. Any amendments must be created as `clinical_note_addenda`.

### 5.3 `clinical_note_addenda`
- **Purpose:** Legal and clinical addenda modifying or adding context to finalized clinical notes.
- **Key Fields:** `id` (UUID), `organization_id` (FK), `clinical_note_id` (FK), `author_provider_id` (FK), `reason_for_addendum`, `content` (TEXT), `signed_at` (TIMESTAMPTZ).

### 5.4 `diagnoses`
- **Purpose:** Medical conditions, illnesses, or symptoms diagnosed for a patient.
- **Key Fields:** `id` (UUID), `organization_id` (FK), `patient_id` (FK), `encounter_id` (FK nullable), `coding_system` (`ICD_10`, `ICD_11`, `SNOMED_CT`), `code` (VARCHAR), `description` (VARCHAR), `clinical_status` (`ACTIVE`, `RECURRENCE`, `RELAPSE`, `INACTIVE`, `REMISSION`, `RESOLVED`, `CHRONIC`), `verification_status` (`PROVISIONAL`, `DIFFERENTIAL`, `CONFIRMED`, `REFUTED`), `severity` (`MILD`, `MODERATE`, `SEVERE`), `onset_date` (DATE).

### 5.5 `allergies`
- **Purpose:** Documented adverse immunological reactions and drug sensitivities.
- **Key Fields:** `id` (UUID), `organization_id` (FK), `patient_id` (FK), `allergen` (VARCHAR), `category` (`FOOD`, `MEDICATION`, `ENVIRONMENT`, `BIOLOGIC`), `criticality` (`LOW`, `HIGH`, `UNABLE_TO_ASSESS`), `reaction` (VARCHAR), `severity` (`MILD`, `MODERATE`, `SEVERE`, `LIFE_THREATENING`), `status` (`ACTIVE`, `INACTIVE`, `RESOLVED`), `identified_date` (DATE).

### 5.6 `vitals`
- **Purpose:** Discrete physiological observations recorded at intake or during consultations.
- **Key Fields:** `id` (UUID), `organization_id` (FK), `patient_id` (FK), `encounter_id` (FK nullable), `recorded_by_user_id` (FK), `recorded_at` (TIMESTAMPTZ), `systolic_bp` (INT), `diastolic_bp` (INT), `heart_rate` (INT), `respiratory_rate` (INT), `temperature_celsius` (NUMERIC(4, 1)), `oxygen_saturation` (INT), `weight_kg` (NUMERIC(5, 2)), `height_cm` (NUMERIC(5, 2)), `bmi` (NUMERIC(4, 1)), `blood_glucose_mmol` (NUMERIC(4, 1)).

---

## 6. Medications & Laboratory Domain

### 6.1 `medications`
- **Purpose:** Formulary drug catalog (pharmaceutical products).
- **Key Fields:** `id` (UUID), `organization_id` (FK nullable; NULL denotes global master formulary), `generic_name`, `brand_name`, `code` (e.g., RxNorm / ATC), `form` (e.g., TABLET, CAPSULE, INJECTION), `strength` (e.g., '5 mg', '500 mg/5ml'), `is_controlled_substance` (boolean).

### 6.2 `prescriptions`
- **Purpose:** Electronic prescription authorized by a clinician for a patient.
- **Key Fields:** `id` (UUID), `organization_id` (FK), `patient_id` (FK), `encounter_id` (FK nullable), `provider_id` (FK), `medication_id` (FK), `dosage`, `route` (`ORAL`, `TOPICAL`, `INTRAVENOUS`, `SUBLINGUAL`), `frequency`, `duration`, `quantity` (INT), `refills_authorized` (INT), `refills_remaining` (INT), `instructions` (TEXT), `status` (`ACTIVE`, `COMPLETED`, `DISCONTINUED`, `CANCELLED`), `start_date` (DATE), `end_date` (DATE nullable), `signed_at` (TIMESTAMPTZ), `cancelled_at` (TIMESTAMPTZ nullable).
- **Security:** Prescriptions require a valid provider license and digital signing timestamp.

### 6.3 `patient_medications`
- **Purpose:** Current medication reconciliation summary for a patient (combining prescribed drugs and external self-reported medications).

### 6.4 `lab_tests`
- **Purpose:** Master catalog of diagnostic assays and test panels.
- **Key Fields:** `id` (UUID), `organization_id` (FK nullable), `code` (LOINC), `name`, `specimen_type` (BLOOD, URINE, SWAB, TISSUE).

### 6.5 `lab_orders`
- **Purpose:** Laboratory requisition linked to an encounter.
- **Key Fields:** `id` (UUID), `organization_id` (FK), `encounter_id` (FK nullable), `patient_id` (FK), `ordering_provider_id` (FK), `test_id` (FK), `priority` (`ROUTINE`, `URGENT`, `STAT`), `status` (`ORDERED`, `COLLECTED`, `IN_PROCESS`, `COMPLETED`, `CANCELLED`), `clinical_indication` (TEXT), `ordered_at` (TIMESTAMPTZ).

### 6.6 `lab_results`
- **Purpose:** Discrete test values and pathologist signoff.
- **Key Fields:** `id` (UUID), `organization_id` (FK), `lab_order_id` (FK), `analyte_name`, `result_value_numeric` (NUMERIC nullable), `result_value_text` (VARCHAR nullable), `unit`, `reference_range_low` (NUMERIC nullable), `reference_range_high` (NUMERIC nullable), `reference_range_text` (VARCHAR nullable), `abnormal_flag` (`NORMAL`, `HIGH`, `LOW`, `CRITICAL`), `verification_status` (`PRELIMINARY`, `FINAL`, `CORRECTED`), `verified_by_user_id` (FK nullable), `verified_at` (TIMESTAMPTZ nullable), `pathologist_notes` (TEXT).

---

## 7. Treatment Plans & Referrals

### 7.1 `treatment_plans`
- **Purpose:** Long-term clinical care pathways and chronic care management.
- **Key Fields:** `id` (UUID), `organization_id` (FK), `patient_id` (FK), `encounter_id` (FK nullable), `provider_id` (FK), `title`, `description`, `status` (`DRAFT`, `ACTIVE`, `COMPLETED`, `ABANDONED`), `start_date` (DATE), `review_date` (DATE), `completion_date` (DATE nullable).

### 7.2 `treatment_plan_goals`
- **Purpose:** Measurable goals within a treatment plan (e.g., "Achieve HbA1c < 7.0% within 6 months").
- **Key Fields:** `id` (UUID), `treatment_plan_id` (FK), `goal_description`, `target_value`, `target_date`, `status` (`IN_PROGRESS`, `ACHIEVED`, `FAILED`).

### 7.3 `referrals`
- **Purpose:** Clinical referrals to specialist departments, external providers, or hospitals.
- **Key Fields:** `id` (UUID), `organization_id` (FK), `patient_id` (FK), `referring_provider_id` (FK), `receiving_provider_id` (FK nullable), `receiving_organization_name` (VARCHAR nullable), `specialty_requested`, `clinical_summary` (TEXT), `priority` (`ROUTINE`, `URGENT`, `TWO_WEEK_WAIT`), `status` (`PENDING`, `ACCEPTED`, `COMPLETED`, `DECLINED`), `referral_date` (DATE).

---

## 8. Documents & Metadata Domain

### 8.1 `documents`
- **Purpose:** File metadata for medical imaging, discharge summaries, signed consent forms, and lab report PDFs.
- **Key Fields:** `id` (UUID), `organization_id` (FK), `patient_id` (FK nullable), `encounter_id` (FK nullable), `file_name`, `mime_type`, `storage_uri` (Cloudflare R2 object key), `file_size_bytes` (BIGINT), `sha256_hash` (VARCHAR(64)), `document_category` (`CLINICAL_SUMMARY`, `IMAGING_REPORT`, `LAB_REPORT`, `CONSENT_FORM`, `BILLING_RECEIPT`, `INSURANCE_CARD`), `visibility` (`CLINICAL_ONLY`, `PATIENT_PORTAL`, `ADMINISTRATIVE`), `uploaded_by_user_id` (FK), `created_at` (TIMESTAMPTZ).
- **Security:** Large binary payloads reside outside PostgreSQL in object storage. Relational database enforces tenant access, patient ownership, and SHA-256 integrity verification.

---

## 9. CRM, Communications & Tasks Domain

### 9.1 `conversations`
- **Purpose:** Thread container for patient-staff messaging or intra-staff consultations.
- **Key Fields:** `id` (UUID), `organization_id` (FK), `patient_id` (FK nullable), `subject`, `conversation_type` (`PATIENT_INQUIRY`, `APPOINTMENT_QUERY`, `CLINICAL_CONSULTATION`, `ADMINISTRATIVE`), `status` (`OPEN`, `CLOSED`, `ARCHIVED`), `created_at` (TIMESTAMPTZ).

### 9.2 `conversation_participants`
- **Purpose:** Association of users participating in a conversation.
- **Key Fields:** `conversation_id` (FK), `user_id` (FK), `role` (`PATIENT`, `CLINICIAN`, `ADMINISTRATOR`), `last_read_at` (TIMESTAMPTZ nullable).

### 9.3 `messages`
- **Purpose:** Individual message within a conversation.
- **Key Fields:** `id` (UUID), `organization_id` (FK), `conversation_id` (FK), `sender_user_id` (FK), `body` (TEXT), `message_type` (`TEXT`, `ATTACHMENT`, `SYSTEM_NOTICE`), `is_clinical` (boolean), `created_at` (TIMESTAMPTZ).

### 9.4 `tasks`
- **Purpose:** Healthcare CRM follow-ups, triage duties, and administrative to-do items.
- **Key Fields:** `id` (UUID), `organization_id` (FK), `patient_id` (FK nullable), `assigned_to_user_id` (FK), `created_by_user_id` (FK), `title`, `description`, `due_date` (TIMESTAMPTZ), `priority` (`LOW`, `NORMAL`, `HIGH`, `URGENT`), `status` (`PENDING`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`), `completed_at` (TIMESTAMPTZ nullable), `completed_by_user_id` (FK nullable).

### 9.5 `notifications`
- **Purpose:** Delivery queue for in-app alerts, email notifications, SMS alerts, and future push notifications.
- **Key Fields:** `id` (UUID), `organization_id` (FK), `recipient_user_id` (FK), `channel` (`IN_APP`, `EMAIL`, `SMS`, `PUSH`), `title`, `message`, `resource_type`, `resource_id`, `is_read` (boolean), `sent_at` (TIMESTAMPTZ nullable), `created_at` (TIMESTAMPTZ).

---

## 10. Financial & Billing Domain

### 10.1 `services`
- **Purpose:** Charge master / fee schedule catalog of billable procedures and consultations.
- **Key Fields:** `id` (UUID), `organization_id` (FK), `code` (CPT / Local fee code), `name`, `description`, `unit_price` (NUMERIC(12, 2)), `currency_code` (ISO 4217), `is_active` (boolean).

### 10.2 `insurance_providers`
- **Purpose:** Health insurance carriers, state medical schemes, or corporate health funds.
- **Key Fields:** `id` (UUID), `name`, `payer_code`, `country_code`, `contact_phone`, `contact_email`, `is_active`.

### 10.3 `patient_insurances`
- **Purpose:** Patient's insurance coverage details.
- **Key Fields:** `id` (UUID), `organization_id` (FK), `patient_id` (FK), `insurance_provider_id` (FK), `policy_number`, `group_number`, `subscriber_name`, `relationship_to_subscriber`, `valid_from` (DATE), `valid_thru` (DATE nullable), `is_primary` (boolean).

### 10.4 `invoices`
- **Purpose:** Patient or insurance financial billing statement.
- **Key Fields:** `id` (UUID), `organization_id` (FK), `patient_id` (FK), `invoice_number` (unique per org), `issue_date` (DATE), `due_date` (DATE), `subtotal` (NUMERIC(12, 2)), `tax_amount` (NUMERIC(12, 2)), `discount_amount` (NUMERIC(12, 2)), `total_amount` (NUMERIC(12, 2)), `paid_amount` (NUMERIC(12, 2)), `balance_due` (NUMERIC(12, 2)), `currency_code` (ISO 4217), `status` (`DRAFT`, `ISSUED`, `PARTIALLY_PAID`, `PAID`, `VOID`, `OVERDUE`), `notes` (TEXT).
- **Accounting Rule:** `total_amount = subtotal + tax_amount - discount_amount`; `balance_due = total_amount - paid_amount`. Strict non-floating-point calculations.

### 10.5 `invoice_items`
- **Purpose:** Individual billable line item on an invoice.
- **Key Fields:** `id` (UUID), `invoice_id` (FK), `service_id` (FK nullable), `description`, `quantity` (INT), `unit_price` (NUMERIC(12, 2)), `total_price` (NUMERIC(12, 2)).

### 10.6 `payments`
- **Purpose:** Payment transaction recorded against an invoice.
- **Key Fields:** `id` (UUID), `organization_id` (FK), `invoice_id` (FK), `patient_id` (FK), `payment_number`, `amount` (NUMERIC(12, 2)), `currency_code` (ISO 4217), `payment_method` (`CARD`, `CASH`, `INSURANCE`, `BANK_TRANSFER`), `payment_reference`, `status` (`COMPLETED`, `REFUNDED`, `FAILED`), `recorded_by_user_id` (FK), `payment_date` (TIMESTAMPTZ).

### 10.7 `insurance_claims`
- **Purpose:** Insurance claim submission foundation.
- **Key Fields:** `id` (UUID), `organization_id` (FK), `invoice_id` (FK), `patient_insurance_id` (FK), `claim_number`, `amount_claimed` (NUMERIC(12, 2)), `amount_adjudicated` (NUMERIC(12, 2) nullable), `status` (`PREPARED`, `SUBMITTED`, `IN_REVIEW`, `APPROVED`, `PARTIAL_APPROVAL`, `DENIED`), `denial_reason` (TEXT nullable), `submitted_at` (TIMESTAMPTZ nullable).

---

## 11. Audit Logging Domain

### 11.1 `audit_logs`
- **Purpose:** Immutable legal and regulatory audit trail of all security, clinical, and financial actions.
- **Key Fields:** `id` (UUID), `organization_id` (FK), `actor_id` (FK), `actor_role` (VARCHAR), `action` (e.g., 'PATIENT_VIEWED', 'CLINICAL_NOTE_FINALIZED', 'PRESCRIPTION_SIGNED', 'INVOICE_ISSUED', 'TENANT_BREACH_ATTEMPT'), `resource_type` (VARCHAR), `resource_id` (VARCHAR), `ip_address` (VARCHAR(45)), `user_agent` (TEXT), `metadata` (JSONB, sanitized), `severity` (`INFO`, `WARNING`, `CRITICAL`), `created_at` (TIMESTAMPTZ).
- **Immutability:** No UPDATE or DELETE allowed under any circumstances.
