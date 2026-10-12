# CLINILYNC Product Requirements Document (PRD)

## 1. Product Overview
- **Name:** CLINILYNC (Clinic + Link)
- **Tagline:** *Connecting Healthcare. Simplifying Care.*
- **Scope:** Global healthcare technology platform connecting healthcare organizations, medical professionals, administrative staff, and patients through one unified, secure ecosystem.
- **Geographic Orientation:** Designed for internationalization (i18n), multi-currency, multi-timezone, and regulatory adaptability (HIPAA, GDPR, PIPEDA, NHS-ready data structures).

## 2. Core Healthcare Journey
CLINILYNC eliminates isolated silos by chaining the complete continuum of care:
```
Patient (Registration / Intake)
  ↳ Appointment (Scheduling / Triage)
    ↳ Check-in (Waiting Room / Queue)
      ↳ Consultation (Vitals & Physical Exam)
        ↳ Clinical Record (SOAP Note / EMR Entry)
          ↳ Diagnosis (ICD-10 / SNOMED coding)
            ↳ Treatment Plan
              ↳ Prescription (e-Rx) & Lab Order
                ↳ Billing & Insurance Invoicing
                  ↳ Payment & Receipting
                    ↳ Follow-up & Secure Patient Messaging
```

## 3. User Personas & Roles
1. **Platform Super Admin:** Platform-wide oversight, tenant provisioning, system health, audit log oversight.
2. **Organization Owner / Administrator:** Organization configuration, clinic locations, staff management, role assignment.
3. **Clinical Director / Lead Doctor:** Clinical governance, template approval, clinical record sign-off.
4. **Doctor / Physician:** Consultations, clinical notes, diagnosis, e-prescribing, lab requisitions.
5. **Nurse:** Triage, vitals recording, medication administration, doctor assistance.
6. **Therapist / Specialist:** Specialized consultation notes, allied health care plans.
7. **Receptionist / Front Desk:** Patient check-in, appointment booking, queue management.
8. **Billing Staff:** Charge capture, invoice generation, payment processing, insurance claims.
9. **Laboratory Staff:** Specimen processing, lab order fulfillment, result entry.
10. **Pharmacist:** Prescription verification and dispensing.
11. **Patient:** Patient portal access to own appointments, released records, lab results, prescriptions, and invoices.

## 4. Multi-Tenant Architecture & Domain Isolation
- Every clinic/hospital is an isolated `Organization`.
- All operational data (patients, encounters, invoices, audit logs) carries a non-nullable `organization_id`.
- Strict server-side tenancy enforcement: A user belonging to Organization A can never query, mutate, or observe data belonging to Organization B.
- Cross-tenant attempts trigger `403 Forbidden` and generate a high-severity `AUDIT_SECURITY_BREACH_ATTEMPT` audit log event.
