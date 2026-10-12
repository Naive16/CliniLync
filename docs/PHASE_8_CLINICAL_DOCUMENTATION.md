# CLINILYNC — Phase 8: Clinical Encounters, Medical Records & Clinical Notes

## 1. Executive Summary & Architecture Overview

Phase 8 implements the core clinical documentation subsystem for the Clinilync healthcare management platform. It introduces normalized, tamper-evident domain records for:
- Clinical encounters (consultations, telehealth, urgent care, follow-up, home visits).
- Clinician-authored structured notes with draft editing, optimistic concurrency control, and digital signing.
- Traceable, defensible amendment versioning preserving historical snapshots in `clinical_note_versions`.
- Point-in-time clinical observations and vital signs with explicit physiological units and range validation.
- Longitudinal patient medical record aggregation (`/app/patients/:patientId/medical-record`).
- Complete role-based access control (RBAC), multi-tenant isolation, and sanitized append-only audit logging.

---

## 2. Domain Data Model & SQL Schema

### A. Encounters (`encounters`)
Represents an individual clinical interaction between a patient and a healthcare provider within an organization.
- `id`: VARCHAR(64) Primary Key (`enc_<uuid>`)
- `organization_id`: VARCHAR(64) Foreign Key -> `organizations(id)` ON DELETE CASCADE
- `patient_id`: VARCHAR(64) Foreign Key -> `patients(id)` ON DELETE CASCADE
- `provider_id`: VARCHAR(64) Foreign Key -> `providers(id)` ON DELETE RESTRICT
- `appointment_id`: VARCHAR(64) Nullable Foreign Key -> `appointments(id)` ON DELETE SET NULL
- `encounter_type`: VARCHAR(64) (e.g., `IN_PERSON`, `TELEHEALTH`, `URGENT_CARE`, `FOLLOW_UP`, `HOME_VISIT`)
- `status`: VARCHAR(32) (`PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`)
- `reason_for_visit`: TEXT
- `started_at`: TIMESTAMPTZ
- `ended_at`: TIMESTAMPTZ
- `timezone`: VARCHAR(64) (e.g., `Europe/London`, `America/New_York`)
- `cancellation_reason`: TEXT
- `cancelled_at`: TIMESTAMPTZ
- `cancelled_by_user_id`: VARCHAR(64) Foreign Key -> `users(id)`
- `completed_at`: TIMESTAMPTZ
- `completed_by_user_id`: VARCHAR(64) Foreign Key -> `users(id)`
- `created_by_user_id`: VARCHAR(64) Foreign Key -> `users(id)`
- `updated_by_user_id`: VARCHAR(64) Foreign Key -> `users(id)`
- `created_at`: TIMESTAMPTZ
- `updated_at`: TIMESTAMPTZ

### B. Clinical Notes (`clinical_notes`)
Contains clinician-authored clinical narratives, observations, assessments, and orders.
- `id`: VARCHAR(64) Primary Key (`note_<uuid>`)
- `organization_id`: VARCHAR(64) Foreign Key -> `organizations(id)` ON DELETE CASCADE
- `encounter_id`: VARCHAR(64) Foreign Key -> `encounters(id)` ON DELETE CASCADE
- `patient_id`: VARCHAR(64) Foreign Key -> `patients(id)` ON DELETE CASCADE
- `author_id`: VARCHAR(64) Foreign Key -> `users(id)`
- `author_provider_id`: VARCHAR(64) Foreign Key -> `providers(id)`
- `note_type`: VARCHAR(64) (`PROGRESS_NOTE`, `CONSULTATION`, `PROCEDURE_NOTE`, `H_AND_P`, `DISCHARGE_SUMMARY`, `PHONE_NOTE`)
- `status`: VARCHAR(32) (`DRAFT`, `SIGNED`, `AMENDED`)
- `version`: INT (default 1, incremented upon amendment)
- `chief_complaint`: TEXT
- `history_of_present_illness`: TEXT
- `past_medical_history`: TEXT
- `surgical_history`: TEXT
- `family_social_history`: TEXT
- `review_of_systems`: TEXT
- `physical_examination`: TEXT
- `assessment`: TEXT
- `plan`: TEXT
- `follow_up_instructions`: TEXT
- `signed_at`: TIMESTAMPTZ
- `signed_by_user_id`: VARCHAR(64) Foreign Key -> `users(id)`
- `amended_from_note_id`: VARCHAR(64) Foreign Key -> `clinical_notes(id)`
- `amendment_reason`: TEXT
- `created_at`: TIMESTAMPTZ
- `updated_at`: TIMESTAMPTZ

### C. Clinical Note Versions (`clinical_note_versions`)
Preserves immutable historical snapshots of signed notes before any clinical amendment is applied.
- `id`: VARCHAR(64) Primary Key (`cnv_<uuid>`)
- `note_id`: VARCHAR(64) Foreign Key -> `clinical_notes(id)` ON DELETE CASCADE
- `organization_id`: VARCHAR(64) Foreign Key -> `organizations(id)` ON DELETE CASCADE
- `version_number`: INT
- `status`: VARCHAR(32)
- `snapshot_data`: TEXT (Complete JSON serialization of note fields at time of signing)
- `author_id`: VARCHAR(64) Foreign Key -> `users(id)`
- `signed_by_user_id`: VARCHAR(64) Foreign Key -> `users(id)`
- `signed_at`: TIMESTAMPTZ
- `amended_by_user_id`: VARCHAR(64) Foreign Key -> `users(id)`
- `amended_at`: TIMESTAMPTZ
- `amendment_reason`: TEXT
- `created_at`: TIMESTAMPTZ

### D. Clinical Observations (`clinical_observations`)
Point-in-time quantitative or qualitative measurements.
- `id`: VARCHAR(64) Primary Key (`obs_<uuid>`)
- `organization_id`: VARCHAR(64) Foreign Key -> `organizations(id)` ON DELETE CASCADE
- `encounter_id`: VARCHAR(64) Foreign Key -> `encounters(id)` ON DELETE CASCADE
- `patient_id`: VARCHAR(64) Foreign Key -> `patients(id)` ON DELETE CASCADE
- `recorded_by_user_id`: VARCHAR(64) Foreign Key -> `users(id)`
- `observation_type`: VARCHAR(64) (e.g., `BLOOD_PRESSURE_SYSTOLIC`, `BLOOD_PRESSURE_DIASTOLIC`, `HEART_RATE`, `RESPIRATORY_RATE`, `BODY_TEMPERATURE`, `OXYGEN_SATURATION`, `HEIGHT`, `WEIGHT`, `BMI`, `PAIN_SCORE`)
- `numeric_value`: DECIMAL(10, 2)
- `text_value`: VARCHAR(255)
- `unit`: VARCHAR(32) (`mmHg`, `bpm`, `breaths/min`, `celsius`, `fahrenheit`, `%`, `cm`, `kg`, `kg/m2`, `scale_0_10`)
- `status`: VARCHAR(32) (`PRELIMINARY`, `FINAL`, `AMENDED`)
- `notes`: TEXT
- `measured_at`: TIMESTAMPTZ
- `created_at`: TIMESTAMPTZ

---

## 3. Encounter Lifecycle State Machine

```
     ┌───────────┐
     │  PLANNED  │
     └─────┬─────┘
           │
     ┌─────┴──────────────┐
     │                    │
     ▼                    ▼
┌─────────────┐    ┌─────────────┐
│ IN_PROGRESS │    │  CANCELLED  │ (Terminal)
└──────┬──────┘    └─────────────┘
       │
 ┌─────┴──────────────┐
 │                    │
 ▼                    ▼
┌─────────────┐    ┌─────────────┐
│  COMPLETED  │    │  CANCELLED  │ (Terminal)
└─────────────┘    └─────────────┘
  (Terminal)
```

Allowed transitions:
- `PLANNED` -> `IN_PROGRESS`, `CANCELLED`
- `IN_PROGRESS` -> `COMPLETED`, `CANCELLED`
- `COMPLETED` -> Terminal (rejects further transitions)
- `CANCELLED` -> Terminal (rejects further transitions)

---

## 4. Note Signing, Concurrency & Amendment Behavior

1. **Draft Notes (`DRAFT`)**:
   - May be edited by authorized staff with `clinical_note.update_draft`.
   - Protected against lost updates via optimistic concurrency: clients pass `expectedVersion`. If the note's current version does not match, HTTP 409 Conflict is returned.

2. **Signed Notes (`SIGNED`)**:
   - Authorized clinicians (`DOCTOR`, `CLINICAL_DIRECTOR`) sign via `/api/v1/clinical-notes/:noteId/sign`.
   - Signing transitions note to `SIGNED`, records timestamp, signer ID, and persists an immutable snapshot in `clinical_note_versions`.
   - Signed notes cannot be silently overwritten (direct PATCH operations return HTTP 400).

3. **Amendments (`AMENDED`)**:
   - Clinicians perform corrections or addenda via `/api/v1/clinical-notes/:noteId/amend`.
   - Mandatory `amendmentReason` text is required on the server.
   - Atomically creates an archived version record with previous state and increments note `version` (e.g. 1 -> 2).
   - Preserves complete legal defensibility.

---

## 5. Clinical Observation Range & Unit Conventions

| Observation Type | Standard Units | Physiological Validation Range |
|---|---|---|
| `BLOOD_PRESSURE_SYSTOLIC` | `mmHg` | 31 – 350 mmHg |
| `BLOOD_PRESSURE_DIASTOLIC` | `mmHg` | 11 – 250 mmHg |
| `HEART_RATE` | `bpm` | 1 – 300 bpm |
| `RESPIRATORY_RATE` | `breaths/min`, `/min` | 1 – 120 /min |
| `BODY_TEMPERATURE` | `celsius`, `fahrenheit` | 25.0 – 46.0 °C / 77.0 – 115.0 °F |
| `OXYGEN_SATURATION` | `%` | 0 – 100 % |
| `HEIGHT` | `cm` | 10 – 300 cm |
| `WEIGHT` | `kg` | 0.2 – 600 kg |
| `BMI` | `kg/m2` | 5.0 – 120.0 kg/m² |
| `PAIN_SCORE` | `scale_0_10` | 0 – 10 |

Measurements outside these ranges or with missing units are rejected with descriptive validation errors.

---

## 6. Permissions Matrix

| Permission Code | Meaning | Granted Roles |
|---|---|---|
| `encounter.view` | View clinical encounter roster & details | Super Admin, Org Owner, Org Admin, Clinical Director, Doctor, Nurse, Therapist, Receptionist |
| `encounter.create` | Initiate an encounter record | Clinical Director, Doctor, Nurse, Receptionist |
| `encounter.update` | Update encounter details & start visit | Clinical Director, Doctor, Nurse |
| `encounter.complete` | Sign off and complete encounter | Clinical Director, Doctor |
| `encounter.cancel` | Cancel clinical encounter | Clinical Director, Doctor |
| `clinical_note.view` | View confidential clinician notes | Super Admin, Clinical Director, Doctor, Nurse, Therapist |
| `clinical_note.create` | Draft a new clinical note | Clinical Director, Doctor, Nurse, Therapist |
| `clinical_note.update_draft`| Save updates to draft notes | Clinical Director, Doctor, Nurse, Therapist |
| `clinical_note.sign` | Electronically finalize & sign notes | Clinical Director, Doctor |
| `clinical_note.amend` | Formally amend signed notes | Clinical Director, Doctor |
| `clinical_observation.view`| View vital signs & observations | Clinical Director, Doctor, Nurse, Therapist |
| `clinical_observation.record`| Record vital signs & measurements | Clinical Director, Doctor, Nurse |
| `medical_record.view` | View aggregated patient longitudinal medical record | Super Admin, Org Owner, Org Admin, Clinical Director, Doctor, Nurse, Therapist |

*Note*: Receptionist staff have encounter scheduling privileges (`encounter.view`, `encounter.create`), but strictly NO access to clinical notes or patient medical record aggregation. Billing personnel are strictly denied all encounter and clinical note endpoints.

---

## 7. Versioned REST API Specification

### Encounters
- `GET /api/v1/encounters` — List encounters with filters (`patientId`, `providerId`, `status`, `encounterType`, `startDate`, `endDate`).
- `POST /api/v1/encounters` — Create a new clinical encounter.
- `GET /api/v1/encounters/:encounterId` — Retrieve encounter details, patient, provider, and linked appointment.
- `PATCH /api/v1/encounters/:encounterId` — Update editable fields (`reasonForVisit`, `encounterType`).
- `POST /api/v1/encounters/:encounterId/start` — Transition status to `IN_PROGRESS`.
- `POST /api/v1/encounters/:encounterId/complete` — Transition status to `COMPLETED`.
- `POST /api/v1/encounters/:encounterId/cancel` — Cancel encounter with required cancellation reason.

### Clinical Notes
- `GET /api/v1/encounters/:encounterId/notes` — List notes authored for an encounter.
- `POST /api/v1/encounters/:encounterId/notes` — Author a new draft note for an encounter.
- `GET /api/v1/clinical-notes/:noteId` — Retrieve single note with author, signer, and version count.
- `PATCH /api/v1/clinical-notes/:noteId` — Update draft note with optimistic locking (`expectedVersion`).
- `POST /api/v1/clinical-notes/:noteId/sign` — Electronically sign and finalize note.
- `POST /api/v1/clinical-notes/:noteId/amend` — Apply clinical amendment with justification reason.
- `GET /api/v1/clinical-notes/:noteId/versions` — Retrieve immutable historical version snapshots.

### Observations & Medical Records
- `GET /api/v1/encounters/:encounterId/observations` — List observations recorded for an encounter.
- `POST /api/v1/encounters/:encounterId/observations` — Record point-in-time observation or vital sign.
- `GET /api/v1/patients/:patientId/observations` — Retrieve all historical observations for a patient.
- `GET /api/v1/patients/:patientId/medical-record` — Retrieve longitudinal patient medical record.

---

## 8. Audit Event Catalog

| Action | Resource Type | Trigger | Sanitized Metadata Captured |
|---|---|---|---|
| `encounter.created` | `Encounter` | New encounter initiated | `patientId`, `providerId`, `encounterType`, `appointmentId` |
| `encounter.updated` | `Encounter` | Encounter fields updated | `patientId`, `previousStatus`, `newStatus` |
| `encounter.started` | `Encounter` | Encounter transitioned to `IN_PROGRESS` | `patientId`, `startedAt` |
| `encounter.completed` | `Encounter` | Encounter marked `COMPLETED` | `patientId`, `completedBy` |
| `encounter.cancelled` | `Encounter` | Encounter cancelled | `patientId`, `cancellationReason` |
| `clinical_note.created` | `ClinicalNote` | Note draft created | `encounterId`, `patientId`, `noteType`, `version` |
| `clinical_note.updated` | `ClinicalNote` | Note draft updated | `encounterId`, `patientId`, `version` |
| `clinical_note.signed` | `ClinicalNote` | Note signed & locked | `encounterId`, `patientId`, `version`, `signerId` |
| `clinical_note.amended` | `ClinicalNote` | Note amended | `encounterId`, `patientId`, `previousVersion`, `newVersion` |
| `clinical_observation.recorded`| `ClinicalObservation` | Vital sign recorded | `encounterId`, `patientId`, `observationType`, `unit` |
| `medical_record.viewed` | `Patient` | Medical record aggregated | `encountersCount`, `notesCount`, `observationsCount` |

*Security Guarantee*: Raw clinical narrative bodies (chief complaint, HPI, examination, assessment, and plan text) are stripped from audit log metadata to prevent secondary PHI disclosure.

---

## 9. Verification & Test Execution

Run the complete test suite including Phase 5–8 regressions:
```bash
npm test
```
All 46 test suites verify:
- Cryptographic PBKDF2 hashing & constant-time authentication.
- Tenant isolation and cross-organization prevention.
- Patient registration, demographics, emergency contacts, consents.
- Provider credentialing, availability, and double-booking prevention.
- Phase 8 clinical encounter lifecycle, note signing, amendment version archival, observation range validation, and sanitized audit trails.
