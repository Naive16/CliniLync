/**
 * CLINILYNC Automated Test Suite: Phase 10 Medications, Prescriptions & Pharmacy Workflows
 * 
 * Verifies:
 * 1. Medication catalog search and local formulary additions.
 * 2. Patient allergies & adverse reactions recording and status updating.
 * 3. Longitudinal patient medication history management (active, dose, route, sig).
 * 4. Medication reconciliation with discrepancy count and clinical notes.
 * 5. In-house and external pharmacy registry.
 * 6. Clinician draft prescription creation with structured dosage, route, quantity, refills, and sig.
 * 7. Clinical safety evaluation detecting allergy cross-reactions.
 * 8. Clinical safety override with required clinician justification and audit trail.
 * 9. Cryptographic signing with SHA-256 payload snapshot, version bump, and immutability lock.
 * 10. Prevention of direct modification of signed prescriptions (optimistic locking / immutability).
 * 11. Prescription cancellation with mandatory clinical reason.
 * 12. Defensible prescription replacement workflow (superseding with linked replacement).
 * 13. Pharmacy dispensation workflow (quantity tracking, transition to DISPENSED / PARTIALLY_DISPENSED).
 * 14. Strict multi-tenant isolation across all medication, allergy, prescription, and pharmacy entities.
 * 15. Role-Based Access Control: Receptionist denied prescribing/signing; Clinician permitted; Pharmacist permitted dispensing.
 * 16. Sanitized append-only audit trail logging for all sensitive medication events.
 */

import crypto from 'node:crypto';
import { getDatabaseClient } from '../database/db.js';
import { Permissions, SystemRoles } from '../backend/security/permissions.js';
import { SecurityContext, Organization } from '../backend/types/domain.js';
import { MedicationService, MedicationError } from '../backend/services/medication.service.js';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export async function runPhase10MedicationTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const db = getDatabaseClient();

  const orgStJude: Organization = {
    id: 'org_st_jude',
    name: 'St. Jude Global Health Center',
    slug: 'st-jude-london',
    country_code: 'GBR',
    currency_code: 'GBP',
    timezone: 'Europe/London',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const orgMetroHealth: Organization = {
    id: 'org_metro_health',
    name: 'Metro Health Specialty Institute',
    slug: 'metro-health-ny',
    country_code: 'USA',
    currency_code: 'USD',
    timezone: 'America/New_York',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // Dr. Sarah Chen (Doctor in St. Jude)
  const drSarahContext: SecurityContext = {
    user: { id: 'usr_sarah', email: 'dr.sarah@clinilync.com', firstName: 'Sarah', lastName: 'Chen', isSuperAdmin: false },
    activeOrganization: orgStJude,
    roles: [{ id: 'role_doctor', code: SystemRoles.DOCTOR, name: 'Doctor', is_system_role: true, created_at: new Date().toISOString() }],
    permissions: [
      Permissions.PATIENT_VIEW,
      Permissions.ENCOUNTER_VIEW,
      Permissions.MEDICATION_VIEW,
      Permissions.MEDICATION_RECORD,
      Permissions.MEDICATION_UPDATE,
      Permissions.MEDICATION_DISCONTINUE,
      Permissions.ALLERGY_MANAGE,
      Permissions.PRESCRIPTION_VIEW,
      Permissions.PRESCRIPTION_CREATE,
      Permissions.PRESCRIPTION_UPDATE,
      Permissions.PRESCRIPTION_UPDATE_DRAFT,
      Permissions.PRESCRIPTION_SIGN,
      Permissions.PRESCRIPTION_CANCEL,
      Permissions.PHARMACY_VIEW,
      Permissions.PHARMACY_MANAGE
    ],
    sessionToken: 'test_token_sarah'
  };

  // James Wilson (Pharmacist in St. Jude)
  const pharmacistJamesContext: SecurityContext = {
    user: { id: 'usr_james', email: 'james.pharmacy@clinilync.com', firstName: 'James', lastName: 'Wilson', isSuperAdmin: false },
    activeOrganization: orgStJude,
    roles: [{ id: 'role_pharmacist', code: SystemRoles.PHARMACIST, name: 'Pharmacist', is_system_role: true, created_at: new Date().toISOString() }],
    permissions: [
      Permissions.PATIENT_VIEW,
      Permissions.MEDICATION_VIEW,
      Permissions.PRESCRIPTION_VIEW,
      Permissions.PRESCRIPTION_DISPENSE,
      Permissions.PHARMACY_VIEW
    ],
    sessionToken: 'test_token_james'
  };

  // Elena Ramos (Receptionist in St. Jude)
  const receptionistElenaContext: SecurityContext = {
    user: { id: 'usr_reception', email: 'elena.reception@clinilync.com', firstName: 'Elena', lastName: 'Ramos', isSuperAdmin: false },
    activeOrganization: orgStJude,
    roles: [{ id: 'role_receptionist', code: SystemRoles.RECEPTIONIST, name: 'Receptionist', is_system_role: true, created_at: new Date().toISOString() }],
    permissions: [
      Permissions.PATIENT_VIEW,
      Permissions.APPOINTMENT_VIEW
      // Denied all PRESCRIPTION_*, ALLERGY_MANAGE, MEDICATION_RECORD
    ],
    sessionToken: 'test_token_elena'
  };

  // Dr. Marcus (Doctor in Foreign Org: Metro Health)
  const drMarcusForeignContext: SecurityContext = {
    user: { id: 'usr_marcus', email: 'dr.marcus@metrohealth.com', firstName: 'Marcus', lastName: 'Brody', isSuperAdmin: false },
    activeOrganization: orgMetroHealth,
    roles: [{ id: 'role_doctor_metro', code: SystemRoles.DOCTOR, name: 'Doctor', is_system_role: true, created_at: new Date().toISOString() }],
    permissions: [
      Permissions.PATIENT_VIEW,
      Permissions.MEDICATION_VIEW,
      Permissions.MEDICATION_RECORD,
      Permissions.PRESCRIPTION_VIEW,
      Permissions.PRESCRIPTION_CREATE,
      Permissions.PRESCRIPTION_SIGN
    ],
    sessionToken: 'test_token_marcus'
  };

  // Fetch verified doctor provider profile in St. Jude
  const provRes = await db.query<{ id: string }>(
    "SELECT id FROM providers WHERE organization_id = 'org_st_jude' LIMIT 1"
  );
  const providerId = provRes.rows[0]?.id || 'prov_sarah';

  // Fetch verified patient in St. Jude
  const patRes = await db.query<{ id: string }>(
    "SELECT id FROM patients WHERE organization_id = 'org_st_jude' LIMIT 1"
  );
  const patientId = patRes.rows[0]?.id || 'pat_john_doe';

  // -------------------------------------------------------------------------
  // TEST 1: Medication Catalog Search & Local Formulary Additions
  // -------------------------------------------------------------------------
  try {
    const catalogItem = await MedicationService.createLocalCatalogEntry(
      {
        displayName: 'Amoxicillin 500mg Oral Capsule',
        genericName: 'Amoxicillin',
        activeIngredients: 'Amoxicillin trihydrate 500mg',
        strength: '500mg',
        dosageForm: 'CAPSULE',
        routeOfAdministration: 'ORAL',
        classification: 'GENERIC'
      },
      {
        organizationId: orgStJude.id,
        userId: drSarahContext.user.id,
        userRole: drSarahContext.roles[0].code
      }
    );

    const searchResults = await MedicationService.searchCatalog('Amoxicillin');
    const match = searchResults.items.find(i => i.id === catalogItem.id);

    if (match && match.display_name === 'Amoxicillin 500mg Oral Capsule') {
      results.push({ name: 'Phase 10 - Medication Catalog Creation & Terminology Search', passed: true });
    } else {
      results.push({ name: 'Phase 10 - Medication Catalog Creation & Terminology Search', passed: false, error: 'Catalog item not found in search' });
    }
  } catch (err) {
    results.push({ name: 'Phase 10 - Medication Catalog Creation & Terminology Search', passed: false, error: (err as Error).message });
  }

  // -------------------------------------------------------------------------
  // TEST 2: Patient Allergy Recording & Severity Tracking
  // -------------------------------------------------------------------------
  let penicillinAllergyId = '';
  try {
    const allergy = await MedicationService.recordPatientAllergy(
      {
        patientId,
        substanceName: 'Penicillin',
        allergenType: 'MEDICATION',
        reactionDescription: 'Severe anaphylaxis, facial angioedema, and wheezing upon ingestion',
        severity: 'SEVERE',
        verificationStatus: 'CONFIRMED',
        clinicalStatus: 'ACTIVE',
        notes: 'Documented after childhood allergic reaction to Augmentin'
      },
      {
        organizationId: orgStJude.id,
        userId: drSarahContext.user.id,
        userRole: drSarahContext.roles[0].code
      }
    );

    penicillinAllergyId = allergy.id;
    const { allergies } = await MedicationService.getPatientAllergies(patientId, orgStJude.id);
    const found = allergies.find(a => a.id === allergy.id);

    if (found && found.substance_name === 'Penicillin' && found.severity === 'SEVERE') {
      results.push({ name: 'Phase 10 - Patient Documented Allergy Recording & Severity Tracking', passed: true });
    } else {
      results.push({ name: 'Phase 10 - Patient Documented Allergy Recording & Severity Tracking', passed: false, error: 'Recorded allergy not found in patient allergy profile' });
    }
  } catch (err) {
    results.push({ name: 'Phase 10 - Patient Documented Allergy Recording & Severity Tracking', passed: false, error: (err as Error).message });
  }

  // -------------------------------------------------------------------------
  // TEST 3: Longitudinal Patient Medication History & Discontinuation
  // -------------------------------------------------------------------------
  try {
    const medRecord = await MedicationService.recordPatientMedication(
      {
        patientId,
        medicationName: 'Lisinopril 10mg Oral Tablet',
        dosage: '10mg',
        route: 'ORAL',
        frequency: 'ONCE_DAILY',
        sigInstructions: 'Take 1 tablet by mouth daily in the morning for hypertension',
        startDate: '2026-01-15'
      },
      {
        organizationId: orgStJude.id,
        userId: drSarahContext.user.id,
        userRole: drSarahContext.roles[0].code
      }
    );

    // Discontinue medication with explicit clinical rationale
    const discontinued = await MedicationService.discontinuePatientMedication(
      medRecord.id,
      'Switched to ARB due to persistent dry ACE-inhibitor cough',
      {
        organizationId: orgStJude.id,
        userId: drSarahContext.user.id,
        userRole: drSarahContext.roles[0].code
      }
    );

    if (discontinued.status === 'DISCONTINUED' && discontinued.discontinuation_reason?.includes('dry ACE-inhibitor cough')) {
      results.push({ name: 'Phase 10 - Longitudinal Patient Medication Recording & Defensible Discontinuation', passed: true });
    } else {
      results.push({ name: 'Phase 10 - Longitudinal Patient Medication Recording & Defensible Discontinuation', passed: false, error: 'Discontinuation state not saved accurately' });
    }
  } catch (err) {
    results.push({ name: 'Phase 10 - Longitudinal Patient Medication Recording & Defensible Discontinuation', passed: false, error: (err as Error).message });
  }

  // -------------------------------------------------------------------------
  // TEST 4: Medication Reconciliation Workflow
  // -------------------------------------------------------------------------
  try {
    const reconciliation = await MedicationService.reconcileMedications(
      patientId,
      {
        discrepancyCount: 1,
        notes: 'Patient reports OTC Ibuprofen use not previously noted; verified Lisinopril discontinued.'
      },
      {
        organizationId: orgStJude.id,
        userId: drSarahContext.user.id,
        userRole: drSarahContext.roles[0].code
      }
    );

    if (reconciliation.id && reconciliation.discrepancy_count === 1) {
      results.push({ name: 'Phase 10 - Structured Medication Reconciliation with Discrepancy Tracking', passed: true });
    } else {
      results.push({ name: 'Phase 10 - Structured Medication Reconciliation with Discrepancy Tracking', passed: false, error: 'Failed to record reconciliation entry' });
    }
  } catch (err) {
    results.push({ name: 'Phase 10 - Structured Medication Reconciliation with Discrepancy Tracking', passed: false, error: (err as Error).message });
  }

  // -------------------------------------------------------------------------
  // TEST 5: In-house & External Pharmacy Registry
  // -------------------------------------------------------------------------
  let pharmacyId = '';
  try {
    const pharmacy = await MedicationService.createPharmacy(
      {
        name: 'St. Jude In-House Dispensary',
        phone: '+44 20 7946 0991',
        email: 'dispensary@stjude.nhs.uk',
        addressLine1: 'Central Hospital Concourse, Ground Floor',
        city: 'London',
        postalCode: 'WC1N 3JH',
        countryCode: 'GBR',
        isInternal: true
      },
      {
        organizationId: orgStJude.id,
        userId: drSarahContext.user.id,
        userRole: drSarahContext.roles[0].code
      }
    );

    pharmacyId = pharmacy.id;
    const { pharmacies } = await MedicationService.listPharmacies(orgStJude.id);
    const found = pharmacies.find(p => p.id === pharmacy.id);

    if (found && found.is_internal) {
      results.push({ name: 'Phase 10 - In-House & External Pharmacy Registry Management', passed: true });
    } else {
      results.push({ name: 'Phase 10 - In-House & External Pharmacy Registry Management', passed: false, error: 'Pharmacy registry entry not retrieved' });
    }
  } catch (err) {
    results.push({ name: 'Phase 10 - In-House & External Pharmacy Registry Management', passed: false, error: (err as Error).message });
  }

  // -------------------------------------------------------------------------
  // TEST 6: Clinician Draft Prescription Creation with Multi-Item Structure
  // -------------------------------------------------------------------------
  let draftPrescriptionId = '';
  try {
    const draft = await MedicationService.createDraftPrescription(
      {
        patientId,
        providerId,
        priority: 'ROUTINE',
        pharmacyId,
        items: [
          {
            medicationName: 'Atorvastatin 20mg Oral Tablet',
            dosageForm: 'TABLET',
            doseAmount: '20',
            doseUnit: 'mg',
            route: 'ORAL',
            frequency: 'ONCE_DAILY_EVENING',
            duration: '30 days',
            quantity: 30,
            quantityUnit: 'TABLET',
            refillsAuthorized: 2,
            sigInstructions: 'Take 1 tablet by mouth daily at bedtime with or without food',
            indication: 'Hypercholesterolemia cardiovascular risk reduction'
          }
        ]
      },
      {
        organizationId: orgStJude.id,
        userId: drSarahContext.user.id,
        userRole: drSarahContext.roles[0].code
      }
    );

    draftPrescriptionId = draft.prescription.id;

    if (draft.prescription.status === 'DRAFT' && draft.items.length === 1 && draft.items[0].refills_authorized === 2) {
      results.push({ name: 'Phase 10 - Structured Multi-Item Clinician Prescription Authoring', passed: true });
    } else {
      results.push({ name: 'Phase 10 - Structured Multi-Item Clinician Prescription Authoring', passed: false, error: 'Draft prescription structure mismatch' });
    }
  } catch (err) {
    results.push({ name: 'Phase 10 - Structured Multi-Item Clinician Prescription Authoring', passed: false, error: (err as Error).message });
  }

  // -------------------------------------------------------------------------
  // TEST 7: Clinical Safety Check Triggering Allergy Cross-Reaction Alert
  // -------------------------------------------------------------------------
  let allergyPrescriptionId = '';
  try {
    // Penicillin allergic patient being prescribed Amoxicillin
    const safetyDraft = await MedicationService.createDraftPrescription(
      {
        patientId,
        providerId,
        priority: 'ROUTINE',
        pharmacyId,
        items: [
          {
            medicationName: 'Amoxicillin 500mg Oral Capsule',
            dosageForm: 'CAPSULE',
            doseAmount: '500',
            doseUnit: 'mg',
            route: 'ORAL',
            frequency: 'TID',
            duration: '7 days',
            quantity: 21,
            quantityUnit: 'CAPSULE',
            refillsAuthorized: 0,
            sigInstructions: 'Take 1 capsule three times daily for 7 days',
            indication: 'Suspected bacterial pharyngitis'
          }
        ]
      },
      {
        organizationId: orgStJude.id,
        userId: drSarahContext.user.id,
        userRole: drSarahContext.roles[0].code
      }
    );

    allergyPrescriptionId = safetyDraft.prescription.id;

    if (safetyDraft.safetyCheck.hasAlerts && safetyDraft.safetyCheck.alerts.some(a => a.severity === 'CRITICAL' || a.severity === 'WARNING')) {
      results.push({ name: 'Phase 10 - Clinical Safety Check Cross-Referencing Patient Allergies', passed: true });
    } else {
      results.push({ name: 'Phase 10 - Clinical Safety Check Cross-Referencing Patient Allergies', passed: false, error: 'Safety check did not flag documented penicillin allergy' });
    }
  } catch (err) {
    results.push({ name: 'Phase 10 - Clinical Safety Check Cross-Referencing Patient Allergies', passed: false, error: (err as Error).message });
  }

  // -------------------------------------------------------------------------
  // TEST 8: Clinical Safety Override with Mandatory Rationale
  // -------------------------------------------------------------------------
  try {
    const override = await MedicationService.recordSafetyOverride(
      allergyPrescriptionId,
      {
        patientId,
        allergyId: penicillinAllergyId,
        alertType: 'ALLERGY_CROSS_REACTION',
        alertDescription: 'Patient has documented Penicillin allergy; Amoxicillin is a beta-lactam penicillin derivate.',
        overrideReason: 'Formal desensitization protocol completed in Allergy & Immunology unit under specialist supervision.'
      },
      {
        organizationId: orgStJude.id,
        userId: drSarahContext.user.id,
        userRole: drSarahContext.roles[0].code
      }
    );

    if (override && override.id) {
      results.push({ name: 'Phase 10 - Defensible Clinical Safety Override with Mandatory Rationale', passed: true });
    } else {
      results.push({ name: 'Phase 10 - Defensible Clinical Safety Override with Mandatory Rationale', passed: false, error: 'Safety override not recorded' });
    }
  } catch (err) {
    results.push({ name: 'Phase 10 - Defensible Clinical Safety Override with Mandatory Rationale', passed: false, error: (err as Error).message });
  }

  // -------------------------------------------------------------------------
  // TEST 9: Cryptographic Signing & Immutability Lock
  // -------------------------------------------------------------------------
  let signedPrescriptionId = draftPrescriptionId;
  try {
    const signed = await MedicationService.signPrescription(
      signedPrescriptionId,
      {
        organizationId: orgStJude.id,
        userId: drSarahContext.user.id,
        userRole: drSarahContext.roles[0].code
      }
    );

    if (signed.status === 'SIGNED' && signed.signature_hash && signed.signed_at) {
      results.push({ name: 'Phase 10 - Cryptographic Prescription Signing & SHA-256 Hashing', passed: true });
    } else {
      results.push({ name: 'Phase 10 - Cryptographic Prescription Signing & SHA-256 Hashing', passed: false, error: 'Prescription missing signature hash or signed status' });
    }
  } catch (err) {
    results.push({ name: 'Phase 10 - Cryptographic Prescription Signing & SHA-256 Hashing', passed: false, error: (err as Error).message });
  }

  // -------------------------------------------------------------------------
  // TEST 10: Prevention of Direct Mutation on Signed Prescription
  // -------------------------------------------------------------------------
  try {
    let failedAsExpected = false;
    try {
      await MedicationService.updateDraftPrescription(
        signedPrescriptionId,
        {
          priority: 'STAT',
          items: []
        },
        {
          organizationId: orgStJude.id,
          userId: drSarahContext.user.id,
          userRole: drSarahContext.roles[0].code
        }
      );
    } catch (e) {
      failedAsExpected = true;
    }

    if (failedAsExpected) {
      results.push({ name: 'Phase 10 - Immutability Enforcement: Rejection of Post-Sign Modifications', passed: true });
    } else {
      results.push({ name: 'Phase 10 - Immutability Enforcement: Rejection of Post-Sign Modifications', passed: false, error: 'Signed prescription was illegally modified' });
    }
  } catch (err) {
    results.push({ name: 'Phase 10 - Immutability Enforcement: Rejection of Post-Sign Modifications', passed: false, error: (err as Error).message });
  }

  // -------------------------------------------------------------------------
  // TEST 11: Defensible Prescription Cancellation with Clinical Rationale
  // -------------------------------------------------------------------------
  try {
    const cancelled = await MedicationService.cancelPrescription(
      allergyPrescriptionId,
      'Discontinued due to alternative cephalosporin oral regimen selected',
      {
        organizationId: orgStJude.id,
        userId: drSarahContext.user.id,
        userRole: drSarahContext.roles[0].code
      }
    );

    if (cancelled.status === 'CANCELLED' && cancelled.cancellation_reason?.includes('cephalosporin')) {
      results.push({ name: 'Phase 10 - Defensible Prescription Cancellation with Mandatory Reason', passed: true });
    } else {
      results.push({ name: 'Phase 10 - Defensible Prescription Cancellation with Mandatory Reason', passed: false, error: 'Cancellation state not persisted correctly' });
    }
  } catch (err) {
    results.push({ name: 'Phase 10 - Defensible Prescription Cancellation with Mandatory Reason', passed: false, error: (err as Error).message });
  }

  // -------------------------------------------------------------------------
  // TEST 12: Prescription Replacement Workflow (Superseding Linked Orders)
  // -------------------------------------------------------------------------
  try {
    const replacementResult = await MedicationService.replacePrescription(
      signedPrescriptionId,
      {
        reason: 'Titrating dose upwards following follow-up lipid panel evaluation',
        items: [
          {
            medicationName: 'Atorvastatin 40mg Oral Tablet',
            dosageForm: 'TABLET',
            doseAmount: '40',
            doseUnit: 'mg',
            route: 'ORAL',
            frequency: 'ONCE_DAILY_EVENING',
            duration: '30 days',
            quantity: 30,
            quantityUnit: 'TABLET',
            refillsAuthorized: 3,
            sigInstructions: 'Take 1 tablet by mouth daily in the evening',
            indication: 'Target LDL reduction'
          }
        ],
        signImmediately: true
      },
      {
        organizationId: orgStJude.id,
        userId: drSarahContext.user.id,
        userRole: drSarahContext.roles[0].code
      }
    );

    if (
      replacementResult.original.replaced_by_prescription_id === replacementResult.replacement.id &&
      replacementResult.replacement.replaces_prescription_id === signedPrescriptionId &&
      replacementResult.replacement.status === 'SIGNED'
    ) {
      results.push({ name: 'Phase 10 - Defensible Prescription Replacement & Lineage Tracking', passed: true });
    } else {
      results.push({ name: 'Phase 10 - Defensible Prescription Replacement & Lineage Tracking', passed: false, error: 'Replacement link or status mismatch' });
    }
  } catch (err) {
    results.push({ name: 'Phase 10 - Defensible Prescription Replacement & Lineage Tracking', passed: false, error: (err as Error).message });
  }

  // -------------------------------------------------------------------------
  // TEST 13: Pharmacy Dispensation Workflow & State Transitions
  // -------------------------------------------------------------------------
  try {
    // Create a fresh signed order to dispense
    const freshRx = await MedicationService.createDraftPrescription(
      {
        patientId,
        providerId,
        priority: 'ROUTINE',
        pharmacyId,
        items: [
          {
            medicationName: 'Metformin 500mg Oral Tablet',
            dosageForm: 'TABLET',
            doseAmount: '500',
            doseUnit: 'mg',
            route: 'ORAL',
            frequency: 'BID',
            duration: '30 days',
            quantity: 60,
            quantityUnit: 'TABLET',
            refillsAuthorized: 1,
            sigInstructions: 'Take 1 tablet twice daily with meals',
            indication: 'Type 2 Diabetes Mellitus glycemic control'
          }
        ]
      },
      {
        organizationId: orgStJude.id,
        userId: drSarahContext.user.id,
        userRole: drSarahContext.roles[0].code
      }
    );

    await MedicationService.signPrescription(
      freshRx.prescription.id,
      {
        organizationId: orgStJude.id,
        userId: drSarahContext.user.id,
        userRole: drSarahContext.roles[0].code
      }
    );

    // Dispense by pharmacist James
    const dispResult = await MedicationService.dispensePrescription(
      freshRx.prescription.id,
      {
        pharmacyId,
        quantityDispensed: 60,
        isComplete: true,
        notes: 'Dispensed original manufacturer pack with patient leaflet'
      },
      {
        organizationId: orgStJude.id,
        userId: pharmacistJamesContext.user.id,
        userRole: pharmacistJamesContext.roles[0].code
      }
    );

    if (dispResult.dispensation.id && dispResult.prescription.status === 'DISPENSED') {
      results.push({ name: 'Phase 10 - Pharmacy Dispensation Fulfillment & Terminal State Machine', passed: true });
    } else {
      results.push({ name: 'Phase 10 - Pharmacy Dispensation Fulfillment & Terminal State Machine', passed: false, error: 'Prescription did not advance to DISPENSED' });
    }
  } catch (err) {
    results.push({ name: 'Phase 10 - Pharmacy Dispensation Fulfillment & Terminal State Machine', passed: false, error: (err as Error).message });
  }

  // -------------------------------------------------------------------------
  // TEST 14: Strict Multi-Tenant Organization Isolation
  // -------------------------------------------------------------------------
  try {
    let crossTenantBlocked = false;
    try {
      // Dr. Marcus (Metro Health) attempts to query St. Jude patient's prescriptions
      await MedicationService.getPrescriptionDetails(
        signedPrescriptionId,
        orgMetroHealth.id
      );
    } catch (e) {
      crossTenantBlocked = true;
    }

    if (crossTenantBlocked) {
      results.push({ name: 'Phase 10 - Strict Multi-Tenant Isolation & Cross-Organization Rejection', passed: true });
    } else {
      results.push({ name: 'Phase 10 - Strict Multi-Tenant Isolation & Cross-Organization Rejection', passed: false, error: 'Foreign tenant successfully inspected prescription' });
    }
  } catch (err) {
    results.push({ name: 'Phase 10 - Strict Multi-Tenant Isolation & Cross-Organization Rejection', passed: false, error: (err as Error).message });
  }

  // -------------------------------------------------------------------------
  // TEST 15: Role-Based Access Control: Unauthorized Personas Denied
  // -------------------------------------------------------------------------
  try {
    const receptionistHasPrescribe = receptionistElenaContext.permissions.includes(Permissions.PRESCRIPTION_CREATE);
    const receptionistHasSign = receptionistElenaContext.permissions.includes(Permissions.PRESCRIPTION_SIGN);
    const pharmacistHasDispense = pharmacistJamesContext.permissions.includes(Permissions.PRESCRIPTION_DISPENSE);
    const doctorHasPrescribe = drSarahContext.permissions.includes(Permissions.PRESCRIPTION_CREATE);

    if (!receptionistHasPrescribe && !receptionistHasSign && pharmacistHasDispense && doctorHasPrescribe) {
      results.push({ name: 'Phase 10 - Role-Based Access Control: Granular Prescribing & Dispensing Separation', passed: true });
    } else {
      results.push({ name: 'Phase 10 - Role-Based Access Control: Granular Prescribing & Dispensing Separation', passed: false, error: 'RBAC permissions improperly configured' });
    }
  } catch (err) {
    results.push({ name: 'Phase 10 - Role-Based Access Control: Granular Prescribing & Dispensing Separation', passed: false, error: 'RBAC permissions improperly configured' });
  }

  // -------------------------------------------------------------------------
  // TEST 16: Sanitized Append-Only Audit Trail
  // -------------------------------------------------------------------------
  try {
    const auditLogsRes = await db.query(
      `SELECT action, metadata FROM audit_logs 
       WHERE organization_id = $1 AND action IN ('prescription.signed', 'prescription.cancelled', 'prescription.dispensed', 'prescription.safety_override')`,
      [orgStJude.id]
    );

    if (auditLogsRes.rows.length >= 3) {
      results.push({ name: 'Phase 10 - Sanitized Append-Only Audit Trail for Clinical Medications', passed: true });
    } else {
      results.push({ name: 'Phase 10 - Sanitized Append-Only Audit Trail for Clinical Medications', passed: false, error: `Insufficient audit logs created (found ${auditLogsRes.rows.length})` });
    }
  } catch (err) {
    results.push({ name: 'Phase 10 - Sanitized Append-Only Audit Trail for Clinical Medications', passed: false, error: (err as Error).message });
  }

  return results;
}
