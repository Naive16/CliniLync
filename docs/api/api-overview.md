# CLINILYNC Core API Specifications & Contracts

## 1. Architectural Standards

All endpoints operate under the primary domain at `/api/v1/*`. Requests require the standard headers:
- `Authorization: Bearer <session_token>`
- `X-Organization-Id: <organization_uuid>` (Optional context verification; validated against server session)
- `Content-Type: application/json`
- `Idempotency-Key: <uuid>` (Optional on mutations)

---

## 2. Core API Contracts with Full Specifications

### 2.1 Register Patient Intake (`POST /api/v1/patients`)
- **Action:** Enrolls a new patient into the active organization, generates a unique Medical Record Number (MRN), and creates demographic records.
- **Authorization:** `patient.create`
- **Validation:**
  - `firstName`, `lastName`: String (1-100 chars, non-empty)
  - `dateOfBirth`: ISO 8601 Date (`YYYY-MM-DD`, must be past date)
  - `sex`: Enum (`MALE`, `FEMALE`, `OTHER`, `UNKNOWN`)
  - `phone`: E.164 compliant string
- **Request:**
  ```json
  {
    "firstName": "Eleanor",
    "lastName": "Vance",
    "dateOfBirth": "1988-11-14",
    "sex": "FEMALE",
    "bloodGroup": "O_POSITIVE",
    "email": "eleanor.vance@example.com",
    "phone": "+447700900441",
    "preferredLanguage": "en",
    "address": {
      "line1": "14 Kensington Church Street",
      "city": "London",
      "postalCode": "W8 4EP",
      "countryCode": "GBR"
    },
    "emergencyContact": {
      "name": "Marcus Vance",
      "relationship": "Spouse",
      "phone": "+447700900124"
    }
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "data": {
      "id": "e4b2d109-8f3a-4c92-b831-2947a19e3401",
      "organizationId": "c1f7b029-4c6e-4c3e-8c34-7c2a792d04a1",
      "mrn": "MRN-90425",
      "firstName": "Eleanor",
      "lastName": "Vance",
      "dateOfBirth": "1988-11-14",
      "sex": "FEMALE",
      "status": "ACTIVE",
      "createdAt": "2026-10-08T17:35:00.000Z"
    },
    "meta": { "requestId": "req_01a", "timestamp": "2026-10-08T17:35:00.000Z" }
  }
  ```
- **Errors:** `400 Bad Request` (Invalid DOB), `403 Forbidden` (Missing `patient.create`), `409 Conflict` (Duplicate MRN in org).
- **Audit Behavior:** Emits `patient.created` event capturing actor ID, MRN, and patient ID.

---

### 2.2 Get Patient Details (`GET /api/v1/patients/:id`)
- **Action:** Retrieves patient demographic record.
- **Authorization:** `patient.view` + Tenancy Check
- **Response (200 OK):**
  ```json
  {
    "data": {
      "id": "e4b2d109-8f3a-4c92-b831-2947a19e3401",
      "mrn": "MRN-90425",
      "firstName": "Eleanor",
      "lastName": "Vance",
      "dateOfBirth": "1988-11-14",
      "sex": "FEMALE",
      "phone": "+447700900441",
      "allergiesSummary": "Penicillin (Urticaria)",
      "status": "ACTIVE"
    },
    "meta": { "requestId": "req_01b" }
  }
  ```
- **Errors:** `403 Forbidden` (Tenancy mismatch), `404 Not Found` (Does not exist in active org).
- **Audit Behavior:** Emits `patient.viewed` event.

---

### 2.3 Patient 360 Aggregated Summary (`GET /api/v1/patients/:id/summary`)
- **Action:** Aggregates longitudinal health record (encounters, active diagnoses, allergies, active prescriptions, latest vitals, upcoming visits).
- **Authorization:** `clinical.view` + Provider/Patient Relationship Check
- **Response (200 OK):**
  ```json
  {
    "data": {
      "patient": {
        "id": "e4b2d109-8f3a-4c92-b831-2947a19e3401",
        "mrn": "MRN-90425",
        "name": "Eleanor Vance",
        "dob": "1988-11-14",
        "bloodGroup": "O_POSITIVE"
      },
      "activeDiagnoses": [
        { "code": "I10", "description": "Essential Hypertension", "status": "ACTIVE" }
      ],
      "allergies": [
        { "allergen": "Penicillin", "reaction": "Urticaria", "severity": "MODERATE" }
      ],
      "activePrescriptions": [
        { "medication": "Amlodipine 5mg", "sig": "1 tab PO daily in AM", "refills": 3 }
      ],
      "latestVitals": {
        "bp": "124/80",
        "hr": 70,
        "bmi": 23.4,
        "recordedAt": "2026-10-08T09:15:00.000Z"
      },
      "upcomingAppointments": [
        { "id": "apt_201", "time": "2026-10-15T10:00:00.000Z", "provider": "Dr. Sarah Chen" }
      ]
    },
    "meta": { "requestId": "req_01c" }
  }
  ```
- **Errors:** `403 Forbidden` (Non-clinical staff such as billing clerk attempting to view summary).
- **Audit Behavior:** Emits `patient.summary_viewed` event.

---

### 2.4 Book Appointment (`POST /api/v1/appointments`)
- **Action:** Schedules an appointment slot with provider schedule verification.
- **Authorization:** `appointment.create`
- **Validation:** `scheduledStart` must be future; provider must not have overlapping confirmed appointment.
- **Request:**
  ```json
  {
    "patientId": "e4b2d109-8f3a-4c92-b831-2947a19e3401",
    "providerId": "prov_sarah",
    "departmentId": "dept_cardio",
    "scheduledStart": "2026-10-15T10:00:00.000Z",
    "durationMinutes": 30,
    "appointmentType": "CONSULTATION",
    "reasonForVisit": "Follow-up for borderline blood pressure monitoring"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "data": {
      "id": "apt_201",
      "status": "SCHEDULED",
      "scheduledStart": "2026-10-15T10:00:00.000Z",
      "scheduledEnd": "2026-10-15T10:30:00.000Z"
    },
    "meta": { "requestId": "req_01d" }
  }
  ```
- **Errors:** `409 Conflict` (Provider slot collision).
- **Audit Behavior:** Emits `appointment.created`.

---

### 2.5 Appointment Check-in (`POST /api/v1/appointments/:id/check-in`)
- **Action:** Explicit workflow action advancing appointment state from `CONFIRMED`/`SCHEDULED` to `CHECKED_IN`.
- **Authorization:** `appointment.check_in`
- **Response (200 OK):**
  ```json
  {
    "data": {
      "id": "apt_201",
      "status": "CHECKED_IN",
      "checkedInAt": "2026-10-15T09:55:12.000Z"
    },
    "meta": { "requestId": "req_01e" }
  }
  ```
- **Audit Behavior:** Emits `appointment.checked_in`.

---

### 2.6 Initiate Encounter (`POST /api/v1/encounters`)
- **Action:** Opens a clinical encounter container for an active consultation.
- **Authorization:** `clinical.create`
- **Request:**
  ```json
  {
    "patientId": "e4b2d109-8f3a-4c92-b831-2947a19e3401",
    "appointmentId": "apt_201",
    "encounterClass": "AMBULATORY",
    "chiefComplaint": "Follow-up for blood pressure and review of home monitoring log"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "data": {
      "id": "enc_901",
      "status": "IN_PROGRESS",
      "periodStart": "2026-10-15T10:02:00.000Z"
    },
    "meta": { "requestId": "req_01f" }
  }
  ```
- **Audit Behavior:** Emits `encounter.initiated`.

---

### 2.7 Finalize Clinical SOAP Note (`POST /api/v1/encounters/:id/finalize`)
- **Action:** Signs and permanently finalizes a clinical note, locking it from modification.
- **Authorization:** `clinical.finalize` (Lead Clinician / Doctor)
- **Request:**
  ```json
  {
    "clinicalNoteId": "cn_401",
    "assessment": "Essential hypertension well-controlled on current therapy.",
    "plan": "Continue Amlodipine 5mg OD. Recheck in 6 months."
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "data": {
      "id": "cn_401",
      "status": "FINALIZED",
      "finalizedAt": "2026-10-15T10:28:00.000Z",
      "signedBy": "Dr. Sarah Chen, MD"
    },
    "meta": { "requestId": "req_01g" }
  }
  ```
- **Errors:** `400 Bad Request` (Already finalized).
- **Audit Behavior:** Emits `clinical.note_finalized` with cryptographic signature hash.

---

### 2.8 Authorize Prescription (`POST /api/v1/prescriptions`)
- **Action:** Issues electronic prescription (e-Rx) with dosage, duration, and refills.
- **Authorization:** `prescription.create` (Licensed Clinician)
- **Request:**
  ```json
  {
    "patientId": "e4b2d109-8f3a-4c92-b831-2947a19e3401",
    "encounterId": "enc_901",
    "medicationName": "Amlodipine Besylate",
    "dosage": "5 mg",
    "route": "ORAL",
    "frequency": "Once daily in morning",
    "duration": "90 Days",
    "quantity": 90,
    "refillsAuthorized": 3,
    "instructions": "Take with water. Monitor morning BP periodically."
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "data": {
      "id": "rx_801",
      "status": "ACTIVE",
      "signedAt": "2026-10-15T10:25:00.000Z",
      "refillsRemaining": 3
    },
    "meta": { "requestId": "req_01h" }
  }
  ```
- **Audit Behavior:** Emits `prescription.created`.

---

### 2.9 Order Laboratory Diagnostics (`POST /api/v1/lab-orders`)
- **Action:** Requisitions laboratory diagnostic panel.
- **Authorization:** `lab.order`
- **Request:**
  ```json
  {
    "patientId": "e4b2d109-8f3a-4c92-b831-2947a19e3401",
    "encounterId": "enc_901",
    "testCode": "LOINC-24331-1",
    "testName": "Comprehensive Lipid Panel",
    "priority": "ROUTINE",
    "clinicalIndication": "Annual cardiovascular risk assessment"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "data": {
      "id": "lab_601",
      "status": "ORDERED",
      "priority": "ROUTINE",
      "orderedAt": "2026-10-15T10:26:00.000Z"
    },
    "meta": { "requestId": "req_01i" }
  }
  ```
- **Audit Behavior:** Emits `lab.ordered`.

---

### 2.10 Generate Invoice (`POST /api/v1/invoices`)
- **Action:** Itemizes clinical charges and creates financial billing statement.
- **Authorization:** `billing.create_invoice`
- **Request:**
  ```json
  {
    "patientId": "e4b2d109-8f3a-4c92-b831-2947a19e3401",
    "dueDate": "2026-11-15",
    "currencyCode": "GBP",
    "items": [
      {
        "serviceCode": "CPT-99214",
        "description": "Specialist Outpatient Consultation (Level 4)",
        "quantity": 1,
        "unitPrice": "180.00"
      },
      {
        "serviceCode": "CPT-93000",
        "description": "12-Lead Diagnostic ECG",
        "quantity": 1,
        "unitPrice": "70.00"
      }
    ],
    "notes": "Settlement due within 30 days."
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "data": {
      "id": "inv_501",
      "invoiceNumber": "INV-2026-0091",
      "subtotal": "250.00",
      "totalAmount": "250.00",
      "paidAmount": "0.00",
      "balanceDue": "250.00",
      "currencyCode": "GBP",
      "status": "ISSUED"
    },
    "meta": { "requestId": "req_01j" }
  }
  ```
- **Audit Behavior:** Emits `billing.invoice_created`.

---

### 2.11 Record Payment (`POST /api/v1/invoices/:id/payments`)
- **Action:** Records financial transaction against invoice, updating balance and status.
- **Authorization:** `billing.record_payment`
- **Request:**
  ```json
  {
    "amount": "250.00",
    "paymentMethod": "CARD",
    "referenceNumber": "AUTH-POS-98124",
    "notes": "Contactless chip terminal payment"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "data": {
      "paymentId": "pay_301",
      "invoiceId": "inv_501",
      "amountPaid": "250.00",
      "newBalanceDue": "0.00",
      "invoiceStatus": "PAID"
    },
    "meta": { "requestId": "req_01k" }
  }
  ```
- **Audit Behavior:** Emits `billing.payment_recorded`.
