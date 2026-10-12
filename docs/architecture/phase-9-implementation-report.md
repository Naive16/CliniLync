# CLINILYNC — Phase 9 Implementation Report
## Diagnoses, Longitudinal Problem Lists, Care Plans & Clinical Decision Support (CDS)

### 1. Architectural Summary & Scope

Phase 9 establishes the core clinical reasoning, longitudinal condition management, care planning, and clinical decision support foundations for the CLINILYNC global healthcare platform. It delivers:

1. **Encounter Diagnoses & Standard Terminology Integration**:
   - Structured diagnoses linked directly to clinical encounters with explicit primary vs. secondary designations.
   - Primary diagnosis uniqueness and exclusivity constraint: setting an encounter diagnosis as primary automatically demotes any previously existing primary diagnosis for that encounter.
   - Grounded in international terminology systems (ICD-10, SNOMED-CT) with standard concept codes and clinician-friendly display names.
   - Clinical status tracking (`ACTIVE`, `RESOLVED`, `SUSPECTED`, `REFUTED`) and diagnosis classification (`PRELIMINARY`, `WORKING`, `FINAL`, `DISCHARGE`).

2. **Longitudinal Patient Problem Lists**:
   - Distinguishes acute, transient encounter visits from ongoing, chronic patient conditions.
   - Longitudinal tracking with documented onset dates, chronological updates, and non-destructive resolution workflows (`ACTIVE` -> `RESOLVED` with explicit resolution dates and resolution notes).
   - Bi-directional linkage to initiating encounters while maintaining an organization-wide, longitudinal health record across clinical episodes.

3. **Clinician-Authored Care Plans & Action Items**:
   - Structured care plans addressing chronic diseases, rehabilitation, post-operative care, and preventive health.
   - Contains explicit clinical rationales, target review dates, and actionable sub-items spanning `LIFESTYLE`, `MONITORING`, `MEDICATION`, `REFERRAL`, `SELF_CARE`, and `FOLLOW_UP`.
   - Enforced lifecycle state machine (`DRAFT` -> `ACTIVE` -> `ON_HOLD` -> `COMPLETED`, `CANCELLED`).
   - Terminal status immutability: completed or cancelled care plans cannot be casually mutated.
   - Fine-grained care plan item completion isolation: completing individual action items updates item status and audit notes without prematurely terminating the master care plan.

4. **Clinician-Authored Follow-Up Instructions**:
   - Timeframe-bounded, patient-facing follow-up instructions linked to encounters and care plans.
   - Explicit clinical warning signs / "red flag" alerts instructing patients when to seek urgent care.
   - Patient-facing visibility controls for portal release.

5. **Clinical Decision Support (CDS) Foundations**:
   - Clinician-reviewed rule engine with rule statuses (`DRAFT`, `ACTIVE`, `INACTIVE`, `DEPRECATED`), severity levels (`INFO`, `WARNING`, `CRITICAL`), and trigger events (`ENCOUNTER_START`, `VITALS_RECORDED`, `DIAGNOSIS_ADDED`, `PRESCRIPTION_ORDERED`).
   - Automated alert generation and review tracking (`NEW` -> `ACKNOWLEDGED` / `DISMISSED` / `OVERRIDDEN`) with clinician review notes and user attribution.
   - Strict governance: CDS rule activation and clinical alert reviews are gated by clinical permissions (`cds.manage_rules`, `cds.review_alerts`).

6. **Multi-Tenant Isolation, RBAC & Privacy Compliance**:
   - Non-nullable `organization_id` foreign keys on all clinical tables.
   - Zero-trust server-side tenancy enforcement: cross-organization access attempts return `403 Forbidden` and record security breach audit entries.
   - Granular RBAC gates (`diagnosis.create`, `problem_list.view`, `care_plan.create`, `cds.manage_rules`).
   - Sanitized append-only audit trail: zero unstructured Protected Health Information (PHI) leaked to system log lines or audit message payloads.

---

### 2. Database Schema (`008_diagnoses_care_plans_cds.sql`)

- **`encounter_diagnoses`**:
  - `id`: VARCHAR(64) Primary Key (`diag_<uuid>`)
  - `organization_id`: VARCHAR(64) Foreign Key -> `organizations(id)` ON DELETE CASCADE
  - `encounter_id`: VARCHAR(64) Foreign Key -> `encounters(id)` ON DELETE CASCADE
  - `patient_id`: VARCHAR(64) Foreign Key -> `patients(id)` ON DELETE CASCADE
  - `code`: VARCHAR(64) NOT NULL (e.g., `E11.9`, `I10`)
  - `terminology_system`: VARCHAR(64) NOT NULL (e.g., `ICD-10`, `SNOMED-CT`)
  - `display_name`: VARCHAR(255) NOT NULL
  - `description`: TEXT
  - `is_primary`: BOOLEAN NOT NULL DEFAULT FALSE
  - `clinical_status`: VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' (`ACTIVE`, `RESOLVED`, `SUSPECTED`, `REFUTED`)
  - `diagnosis_type`: VARCHAR(32) NOT NULL DEFAULT 'WORKING' (`PRELIMINARY`, `WORKING`, `FINAL`, `DISCHARGE`)
  - `diagnosed_by_provider_id`: VARCHAR(64) Foreign Key -> `providers(id)`
  - `diagnosed_at`: TIMESTAMPTZ NOT NULL DEFAULT NOW()
  - `created_by_user_id`: VARCHAR(64) Foreign Key -> `users(id)`
  - `created_at`, `updated_at`: TIMESTAMPTZ NOT NULL

- **`patient_problems`**:
  - `id`: VARCHAR(64) Primary Key (`prob_<uuid>`)
  - `organization_id`: VARCHAR(64) Foreign Key -> `organizations(id)` ON DELETE CASCADE
  - `patient_id`: VARCHAR(64) Foreign Key -> `patients(id)` ON DELETE CASCADE
  - `initial_encounter_id`: VARCHAR(64) Foreign Key -> `encounters(id)` ON DELETE SET NULL
  - `problem_name`: VARCHAR(255) NOT NULL
  - `code`: VARCHAR(64)
  - `terminology_system`: VARCHAR(64) DEFAULT 'ICD-10'
  - `status`: VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' (`ACTIVE`, `RESOLVED`, `INACTIVE`)
  - `onset_date`: DATE
  - `resolved_date`: DATE
  - `resolution_notes`: TEXT
  - `recorded_by_provider_id`: VARCHAR(64) Foreign Key -> `providers(id)`
  - `created_by_user_id`: VARCHAR(64) Foreign Key -> `users(id)`
  - `created_at`, `updated_at`: TIMESTAMPTZ NOT NULL

- **`care_plans`**:
  - `id`: VARCHAR(64) Primary Key (`cp_<uuid>`)
  - `organization_id`: VARCHAR(64) Foreign Key -> `organizations(id)` ON DELETE CASCADE
  - `patient_id`: VARCHAR(64) Foreign Key -> `patients(id)` ON DELETE CASCADE
  - `encounter_id`: VARCHAR(64) Foreign Key -> `encounters(id)` ON DELETE SET NULL
  - `author_provider_id`: VARCHAR(64) Foreign Key -> `providers(id)`
  - `title`: VARCHAR(255) NOT NULL
  - `clinical_rationale`: TEXT NOT NULL
  - `description`: TEXT
  - `status`: VARCHAR(32) NOT NULL DEFAULT 'DRAFT' (`DRAFT`, `ACTIVE`, `ON_HOLD`, `COMPLETED`, `CANCELLED`)
  - `status_reason`: TEXT
  - `start_date`: DATE NOT NULL
  - `review_date`: DATE
  - `completed_at`: TIMESTAMPTZ
  - `completed_by_user_id`: VARCHAR(64) Foreign Key -> `users(id)`
  - `created_by_user_id`, `updated_by_user_id`: VARCHAR(64) Foreign Key -> `users(id)`
  - `created_at`, `updated_at`: TIMESTAMPTZ NOT NULL

- **`care_plan_items`**:
  - `id`: VARCHAR(64) Primary Key (`cpi_<uuid>`)
  - `organization_id`: VARCHAR(64) Foreign Key -> `organizations(id)` ON DELETE CASCADE
  - `care_plan_id`: VARCHAR(64) Foreign Key -> `care_plans(id)` ON DELETE CASCADE
  - `item_category`: VARCHAR(64) NOT NULL (`LIFESTYLE`, `MONITORING`, `MEDICATION`, `REFERRAL`, `SELF_CARE`, `FOLLOW_UP`)
  - `description`: TEXT NOT NULL
  - `responsible_role`: VARCHAR(64) NOT NULL DEFAULT 'PATIENT' (`PATIENT`, `NURSE`, `PHYSICIAN`, `CAREGIVER`, `SPECIALIST`)
  - `due_date`: DATE
  - `status`: VARCHAR(32) NOT NULL DEFAULT 'PENDING' (`PENDING`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`)
  - `completed_at`: TIMESTAMPTZ
  - `completed_by_user_id`: VARCHAR(64) Foreign Key -> `users(id)`
  - `completion_notes`: TEXT
  - `sort_order`: INT NOT NULL DEFAULT 0
  - `created_at`, `updated_at`: TIMESTAMPTZ NOT NULL

- **`follow_up_instructions`**:
  - `id`: VARCHAR(64) Primary Key (`fup_<uuid>`)
  - `organization_id`: VARCHAR(64) Foreign Key -> `organizations(id)` ON DELETE CASCADE
  - `encounter_id`: VARCHAR(64) Foreign Key -> `encounters(id)` ON DELETE CASCADE
  - `patient_id`: VARCHAR(64) Foreign Key -> `patients(id)` ON DELETE CASCADE
  - `care_plan_id`: VARCHAR(64) Foreign Key -> `care_plans(id)` ON DELETE SET NULL
  - `instructions`: TEXT NOT NULL
  - `timeframe`: VARCHAR(128) NOT NULL (e.g., `2 weeks`, `3 days`)
  - `reassessment_date`: DATE
  - `warning_signs`: TEXT (clinical red flags requiring emergency care)
  - `is_patient_facing`: BOOLEAN NOT NULL DEFAULT TRUE
  - `created_by_user_id`: VARCHAR(64) Foreign Key -> `users(id)`
  - `created_at`, `updated_at`: TIMESTAMPTZ NOT NULL

- **`clinical_rules`**:
  - `id`: VARCHAR(64) Primary Key (`crule_<uuid>`)
  - `organization_id`: VARCHAR(64) Foreign Key -> `organizations(id)` ON DELETE CASCADE
  - `rule_code`: VARCHAR(64) NOT NULL
  - `name`: VARCHAR(255) NOT NULL
  - `description`: TEXT
  - `category`: VARCHAR(64) NOT NULL (`DIAGNOSIS_SUPPORT`, `VITAL_THRESHOLD`, `DRUG_INTERACTION`, `PREVENTIVE_CARE`)
  - `severity`: VARCHAR(32) NOT NULL DEFAULT 'WARNING' (`INFO`, `WARNING`, `CRITICAL`)
  - `rule_status`: VARCHAR(32) NOT NULL DEFAULT 'DRAFT' (`DRAFT`, `ACTIVE`, `INACTIVE`, `DEPRECATED`)
  - `trigger_event`: VARCHAR(64) NOT NULL (`ENCOUNTER_START`, `VITALS_RECORDED`, `DIAGNOSIS_ADDED`, `PRESCRIPTION_ORDERED`)
  - `rule_criteria`: JSONB
  - `recommendation_template`: TEXT NOT NULL
  - `created_by_user_id`, `activated_by_user_id`: VARCHAR(64) Foreign Key -> `users(id)`
  - `activated_at`: TIMESTAMPTZ
  - `created_at`, `updated_at`: TIMESTAMPTZ NOT NULL

- **`clinical_alerts`**:
  - `id`: VARCHAR(64) Primary Key (`calert_<uuid>`)
  - `organization_id`: VARCHAR(64) Foreign Key -> `organizations(id)` ON DELETE CASCADE
  - `rule_id`: VARCHAR(64) Foreign Key -> `clinical_rules(id)` ON DELETE RESTRICT
  - `patient_id`: VARCHAR(64) Foreign Key -> `patients(id)` ON DELETE CASCADE
  - `encounter_id`: VARCHAR(64) Foreign Key -> `encounters(id)` ON DELETE SET NULL
  - `severity`: VARCHAR(32) NOT NULL
  - `summary`: VARCHAR(255) NOT NULL
  - `details`: TEXT
  - `recommended_action`: TEXT
  - `review_status`: VARCHAR(32) NOT NULL DEFAULT 'NEW' (`NEW`, `ACKNOWLEDGED`, `DISMISSED`, `OVERRIDDEN`)
  - `reviewed_by_user_id`: VARCHAR(64) Foreign Key -> `users(id)`
  - `reviewed_at`: TIMESTAMPTZ
  - `review_notes`: TEXT
  - `created_at`: TIMESTAMPTZ NOT NULL

---

### 3. API Endpoints (`/api/v1/*`)

#### Diagnoses & Terminology
- `GET /api/v1/terminology/search`: Search standardized clinical terminology (ICD-10, SNOMED-CT).
- `GET /api/v1/encounters/:encounterId/diagnoses`: List diagnoses recorded for a specific encounter.
- `POST /api/v1/encounters/:encounterId/diagnoses`: Record encounter diagnosis (primary exclusivity enforced).
- `PATCH /api/v1/diagnoses/:diagnosisId`: Update diagnosis clinical status or primary flag.
- `DELETE /api/v1/diagnoses/:diagnosisId`: Remove encounter diagnosis.

#### Problem Lists
- `GET /api/v1/patients/:patientId/problems`: Retrieve longitudinal problem list (filter by `status`: ACTIVE, RESOLVED, ALL).
- `POST /api/v1/patients/:patientId/problems`: Add condition to patient longitudinal problem list.
- `POST /api/v1/problems/:problemId/resolve`: Clinically resolve problem with resolution date and notes.
- `PATCH /api/v1/problems/:problemId`: Update problem details.

#### Care Plans & Items
- `GET /api/v1/patients/:patientId/care-plans`: List patient care plans with items.
- `POST /api/v1/patients/:patientId/care-plans`: Create structured care plan with action items.
- `GET /api/v1/care-plans/:carePlanId`: Detailed care plan view.
- `PATCH /api/v1/care-plans/:carePlanId`: Update care plan header information.
- `POST /api/v1/care-plans/:carePlanId/status`: Execute state machine transition (`ACTIVE`, `ON_HOLD`, `COMPLETED`, `CANCELLED`).
- `POST /api/v1/care-plans/:carePlanId/items`: Append action item to care plan.
- `PATCH /api/v1/care-plan-items/:itemId`: Update action item properties or completion notes.
- `POST /api/v1/care-plan-items/:itemId/complete`: Atomically complete single care plan item with clinician notes.

#### Follow-Up Instructions
- `GET /api/v1/encounters/:encounterId/follow-up`: Get follow-up instructions for encounter.
- `POST /api/v1/encounters/:encounterId/follow-up`: Create follow-up instruction with warning signs.
- `PATCH /api/v1/follow-up/:followUpId`: Update follow-up instruction or patient-facing visibility.

#### Clinical Decision Support (CDS)
- `GET /api/v1/cds/rules`: List CDS rules (filter by category, status).
- `POST /api/v1/cds/rules`: Create new CDS clinical rule.
- `POST /api/v1/cds/rules/:ruleId/status`: Transition rule status (`ACTIVE`, `INACTIVE`, `DEPRECATED`).
- `GET /api/v1/cds/alerts`: List clinical alerts for organization, patient, or encounter.
- `POST /api/v1/cds/alerts/:alertId/review`: Clinician review of CDS alert (`ACKNOWLEDGED`, `DISMISSED`, `OVERRIDDEN`).

---

### 4. Verification & Test Suite

The test suite in `tests/phase9-diagnoses-care-plans.test.ts` executes comprehensive automated end-to-end tests:
1. **Encounter Diagnosis Recording & Terminology Linkage**: Validates ICD-10 standard codes, display names, and encounter linkage.
2. **Primary Diagnosis Demotion & Exclusivity Constraint**: Confirms that promoting a second diagnosis automatically demotes the prior primary diagnosis.
3. **Longitudinal Problem List Creation & Linkage**: Verifies acute vs. chronic condition recording linked to patient and encounter.
4. **Non-Destructive Problem Resolution & Auditability**: Confirms problem status moves to `RESOLVED` with timestamp and notes without destructive deletion.
5. **Structured Care Plan Creation & Action Items**: Validates multi-item creation across clinical and self-care categories.
6. **Care Plan Lifecycle State Machine & Terminal Immutability**: Proves transitions to `COMPLETED` and verifies rejection of modifications to terminal plans.
7. **Fine-Grained Care Plan Item Completion Isolation**: Verifies item completion leaves the overarching care plan in `ACTIVE` state.
8. **Clinician-Authored Follow-Up Documentation & Warning Signs**: Verifies structured timeframes, reassessment dates, and red flags.
9. **CDS Rule Governance & Clinician Review Workflow**: Validates rule state management and clinician alert review with notes.
10. **Strict Multi-Tenant Isolation**: Proves that Organization B cannot access, list, or mutate Organization A diagnoses, problem lists, care plans, or CDS alerts (HTTP 403 / 404).
11. **Role-Based Access Control (RBAC)**: Confirms non-clinical personas (Receptionist, Billing) are strictly rejected with 403 Forbidden on clinical mutations.
12. **Sanitized Append-Only Audit Trail**: Verifies audit entries are created with zero unstructured clinical text or sensitive health information leaked to log metadata.

All 58 test cases across Phases 5 through 9 pass cleanly (`58 Passed, 0 Failed`).
