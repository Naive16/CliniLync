# CLINILYNC Entity Relationship Diagrams (ERD)

This document provides visual Mermaid Entity Relationship Diagrams (ERD) across all major functional domains of the CLINILYNC platform.

---

## 1. Identity, Tenancy & RBAC ERD

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ DEPARTMENTS : contains
    ORGANIZATIONS ||--o{ ORGANIZATION_MEMBERSHIPS : has_members
    ORGANIZATIONS ||--o{ ROLES : defines_custom
    USERS ||--o{ ORGANIZATION_MEMBERSHIPS : belongs_to
    ORGANIZATION_MEMBERSHIPS ||--o{ MEMBERSHIP_ROLES : assigned
    ROLES ||--o{ MEMBERSHIP_ROLES : grants
    ROLES ||--o{ ROLE_PERMISSIONS : includes
    PERMISSIONS ||--o{ ROLE_PERMISSIONS : mapped_to
    USERS ||--o{ PROVIDERS : clinician_profile
    USERS ||--o{ PATIENTS : portal_account
    ORGANIZATIONS ||--o{ PROVIDERS : employs
    DEPARTMENTS ||--o{ PROVIDERS : assigned_to

    ORGANIZATIONS {
        uuid id PK
        string name
        string slug UK
        string country_code
        string currency_code
        string timezone
        boolean is_active
    }

    USERS {
        uuid id PK
        string email UK
        string password_hash
        string salt
        string first_name
        string last_name
        boolean is_super_admin
        string status
    }

    ORGANIZATION_MEMBERSHIPS {
        uuid id PK
        uuid user_id FK
        uuid organization_id FK
        boolean is_primary
        string status
    }

    ROLES {
        uuid id PK
        uuid organization_id FK
        string name
        string code UK
        boolean is_system_role
    }

    PERMISSIONS {
        uuid id PK
        string code UK
        string category
        string description
    }

    PROVIDERS {
        uuid id PK
        uuid organization_id FK
        uuid user_id FK
        uuid department_id FK
        string license_number
        string specialization
        numeric consultation_fee
        boolean is_accepting_patients
    }
```

---

## 2. Patient 360 & Appointments ERD

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ PATIENTS : manages
    PATIENTS ||--o{ PATIENT_CONTACTS : has_contacts
    PATIENTS ||--o{ PATIENT_CONSENTS : grants
    PATIENTS ||--o{ PATIENT_INSURANCES : covered_by
    INSURANCE_PROVIDERS ||--o{ PATIENT_INSURANCES : issues

    PATIENTS ||--o{ APPOINTMENTS : books
    PROVIDERS ||--o{ APPOINTMENTS : conducts
    DEPARTMENTS ||--o{ APPOINTMENTS : hosts
    ORGANIZATIONS ||--o{ APPOINTMENTS : organizes
    APPOINTMENTS ||--o{ APPOINTMENT_STATUS_HISTORY : transitions

    PATIENTS {
        uuid id PK
        uuid organization_id FK
        uuid user_id FK
        string mrn UK
        string first_name
        string last_name
        date date_of_birth
        string sex
        string blood_group
        string preferred_language
        string status
    }

    PATIENT_CONSENTS {
        uuid id PK
        uuid organization_id FK
        uuid patient_id FK
        string consent_type
        string status
        timestamptz granted_at
        timestamptz expires_at
    }

    APPOINTMENTS {
        uuid id PK
        uuid organization_id FK
        uuid patient_id FK
        uuid provider_id FK
        uuid department_id FK
        timestamptz scheduled_start
        timestamptz scheduled_end
        int duration_minutes
        string appointment_type
        string status
        string reason_for_visit
    }

    APPOINTMENT_STATUS_HISTORY {
        uuid id PK
        uuid appointment_id FK
        string previous_status
        string new_status
        uuid changed_by_user_id FK
        timestamptz changed_at
    }
```

---

## 3. Clinical Encounter & EMR Core ERD

```mermaid
erDiagram
    APPOINTMENTS ||--o| ENCOUNTERS : initiates
    PATIENTS ||--o{ ENCOUNTERS : undergoes
    PROVIDERS ||--o{ ENCOUNTERS : leads
    ORGANIZATIONS ||--o{ ENCOUNTERS : hosts

    ENCOUNTERS ||--o{ CLINICAL_NOTES : documents
    CLINICAL_NOTES ||--o{ CLINICAL_NOTE_ADDENDA : amended_by

    ENCOUNTERS ||--o{ DIAGNOSES : identifies
    PATIENTS ||--o{ DIAGNOSES : carries

    ENCOUNTERS ||--o{ VITALS : records
    PATIENTS ||--o{ VITALS : exhibits

    PATIENTS ||--o{ ALLERGIES : exhibits

    ENCOUNTERS ||--o{ PRESCRIPTIONS : generates
    MEDICATIONS ||--o{ PRESCRIPTIONS : specifies
    PATIENTS ||--o{ PRESCRIPTIONS : receives

    ENCOUNTERS ||--o{ LAB_ORDERS : requisitions
    LAB_TESTS ||--o{ LAB_ORDERS : specifies
    LAB_ORDERS ||--o{ LAB_RESULTS : yields

    ENCOUNTERS ||--o{ TREATMENT_PLANS : establishes
    TREATMENT_PLANS ||--o{ TREATMENT_PLAN_GOALS : contains

    ENCOUNTERS ||--o{ REFERRALS : initiates

    ENCOUNTERS {
        uuid id PK
        uuid organization_id FK
        uuid patient_id FK
        uuid provider_id FK
        uuid appointment_id FK
        string encounter_class
        string status
        timestamptz period_start
        timestamptz period_end
        string chief_complaint
    }

    CLINICAL_NOTES {
        uuid id PK
        uuid encounter_id FK
        uuid patient_id FK
        uuid author_provider_id FK
        string note_type
        text subjective
        text objective
        text assessment
        text plan
        string status
        timestamptz finalized_at
    }

    DIAGNOSES {
        uuid id PK
        uuid encounter_id FK
        uuid patient_id FK
        string coding_system
        string code
        string description
        string clinical_status
        string verification_status
    }

    VITALS {
        uuid id PK
        uuid patient_id FK
        uuid encounter_id FK
        int systolic_bp
        int diastolic_bp
        int heart_rate
        numeric temperature_celsius
        int oxygen_saturation
        numeric weight_kg
        numeric height_cm
        numeric bmi
        timestamptz recorded_at
    }

    PRESCRIPTIONS {
        uuid id PK
        uuid patient_id FK
        uuid provider_id FK
        uuid medication_id FK
        string dosage
        string frequency
        string duration
        int quantity
        int refills_remaining
        string status
        timestamptz signed_at
    }

    LAB_ORDERS {
        uuid id PK
        uuid encounter_id FK
        uuid test_id FK
        string priority
        string status
        timestamptz ordered_at
    }

    LAB_RESULTS {
        uuid id PK
        uuid lab_order_id FK
        string analyte_name
        numeric result_value_numeric
        string result_value_text
        string unit
        string abnormal_flag
        timestamptz verified_at
    }
```

---

## 4. Healthcare CRM, Communications & Tasks ERD

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ TASKS : owns
    PATIENTS ||--o{ TASKS : relates_to
    USERS ||--o{ TASKS : assigned_to

    ORGANIZATIONS ||--o{ CONVERSATIONS : hosts
    PATIENTS ||--o{ CONVERSATIONS : participates
    CONVERSATIONS ||--o{ CONVERSATION_PARTICIPANTS : includes
    USERS ||--o{ CONVERSATION_PARTICIPANTS : joins
    CONVERSATIONS ||--o{ MESSAGES : contains
    USERS ||--o{ MESSAGES : sends

    ORGANIZATIONS ||--o{ DOCUMENTS : stores
    PATIENTS ||--o{ DOCUMENTS : belongs_to
    ENCOUNTERS ||--o{ DOCUMENTS : attaches_to

    USERS ||--o{ NOTIFICATIONS : receives

    TASKS {
        uuid id PK
        uuid organization_id FK
        uuid patient_id FK
        uuid assigned_to_user_id FK
        string title
        text description
        timestamptz due_date
        string priority
        string status
    }

    CONVERSATIONS {
        uuid id PK
        uuid organization_id FK
        uuid patient_id FK
        string subject
        string conversation_type
        string status
    }

    MESSAGES {
        uuid id PK
        uuid conversation_id FK
        uuid sender_user_id FK
        text body
        string message_type
        boolean is_clinical
        timestamptz created_at
    }

    DOCUMENTS {
        uuid id PK
        uuid organization_id FK
        uuid patient_id FK
        uuid encounter_id FK
        string file_name
        string storage_uri
        bigint file_size_bytes
        string sha256_hash
        string document_category
        string visibility
    }
```

---

## 5. Billing, Payments & Insurance Claims ERD

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ SERVICES : offers
    ORGANIZATIONS ||--o{ INVOICES : issues
    PATIENTS ||--o{ INVOICES : billed_to
    ENCOUNTERS ||--o{ INVOICES : derived_from

    INVOICES ||--o{ INVOICE_ITEMS : itemizes
    SERVICES ||--o{ INVOICE_ITEMS : references

    INVOICES ||--o{ PAYMENTS : settles
    PATIENTS ||--o{ PAYMENTS : pays

    INVOICES ||--o{ INSURANCE_CLAIMS : claims_against
    PATIENT_INSURANCES ||--o{ INSURANCE_CLAIMS : submitted_to

    SERVICES {
        uuid id PK
        uuid organization_id FK
        string code
        string name
        numeric unit_price
        string currency_code
    }

    INVOICES {
        uuid id PK
        uuid organization_id FK
        uuid patient_id FK
        string invoice_number UK
        date issue_date
        date due_date
        numeric subtotal
        numeric tax_amount
        numeric total_amount
        numeric paid_amount
        numeric balance_due
        string currency_code
        string status
    }

    INVOICE_ITEMS {
        uuid id PK
        uuid invoice_id FK
        uuid service_id FK
        string description
        int quantity
        numeric unit_price
        numeric total_price
    }

    PAYMENTS {
        uuid id PK
        uuid invoice_id FK
        uuid patient_id FK
        string payment_number
        numeric amount
        string currency_code
        string payment_method
        string status
        timestamptz payment_date
    }

    INSURANCE_CLAIMS {
        uuid id PK
        uuid invoice_id FK
        uuid patient_insurance_id FK
        string claim_number
        numeric amount_claimed
        numeric amount_adjudicated
        string status
    }
```
