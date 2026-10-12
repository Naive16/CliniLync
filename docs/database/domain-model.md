# CLINILYNC Comprehensive Domain Model Specification (Phase 2)

## 1. Executive Summary & Design Principles

CLINILYNC (*Connecting Healthcare. Simplifying Care.*) is a global healthcare technology platform designed to operate across multiple healthcare institutions, specialties, jurisdictions, currencies, and languages.

This document establishes the canonical domain model and relational database architecture.

### Core Architectural Axioms
1. **Multi-Organization Isolation as First Principle:** Every tenant-scoped entity bears a mandatory, non-nullable foreign key to `organizations(id)`. Cross-organization data leakage is structurally prevented at both the schema and query layers.
2. **Normalized Separation of Concerns:**
   - Identity (`users`) is decoupled from organizational membership (`organization_memberships`).
   - Staff roles (`providers`) are decoupled from identity and decoupled from clinical encounters.
   - Patient profiles (`patients`) are decoupled from user credentials.
   - Clinical encounters (`encounters`) act as the contextual anchor for clinical observations, SOAP notes, diagnoses, and orders.
3. **Immutability of Clinical and Financial History:** Finalized clinical notes, signed prescriptions, verified laboratory results, issued invoices, and audit logs are append-only. Clinical corrections are modeled via explicit **addenda/amendments**, preserving legal and medical defensibility.
4. **Global Adaptability (Zero Regional Bias):**
   - Monies are stored with explicit ISO 4217 currency codes using fixed-point `NUMERIC(12, 2)`.
   - All timestamps use timezone-aware `TIMESTAMPTZ` (UTC storage, presentation-layer localization).
   - Medical coding fields (diagnoses, procedures, lab tests, medications) are designed to support international coding schemes (ICD-10, ICD-11, SNOMED-CT, LOINC, RxNorm, ATC, etc.).
   - Addresses and contact information are globally normalized rather than conforming strictly to US/UK formats.
5. **Unified Healthcare CRM + EMR Continuum:** CLINILYNC bridges clinical encounters (EMR) with administrative workflows, task tracking, care follow-ups, and patient communications (CRM) without compromising relational integrity.

---

## 2. Domain Decomposition

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ORGANIZATION & IDENTITY                           │
│  Organizations · Departments · Users · Memberships · Roles · Permissions    │
└───────────────────────┬─────────────────────────────┬───────────────────────┘
                        │                             │
                        ▼                             ▼
┌───────────────────────────────┐     ┌───────────────────────────────────────┐
│        PROVIDER DOMAIN        │     │            PATIENT DOMAIN             │
│  Providers · Schedules        │     │  Patients · Consents · Contacts       │
└───────────────┬───────────────┘     └───────────────────┬───────────────────┘
                │                                         │
                └───────────────────┬─────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      APPOINTMENT & SCHEDULING DOMAIN                        │
│  Appointments · Status Transitions · Reminders · Triage Queue               │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CLINICAL ENCOUNTER DOMAIN                            │
│  Encounters (Ambulatory, Telehealth, Inpatient)                             │
│    ├── Clinical Notes (SOAP, Consultations, Addenda)                        │
│    ├── Vital Signs (Time-series physiological measurements)                 │
│    ├── Diagnoses (ICD-10, SNOMED-CT, Active, Resolved, Chronic)             │
│    ├── Allergies & Intolerances (Criticality & Adverse Reactions)           │
│    ├── Medications & e-Prescriptions (Formulary, Dispensing)                │
│    ├── Laboratory Orders & Results (LOINC, Analytes, Pathologist Signoff)   │
│    ├── Treatment Plans & Goals (Long-term care plans, Interventions)        │
│    └── Clinical Referrals (Inter-specialty and external referrals)          │
└───────────────────────┬─────────────────────────────┬───────────────────────┘
                        │                             │
                        ▼                             ▼
┌───────────────────────────────┐     ┌───────────────────────────────────────┐
│     BILLING & FINANCIAL       │     │         CRM & COMMUNICATIONS          │
│  Services · Fee Schedules     │     │  Conversations · Messages             │
│  Invoices · Invoice Items     │     │  Tasks & Follow-ups · Notifications   │
│  Payments · Insurance Claims  │     │  Documents & Imaging Metadata         │
└───────────────────────┬───────┘     └───────────────────┬───────────────────┘
                        │                                 │
                        └─────────────────┬───────────────┘
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AUDIT & COMPLIANCE TRAIL                             │
│  Immutable Audit Logs · Event Actor · IP · Geo · Sanitized Mutation Diff    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Detailed Domain Specifications

### 3.1 Organization & Identity Domain
- **Organization (`organizations`):** The legal or operational healthcare entity (hospital, clinic network, private practice). Holds regional parameters (default currency, timezone, regulatory jurisdiction, contact coordinates).
- **Organization Settings (`organization_settings`):** Key-value configuration for booking policies, cancellation windows, telemedicine rules, and invoice prefixes.
- **Departments (`departments`):** Clinical or operational units (Cardiology, Pediatrics, Laboratory, Billing) belonging to an organization.
- **User Identity (`users`):** Global user credentials (email, hashed password, salt, MFA credentials, status). A user has identity independent of any single organization.
- **Organization Membership (`organization_memberships`):** Establishes the relationship between a user and an organization. A user may belong to multiple organizations (e.g., a locum doctor working across two clinics).
- **Role-Based Access Control (`roles`, `permissions`, `membership_roles`):** Atomic permissions (`patient.view`, `clinical.create`, `billing.record_payment`) grouped into roles (Doctor, Lead Clinician, Triage Nurse, Receptionist, Billing Clerk, Patient). A membership can hold multiple roles simultaneously.

### 3.2 Provider Domain
- **Provider (`providers`):** Clinician profile linked to a user. Captures professional license numbers (e.g., GMC, NPI), medical specialty, bio, consultation fee, and clinical director sign-off authority.
- **Provider Availability (`provider_schedules`):** Weekly recurring shifts and blackout periods for scheduling appointments.

### 3.3 Patient Domain & Patient 360
- **Patient Profile (`patients`):** Distinct from user authentication. A patient may exist in a clinic's system before ever creating an online portal account. Contains:
  - `mrn` (Medical Record Number): Unique per organization.
  - Demographics: Full legal name, date of birth, sex assigned at birth, gender identity, blood group.
  - Lifecycle Status: `ACTIVE`, `INACTIVE`, `ARCHIVED`, `DECEASED`, `MERGED`.
- **Patient Contacts (`patient_contacts`):** Emergency contacts, next of kin, guardians, and legal power of attorney.
- **Patient Consents (`patient_consents`):** Granular tracking of informed consent (treatment consent, tele-health consent, data sharing, research participation). Records granted dates, revocation dates, and references to signed evidence documents.

### 3.4 Appointment & Triage Domain
- **Appointments (`appointments`):** Time-slot reservations connecting a patient, provider, department, and organization.
  - Timezone-aware start and end timestamps (`TIMESTAMPTZ`).
  - Strict lifecycle statuses: `REQUESTED` → `SCHEDULED` → `CONFIRMED` → `CHECKED_IN` → `IN_PROGRESS` → `COMPLETED` (or `CANCELLED`, `RESCHEDULED`, `NO_SHOW`).
  - Cancellation reason, rescheduling audit references, and triage urgency rating.

### 3.5 Clinical Encounter & Lightweight EMR Domain
- **Encounter (`encounters`):** Represents a formal healthcare interaction (ambulatory consultation, inpatient round, emergency triage, telehealth video visit). Serves as the foreign-key hub for all clinical data created during that visit.
- **Clinical Notes (`clinical_notes`):** Structured SOAP documentation (Subjective, Objective, Assessment, Plan), consultation summaries, and progress notes.
  - States: `DRAFT` → `FINALIZED`.
  - Once `FINALIZED`, the note is immutable.
- **Clinical Note Addenda (`clinical_note_addenda`):** Any post-finalization amendments are appended as signed addenda with author, timestamp, and justification.
- **Diagnoses (`diagnoses`):** Clinical conditions diagnosed during an encounter or active across the patient's lifetime.
  - Coding Scheme: Code string + Coding System (e.g., `I10` in `ICD-10`, `38341003` in `SNOMED-CT`).
  - Clinical Status: `ACTIVE`, `RECURRENCE`, `REMISSION`, `RESOLVED`, `CHRONIC`.
  - Verification Status: `PROVISIONAL`, `DIFFERENTIAL`, `CONFIRMED`, `REFUTED`.
- **Allergies & Adverse Reactions (`allergies`):**
  - Allergen name and classification (`FOOD`, `MEDICATION`, `ENVIRONMENT`, `BIOLOGIC`).
  - Criticality (`LOW`, `HIGH`, `UNABLE_TO_ASSESS`) and reaction manifestation (e.g., Anaphylaxis, Urticaria).
- **Vitals (`vitals`):** Normalized discrete physiological measurements (Systolic/Diastolic BP, Heart Rate, Respiratory Rate, Temperature in °C, Oxygen Saturation %, Weight in kg, Height in cm, BMI, Blood Glucose).
- **Medications & Prescriptions:**
  - `medications`: Catalog of approved drugs (generic, brand, strength, formulation).
  - `prescriptions`: Signed legal orders authorizing a medication for a patient (dosage, route, frequency, duration, quantity, refills, signing provider).
  - `patient_medications`: Active reconciled medication list (tracking active usage vs discontinued drugs).
  - `medication_dispenses`: Pharmacy fulfillment logs.
- **Laboratory & Diagnostics:**
  - `lab_tests`: Catalog of diagnostic assays (LOINC code, specimen requirements).
  - `lab_orders`: Diagnostic order requisition with priority (`ROUTINE`, `URGENT`, `STAT`).
  - `lab_results`: Discrete test result values, units, reference range intervals, abnormal flags (`NORMAL`, `HIGH`, `LOW`, `CRITICAL`), and pathologist verification timestamp.
- **Treatment Plans (`treatment_plans`, `treatment_plan_goals`):** Multi-stage care pathways for chronic disease management, post-operative rehabilitation, or lifestyle interventions.
- **Referrals (`referrals`):** Inter-provider or inter-facility transfers with priority classification, clinical indication, and status tracking.

### 3.6 Healthcare CRM & Communications Domain
- **Tasks & Follow-ups (`tasks`):** Action items for administrative or clinical staff (e.g., "Follow up post-op day 3", "Review abnormal pathology report", "Collect overdue invoice balance").
- **Conversations & Messages (`conversations`, `conversation_participants`, `messages`):** Secure multi-party communication threads between patients and care teams or internal staff consultations. Supports message typing (`ADMINISTRATIVE`, `CLINICAL`) and read-receipt auditing.
- **Documents & Media Metadata (`documents`):** File metadata for diagnostic imaging reports, consent PDFs, and insurance cards. Files themselves reside in Cloudflare R2 / S3 object storage; PostgreSQL stores URI, SHA-256 hash, MIME type, size, and access restrictions.
- **Notifications (`notifications`):** Delivery queue for in-app alerts, future email, SMS, and push notifications.

### 3.7 Financial & Billing Domain
- **Services Master (`services`):** Charge master / billable clinical items (CPT codes, consultations, diagnostic scans, procedures).
- **Invoices (`invoices`, `invoice_items`):** Itemized patient billing statements.
  - Strict financial math: `subtotal`, `tax_amount`, `discount_amount`, `total_amount`, `paid_amount`, `balance_due`.
  - Stored using `NUMERIC(12, 2)` (zero floating-point rounding errors).
  - Lifecycle: `DRAFT` → `ISSUED` → `PARTIALLY_PAID` → `PAID` → `VOID` / `OVERDUE`.
- **Payments (`payments`):** Financial transactions recorded against invoices. Tracks payment method (`CARD`, `CASH`, `INSURANCE`, `BANK_TRANSFER`), payment gateway transaction references, and recording cashier/staff.
- **Insurance Foundation (`insurance_providers`, `insurance_policies`, `patient_insurances`, `insurance_claims`): Multi-tier payer modeling supporting private health insurance, national health schemes, and future claim submissions.

### 3.8 Audit Logging & Compliance Domain
- **Immutable Audit Trail (`audit_logs`):** Append-only table logging every read and write of protected health information (PHI) and financial transactions.
  - Actor ID, actor role, organization ID, client IP address, user-agent string.
  - Action identifier (`PATIENT_VIEWED`, `CLINICAL_NOTE_FINALIZED`, `PRESCRIPTION_CANCELLED`, `TENANT_BREACH_ATTEMPT`).
  - Redaction policy: Sensitive passwords, encryption keys, and raw tokens are strictly prohibited from appearing in audit metadata.
