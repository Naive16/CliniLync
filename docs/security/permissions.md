# CLINILYNC Permission Dictionary

Granular permissions used across RBAC and API middleware:

### Patient Domain
- `patient.view`: View patient demographics and basic profile
- `patient.create`: Register new patient intake
- `patient.update`: Modify patient demographics, contact details, emergency contacts
- `patient.archive`: Deactivate / archive patient record

### Appointment Domain
- `appointment.view`: View appointment schedule and booking queue
- `appointment.create`: Book new appointment slot
- `appointment.update`: Reschedule or modify appointment details
- `appointment.cancel`: Cancel appointment with cancellation reason
- `appointment.check_in`: Mark patient as checked in / waiting room
- `appointment.complete`: Mark appointment as completed by provider

### Clinical Domain
- `clinical.view`: Read clinical history, consultations, SOAP notes, examinations
- `clinical.create`: Author new clinical note / consultation encounter
- `clinical.update`: Edit draft clinical notes
- `clinical.finalize`: Sign-off and lock clinical note permanently

### Diagnosis & Allergies Domain
- `diagnosis.view`: View diagnosed conditions and ICD/SNOMED codes
- `diagnosis.create`: Record new diagnosis
- `diagnosis.update`: Resolve, update severity, or amend diagnosis

### Prescription Domain
- `prescription.view`: Read active and historical prescriptions
- `prescription.create`: Author new e-prescription with dosage and refills
- `prescription.update`: Adjust dosage or instructions
- `prescription.cancel`: Discontinue or revoke active prescription

### Laboratory Domain
- `lab.view`: View lab orders and result values
- `lab.order`: Request specimen analysis
- `lab.result_entry`: Enter lab test values and mark as abnormal/normal
- `lab.verify`: Pathologist/Director verification of lab results

### Billing & Financial Domain
- `billing.view`: Read invoices, fee schedules, outstanding balances
- `billing.create_invoice`: Generate invoice for consultations, procedures, lab tests
- `billing.update_invoice`: Modify line items, apply adjustments
- `billing.record_payment`: Record card, bank, or cash payment against invoice
- `billing.refund`: Authorize patient or insurance refund

### Messaging & Communications
- `message.view`: Read communication threads
- `message.send`: Send direct message or clinical notification to patient/staff

### Document Management
- `document.view`: Access uploaded medical imaging, consent forms, discharge summaries
- `document.upload`: Upload patient or clinical documents
- `document.update`: Rename or recategorize documents
- `document.delete`: Archive or remove documents

### User & Administration
- `user.view`: View staff accounts and roster
- `user.create`: Invite new healthcare staff member
- `user.update`: Update credentials, profile, or role assignments
- `user.disable`: Deactivate staff member account
- `audit.view`: Access immutable organization audit log
- `report.view`: View clinical, operational, and financial analytics
- `report.export`: Export compliance or financial audit reports
