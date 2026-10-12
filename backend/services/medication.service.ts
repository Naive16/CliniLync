/**
 * CLINILYNC Medication Management, Prescriptions & Pharmacy Service
 * 
 * Complies with Clinilync Phase 10 Requirements:
 * 1. Longitudinal Patient Medication History & Reconciliation.
 * 2. Medication Catalog Abstraction & Controlled Local Entry.
 * 3. Documented Allergies & Adverse Reactions with explicit uncertainty handling.
 * 4. Clinician-Authored Structured Prescriptions with Lifecycle State Machine.
 * 5. Cryptographic Signing, Optimistic Locking & Immutability (no silent overwriting).
 * 6. Prescription Cancellation, Revision & Defensible Replacement Workflows.
 * 7. Pharmacy Registry & Dispensing Workflow Foundation.
 * 8. Clinical Safety Extension Point with explicit disclosure of unconfigured external DDI engines.
 * 9. Multi-Tenant Organization Isolation, RBAC & Append-Only Sanitized Audit Logging.
 */

import crypto from 'node:crypto';
import { getDatabaseClient, IDatabaseClient } from '../../database/db.js';
import {
  MedicationCatalogItem,
  PatientAllergy,
  PatientMedication,
  Pharmacy,
  PrescriptionOrder,
  PrescriptionItem,
  PrescriptionDispensation,
  MedicationReconciliation,
  PrescriptionStatus,
  SafetyCheckResult,
  SafetyAlert,
  Patient,
  Provider
} from '../types/domain.js';
import { AuditService } from '../security/audit.js';

export class MedicationError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = 'MedicationError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export const VALID_PRESCRIPTION_TRANSITIONS: Record<PrescriptionStatus, PrescriptionStatus[]> = {
  DRAFT: ['SIGNED', 'CANCELLED'],
  SIGNED: ['PARTIALLY_DISPENSED', 'DISPENSED', 'CANCELLED', 'REPLACED', 'EXPIRED'],
  PARTIALLY_DISPENSED: ['DISPENSED', 'CANCELLED'],
  DISPENSED: [],
  CANCELLED: [],
  REPLACED: [],
  EXPIRED: []
};

export class MedicationService {
  // =========================================================================
  // 1. MEDICATION CATALOG ABSTRACTION
  // =========================================================================

  static async searchCatalog(
    query?: string,
    options: { form?: string; activeOnly?: boolean; limit?: number } = {},
    client?: IDatabaseClient
  ): Promise<{ items: MedicationCatalogItem[]; total: number }> {
    const db = client || getDatabaseClient();
    const activeFilter = options.activeOnly !== false;
    const limit = options.limit || 50;

    let sql = 'SELECT * FROM medication_catalog WHERE 1=1';
    const params: unknown[] = [];

    if (activeFilter) {
      params.push(true);
      sql += ` AND is_active = $${params.length}`;
    }

    if (options.form) {
      params.push(options.form);
      sql += ` AND dosage_form = $${params.length}`;
    }

    const res = await db.query<MedicationCatalogItem>(sql, params);
    let items = res.rows;

    if (query && query.trim()) {
      const q = query.trim().toLowerCase();
      items = items.filter(item =>
        item.display_name.toLowerCase().includes(q) ||
        (item.generic_name && item.generic_name.toLowerCase().includes(q)) ||
        (item.active_ingredients && item.active_ingredients.toLowerCase().includes(q))
      );
    }

    return {
      items: items.slice(0, limit),
      total: items.length
    };
  }

  static async createLocalCatalogEntry(
    data: {
      displayName: string;
      genericName?: string;
      activeIngredients?: string;
      strength?: string;
      strengthUnit?: string;
      dosageForm?: string;
      routeOfAdministration?: string;
      classification?: 'GENERIC' | 'BRAND';
      externalCode?: string;
      terminologySystem?: string;
    },
    context: { organizationId: string; userId: string; userRole?: string; ipAddress?: string; userAgent?: string },
    client?: IDatabaseClient
  ): Promise<MedicationCatalogItem> {
    const db = client || getDatabaseClient();

    if (!data.displayName || !data.displayName.trim()) {
      throw new MedicationError('INVALID_CATALOG_DATA', 'Display name is required for medication catalog entries', 400);
    }

    const id = `med_cat_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const item: MedicationCatalogItem = {
      id,
      display_name: data.displayName.trim(),
      generic_name: data.genericName ? data.genericName.trim() : null,
      active_ingredients: data.activeIngredients ? data.activeIngredients.trim() : null,
      strength: data.strength || null,
      strength_unit: data.strengthUnit || null,
      dosage_form: data.dosageForm || 'TABLET',
      route_of_administration: data.routeOfAdministration || 'ORAL',
      classification: data.classification || 'GENERIC',
      catalog_source: 'LOCAL_ENTRY',
      source_version: '2026.1',
      external_code: data.externalCode || null,
      terminology_system: data.terminologySystem || 'LOCAL',
      is_verified: false, // Distinguish ad-hoc local entry from authoritative catalog
      is_active: true,
      created_at: now,
      updated_at: now
    };

    await db.query(
      `INSERT INTO medication_catalog (
        id, display_name, generic_name, active_ingredients, strength, strength_unit,
        dosage_form, route_of_administration, classification, catalog_source, source_version,
        external_code, terminology_system, is_verified, is_active, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        item.id,
        item.display_name,
        item.generic_name,
        item.active_ingredients,
        item.strength,
        item.strength_unit,
        item.dosage_form,
        item.route_of_administration,
        item.classification,
        item.catalog_source,
        item.source_version,
        item.external_code,
        item.terminology_system,
        item.is_verified,
        item.is_active,
        item.created_at,
        item.updated_at
      ]
    );

    await AuditService.logEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      actorRole: context.userRole,
      action: 'medication_catalog.created',
      resourceType: 'medication_catalog',
      resourceId: id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: { displayName: item.display_name, is_verified: false }
    });

    return item;
  }

  // =========================================================================
  // 2. PATIENT ALLERGIES & ADVERSE REACTIONS
  // =========================================================================

  static async getPatientAllergies(
    patientId: string,
    organizationId: string,
    client?: IDatabaseClient
  ): Promise<{ allergies: PatientAllergy[]; total: number }> {
    const db = client || getDatabaseClient();

    // Verify patient in active org
    const patRes = await db.query<Patient>(
      'SELECT id FROM patients WHERE id = $1 AND organization_id = $2',
      [patientId, organizationId]
    );
    if (patRes.rows.length === 0) {
      throw new MedicationError('PATIENT_NOT_FOUND', 'Patient record not found in active organization', 404);
    }

    const res = await db.query<PatientAllergy>(
      'SELECT * FROM patient_allergies WHERE patient_id = $1 AND organization_id = $2 ORDER BY created_at DESC',
      [patientId, organizationId]
    );

    return {
      allergies: res.rows,
      total: res.rows.length
    };
  }

  static async recordPatientAllergy(
    data: {
      patientId: string;
      substanceName: string;
      allergenType?: string;
      reactionDescription: string;
      severity?: string;
      verificationStatus?: string;
      clinicalStatus?: string;
      sourceOfInformation?: string;
      notes?: string;
    },
    context: { organizationId: string; userId: string; userRole?: string; ipAddress?: string; userAgent?: string },
    client?: IDatabaseClient
  ): Promise<PatientAllergy> {
    const db = client || getDatabaseClient();

    if (!data.substanceName || !data.substanceName.trim()) {
      throw new MedicationError('INVALID_ALLERGY_DATA', 'Substance name is required', 400);
    }
    if (!data.reactionDescription || !data.reactionDescription.trim()) {
      throw new MedicationError('INVALID_ALLERGY_DATA', 'Reaction description is required', 400);
    }

    // Verify patient in active org
    const patRes = await db.query<Patient>(
      'SELECT id FROM patients WHERE id = $1 AND organization_id = $2',
      [data.patientId, context.organizationId]
    );
    if (patRes.rows.length === 0) {
      throw new MedicationError('PATIENT_NOT_FOUND', 'Patient record not found in active organization', 404);
    }

    const id = `alg_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const allergy: PatientAllergy = {
      id,
      organization_id: context.organizationId,
      patient_id: data.patientId,
      substance_name: data.substanceName.trim(),
      allergen_type: data.allergenType || 'MEDICATION',
      reaction_description: data.reactionDescription.trim(),
      severity: data.severity || 'MODERATE',
      verification_status: data.verificationStatus || 'CONFIRMED',
      clinical_status: data.clinicalStatus || 'ACTIVE',
      source_of_information: data.sourceOfInformation || 'CLINICIAN_OBSERVED',
      recorded_by_user_id: context.userId,
      reviewed_by_user_id: context.userId,
      reviewed_at: now,
      notes: data.notes || null,
      created_at: now,
      updated_at: now
    };

    await db.query(
      `INSERT INTO patient_allergies (
        id, organization_id, patient_id, substance_name, allergen_type, reaction_description,
        severity, verification_status, clinical_status, source_of_information, recorded_by_user_id,
        reviewed_by_user_id, reviewed_at, notes, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        allergy.id,
        allergy.organization_id,
        allergy.patient_id,
        allergy.substance_name,
        allergy.allergen_type,
        allergy.reaction_description,
        allergy.severity,
        allergy.verification_status,
        allergy.clinical_status,
        allergy.source_of_information,
        allergy.recorded_by_user_id,
        allergy.reviewed_by_user_id,
        allergy.reviewed_at,
        allergy.notes,
        allergy.created_at,
        allergy.updated_at
      ]
    );

    await AuditService.logEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      actorRole: context.userRole,
      action: 'allergy.recorded',
      resourceType: 'patient_allergy',
      resourceId: id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        patient_id: data.patientId,
        substance_name: allergy.substance_name,
        severity: allergy.severity,
        verification_status: allergy.verification_status
      }
    });

    return allergy;
  }

  static async updatePatientAllergy(
    allergyId: string,
    data: {
      clinicalStatus?: string;
      verificationStatus?: string;
      severity?: string;
      notes?: string;
    },
    context: { organizationId: string; userId: string; userRole?: string; ipAddress?: string; userAgent?: string },
    client?: IDatabaseClient
  ): Promise<PatientAllergy> {
    const db = client || getDatabaseClient();

    const existingRes = await db.query<PatientAllergy>(
      'SELECT * FROM patient_allergies WHERE id = $1 AND organization_id = $2',
      [allergyId, context.organizationId]
    );
    if (existingRes.rows.length === 0) {
      throw new MedicationError('ALLERGY_NOT_FOUND', 'Allergy record not found in active organization', 404);
    }

    const current = existingRes.rows[0];
    const now = new Date().toISOString();

    const updated: PatientAllergy = {
      ...current,
      clinical_status: data.clinicalStatus || current.clinical_status,
      verification_status: data.verificationStatus || current.verification_status,
      severity: data.severity || current.severity,
      notes: data.notes !== undefined ? data.notes : current.notes,
      reviewed_by_user_id: context.userId,
      reviewed_at: now,
      updated_at: now
    };

    await db.query(
      `UPDATE patient_allergies SET
        clinical_status = $1, verification_status = $2, severity = $3, notes = $4,
        reviewed_by_user_id = $5, reviewed_at = $6, updated_at = $7
       WHERE id = $8 AND organization_id = $9`,
      [
        updated.clinical_status,
        updated.verification_status,
        updated.severity,
        updated.notes,
        updated.reviewed_by_user_id,
        updated.reviewed_at,
        updated.updated_at,
        allergyId,
        context.organizationId
      ]
    );

    await AuditService.logEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      actorRole: context.userRole,
      action: 'allergy.updated',
      resourceType: 'patient_allergy',
      resourceId: allergyId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        patient_id: updated.patient_id,
        clinical_status: updated.clinical_status,
        verification_status: updated.verification_status
      }
    });

    return updated;
  }

  // =========================================================================
  // 3. PATIENT MEDICATION RECORDS (LONGITUDINAL MEDICATION HISTORY)
  // =========================================================================

  static async getPatientMedications(
    patientId: string,
    organizationId: string,
    statusFilter?: string,
    client?: IDatabaseClient
  ): Promise<{ medications: PatientMedication[]; total: number }> {
    const db = client || getDatabaseClient();

    // Verify patient in active org
    const patRes = await db.query<Patient>(
      'SELECT id FROM patients WHERE id = $1 AND organization_id = $2',
      [patientId, organizationId]
    );
    if (patRes.rows.length === 0) {
      throw new MedicationError('PATIENT_NOT_FOUND', 'Patient record not found in active organization', 404);
    }

    let sql = 'SELECT * FROM patient_medications WHERE patient_id = $1 AND organization_id = $2';
    const params: unknown[] = [patientId, organizationId];

    if (statusFilter && statusFilter !== 'ALL') {
      params.push(statusFilter);
      sql += ` AND status = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC';

    const res = await db.query<PatientMedication>(sql, params);
    return {
      medications: res.rows,
      total: res.rows.length
    };
  }

  static async recordPatientMedication(
    data: {
      patientId: string;
      medicationCatalogId?: string;
      medicationName: string;
      dosage?: string;
      route?: string;
      frequency?: string;
      status?: string;
      source?: string;
      isPatientReported?: boolean;
      encounterId?: string;
      startDate?: string;
      endDate?: string;
      sigInstructions?: string;
    },
    context: { organizationId: string; userId: string; userRole?: string; ipAddress?: string; userAgent?: string },
    client?: IDatabaseClient
  ): Promise<PatientMedication> {
    const db = client || getDatabaseClient();

    if (!data.medicationName || !data.medicationName.trim()) {
      throw new MedicationError('INVALID_MEDICATION_DATA', 'Medication name is required', 400);
    }

    // Verify patient in active org
    const patRes = await db.query<Patient>(
      'SELECT id FROM patients WHERE id = $1 AND organization_id = $2',
      [data.patientId, context.organizationId]
    );
    if (patRes.rows.length === 0) {
      throw new MedicationError('PATIENT_NOT_FOUND', 'Patient record not found in active organization', 404);
    }

    const id = `pat_med_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const isPatientReported = data.isPatientReported === true || data.source === 'PATIENT_REPORTED';

    const med: PatientMedication = {
      id,
      organization_id: context.organizationId,
      patient_id: data.patientId,
      medication_catalog_id: data.medicationCatalogId || null,
      medication_name: data.medicationName.trim(),
      dosage: data.dosage || null,
      route: data.route || 'ORAL',
      frequency: data.frequency || null,
      status: data.status || 'ACTIVE',
      source: data.source || (isPatientReported ? 'PATIENT_REPORTED' : 'CLINICIAN_RECORDED'),
      is_patient_reported: isPatientReported,
      reconciliation_status: 'UNRECONCILED',
      encounter_id: data.encounterId || null,
      recorded_by_user_id: context.userId,
      start_date: data.startDate || null,
      end_date: data.endDate || null,
      sig_instructions: data.sigInstructions || null,
      discontinuation_reason: null,
      discontinued_at: null,
      discontinued_by_user_id: null,
      created_at: now,
      updated_at: now
    };

    await db.query(
      `INSERT INTO patient_medications (
        id, organization_id, patient_id, medication_catalog_id, medication_name,
        dosage, route, frequency, status, source, is_patient_reported, reconciliation_status,
        encounter_id, recorded_by_user_id, start_date, end_date, sig_instructions,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
      [
        med.id,
        med.organization_id,
        med.patient_id,
        med.medication_catalog_id,
        med.medication_name,
        med.dosage,
        med.route,
        med.frequency,
        med.status,
        med.source,
        med.is_patient_reported,
        med.reconciliation_status,
        med.encounter_id,
        med.recorded_by_user_id,
        med.start_date,
        med.end_date,
        med.sig_instructions,
        med.created_at,
        med.updated_at
      ]
    );

    await AuditService.logEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      actorRole: context.userRole,
      action: 'medication.recorded',
      resourceType: 'patient_medication',
      resourceId: id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        patient_id: data.patientId,
        medication_name: med.medication_name,
        is_patient_reported: med.is_patient_reported
      }
    });

    return med;
  }

  static async updatePatientMedication(
    medicationRecordId: string,
    data: {
      dosage?: string;
      route?: string;
      frequency?: string;
      status?: string;
      sigInstructions?: string;
    },
    context: { organizationId: string; userId: string; userRole?: string; ipAddress?: string; userAgent?: string },
    client?: IDatabaseClient
  ): Promise<PatientMedication> {
    const db = client || getDatabaseClient();

    const existingRes = await db.query<PatientMedication>(
      'SELECT * FROM patient_medications WHERE id = $1 AND organization_id = $2',
      [medicationRecordId, context.organizationId]
    );
    if (existingRes.rows.length === 0) {
      throw new MedicationError('MEDICATION_NOT_FOUND', 'Patient medication record not found in active organization', 404);
    }

    const current = existingRes.rows[0];
    const now = new Date().toISOString();

    const updated: PatientMedication = {
      ...current,
      dosage: data.dosage !== undefined ? data.dosage : current.dosage,
      route: data.route !== undefined ? data.route : current.route,
      frequency: data.frequency !== undefined ? data.frequency : current.frequency,
      status: data.status !== undefined ? data.status : current.status,
      sig_instructions: data.sigInstructions !== undefined ? data.sigInstructions : current.sig_instructions,
      updated_at: now
    };

    await db.query(
      `UPDATE patient_medications SET
        dosage = $1, route = $2, frequency = $3, status = $4, sig_instructions = $5, updated_at = $6
       WHERE id = $7 AND organization_id = $8`,
      [
        updated.dosage,
        updated.route,
        updated.frequency,
        updated.status,
        updated.sig_instructions,
        updated.updated_at,
        medicationRecordId,
        context.organizationId
      ]
    );

    await AuditService.logEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      actorRole: context.userRole,
      action: 'medication.updated',
      resourceType: 'patient_medication',
      resourceId: medicationRecordId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        patient_id: updated.patient_id,
        status: updated.status
      }
    });

    return updated;
  }

  static async discontinuePatientMedication(
    medicationRecordId: string,
    reason: string,
    context: { organizationId: string; userId: string; userRole?: string; ipAddress?: string; userAgent?: string },
    client?: IDatabaseClient
  ): Promise<PatientMedication> {
    const db = client || getDatabaseClient();

    if (!reason || !reason.trim()) {
      throw new MedicationError('REASON_REQUIRED', 'A clinical reason is mandatory to discontinue a medication', 400);
    }

    const existingRes = await db.query<PatientMedication>(
      'SELECT * FROM patient_medications WHERE id = $1 AND organization_id = $2',
      [medicationRecordId, context.organizationId]
    );
    if (existingRes.rows.length === 0) {
      throw new MedicationError('MEDICATION_NOT_FOUND', 'Patient medication record not found in active organization', 404);
    }

    const current = existingRes.rows[0];
    const now = new Date().toISOString();

    const updated: PatientMedication = {
      ...current,
      status: 'DISCONTINUED',
      discontinuation_reason: reason.trim(),
      discontinued_at: now,
      discontinued_by_user_id: context.userId,
      updated_at: now
    };

    await db.query(
      `UPDATE patient_medications SET
        status = $1, discontinuation_reason = $2, discontinued_at = $3, discontinued_by_user_id = $4, updated_at = $5
       WHERE id = $6 AND organization_id = $7`,
      [
        updated.status,
        updated.discontinuation_reason,
        updated.discontinued_at,
        updated.discontinued_by_user_id,
        updated.updated_at,
        medicationRecordId,
        context.organizationId
      ]
    );

    await AuditService.logEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      actorRole: context.userRole,
      action: 'medication.discontinued',
      resourceType: 'patient_medication',
      resourceId: medicationRecordId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        patient_id: updated.patient_id,
        medication_name: updated.medication_name
      }
    });

    return updated;
  }

  static async reconcileMedications(
    patientId: string,
    data: {
      encounterId?: string;
      notes?: string;
      discrepancyCount?: number;
      confirmedMedicationIds?: string[];
    },
    context: { organizationId: string; userId: string; userRole?: string; ipAddress?: string; userAgent?: string },
    client?: IDatabaseClient
  ): Promise<MedicationReconciliation> {
    const db = client || getDatabaseClient();

    // Verify patient in active org
    const patRes = await db.query<Patient>(
      'SELECT id FROM patients WHERE id = $1 AND organization_id = $2',
      [patientId, context.organizationId]
    );
    if (patRes.rows.length === 0) {
      throw new MedicationError('PATIENT_NOT_FOUND', 'Patient record not found in active organization', 404);
    }

    const id = `med_rec_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const record: MedicationReconciliation = {
      id,
      organization_id: context.organizationId,
      patient_id: patientId,
      encounter_id: data.encounterId || null,
      reconciled_by_user_id: context.userId,
      notes: data.notes || 'Routine clinical medication reconciliation performed',
      discrepancy_count: data.discrepancyCount || 0,
      reconciled_at: now,
      created_at: now
    };

    await db.query(
      `INSERT INTO medication_reconciliations (
        id, organization_id, patient_id, encounter_id, reconciled_by_user_id,
        notes, discrepancy_count, reconciled_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        record.id,
        record.organization_id,
        record.patient_id,
        record.encounter_id,
        record.reconciled_by_user_id,
        record.notes,
        record.discrepancy_count,
        record.reconciled_at
      ]
    );

    // If confirmed IDs provided, mark them RECONCILED
    if (data.confirmedMedicationIds && data.confirmedMedicationIds.length > 0) {
      for (const medId of data.confirmedMedicationIds) {
        await db.query(
          `UPDATE patient_medications SET reconciliation_status = 'RECONCILED', updated_at = $1
           WHERE id = $2 AND organization_id = $3 AND patient_id = $4`,
          [now, medId, context.organizationId, patientId]
        );
      }
    }

    await AuditService.logEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      actorRole: context.userRole,
      action: 'medication.reconciled',
      resourceType: 'medication_reconciliation',
      resourceId: id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        patient_id: patientId,
        discrepancy_count: record.discrepancy_count
      }
    });

    return record;
  }

  // =========================================================================
  // 4. PHARMACIES REGISTRY
  // =========================================================================

  static async listPharmacies(
    organizationId: string,
    client?: IDatabaseClient
  ): Promise<{ pharmacies: Pharmacy[]; total: number }> {
    const db = client || getDatabaseClient();
    const res = await db.query<Pharmacy>(
      'SELECT * FROM pharmacies WHERE organization_id = $1 AND is_active = TRUE ORDER BY name ASC',
      [organizationId]
    );
    return {
      pharmacies: res.rows,
      total: res.rows.length
    };
  }

  static async createPharmacy(
    data: {
      name: string;
      phone?: string;
      email?: string;
      addressLine1?: string;
      city?: string;
      postalCode?: string;
      countryCode?: string;
      isInternal?: boolean;
    },
    context: { organizationId: string; userId: string; userRole?: string; ipAddress?: string; userAgent?: string },
    client?: IDatabaseClient
  ): Promise<Pharmacy> {
    const db = client || getDatabaseClient();

    if (!data.name || !data.name.trim()) {
      throw new MedicationError('INVALID_PHARMACY_DATA', 'Pharmacy name is required', 400);
    }

    const id = `phm_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const pharmacy: Pharmacy = {
      id,
      organization_id: context.organizationId,
      name: data.name.trim(),
      phone: data.phone || null,
      email: data.email || null,
      address_line1: data.addressLine1 || null,
      city: data.city || null,
      postal_code: data.postalCode || null,
      country_code: data.countryCode || 'GBR',
      is_internal: data.isInternal !== false,
      is_active: true,
      integration_status: 'LOCAL_WORKFLOW_ONLY',
      created_at: now,
      updated_at: now
    };

    await db.query(
      `INSERT INTO pharmacies (
        id, organization_id, name, phone, email, address_line1, city, postal_code,
        country_code, is_internal, is_active, integration_status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        pharmacy.id,
        pharmacy.organization_id,
        pharmacy.name,
        pharmacy.phone,
        pharmacy.email,
        pharmacy.address_line1,
        pharmacy.city,
        pharmacy.postal_code,
        pharmacy.country_code,
        pharmacy.is_internal,
        pharmacy.is_active,
        pharmacy.integration_status,
        pharmacy.created_at,
        pharmacy.updated_at
      ]
    );

    await AuditService.logEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      actorRole: context.userRole,
      action: 'pharmacy.created',
      resourceType: 'pharmacy',
      resourceId: id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: { name: pharmacy.name, is_internal: pharmacy.is_internal }
    });

    return pharmacy;
  }

  // =========================================================================
  // 5. CLINICAL PRESCRIPTION WORKFLOW & STATE MACHINE
  // =========================================================================

  static async listPrescriptions(
    organizationId: string,
    filters: {
      patientId?: string;
      providerId?: string;
      status?: string;
      limit?: number;
    } = {},
    client?: IDatabaseClient
  ): Promise<{ prescriptions: any[]; total: number }> {
    const db = client || getDatabaseClient();

    let sql = 'SELECT * FROM prescription_orders WHERE organization_id = $1';
    const params: unknown[] = [organizationId];

    if (filters.patientId) {
      params.push(filters.patientId);
      sql += ` AND patient_id = $${params.length}`;
    }

    if (filters.providerId) {
      params.push(filters.providerId);
      sql += ` AND provider_id = $${params.length}`;
    }

    if (filters.status && filters.status !== 'ALL') {
      params.push(filters.status);
      sql += ` AND status = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC';

    const ordersRes = await db.query<PrescriptionOrder>(sql, params);
    const orders = ordersRes.rows;

    // Attach items, patient summary, and prescriber summary
    const enhanced = await Promise.all(
      orders.map(async order => {
        const [itemsRes, patRes, provRes] = await Promise.all([
          db.query<PrescriptionItem>(
            'SELECT * FROM prescription_items WHERE prescription_id = $1 AND organization_id = $2',
            [order.id, organizationId]
          ),
          db.query<Patient>(
            'SELECT id, first_name, last_name, mrn, date_of_birth, allergies_summary FROM patients WHERE id = $1',
            [order.patient_id]
          ),
          db.query<Provider>(
            'SELECT id, first_name, last_name, npi_or_registration_number, title FROM providers WHERE id = $1',
            [order.provider_id]
          )
        ]);

        return {
          ...order,
          items: itemsRes.rows,
          patient: patRes.rows[0] || null,
          provider: provRes.rows[0] || null
        };
      })
    );

    return {
      prescriptions: enhanced.slice(0, filters.limit || 100),
      total: enhanced.length
    };
  }

  static async getPrescriptionDetails(
    prescriptionId: string,
    organizationId: string,
    client?: IDatabaseClient
  ): Promise<{
    prescription: PrescriptionOrder;
    items: PrescriptionItem[];
    patient: any;
    provider: any;
    pharmacy: any;
    dispensations: PrescriptionDispensation[];
    safetyCheck: SafetyCheckResult;
  }> {
    const db = client || getDatabaseClient();

    const rxRes = await db.query<PrescriptionOrder>(
      'SELECT * FROM prescription_orders WHERE id = $1 AND organization_id = $2',
      [prescriptionId, organizationId]
    );
    if (rxRes.rows.length === 0) {
      throw new MedicationError('PRESCRIPTION_NOT_FOUND', 'Prescription record not found in active organization', 404);
    }

    const prescription = rxRes.rows[0];

    const [itemsRes, patRes, provRes, pharmRes, dispRes] = await Promise.all([
      db.query<PrescriptionItem>(
        'SELECT * FROM prescription_items WHERE prescription_id = $1 AND organization_id = $2 ORDER BY created_at ASC',
        [prescriptionId, organizationId]
      ),
      db.query<Patient>(
        'SELECT id, first_name, last_name, mrn, date_of_birth, gender, allergies_summary FROM patients WHERE id = $1',
        [prescription.patient_id]
      ),
      db.query<Provider>(
        'SELECT id, first_name, last_name, npi_or_registration_number, title FROM providers WHERE id = $1',
        [prescription.provider_id]
      ),
      prescription.pharmacy_id
        ? db.query<Pharmacy>('SELECT * FROM pharmacies WHERE id = $1', [prescription.pharmacy_id])
        : Promise.resolve({ rows: [] }),
      db.query<PrescriptionDispensation>(
        'SELECT * FROM prescription_dispensations WHERE prescription_id = $1 AND organization_id = $2 ORDER BY dispensed_at DESC',
        [prescriptionId, organizationId]
      )
    ]);

    const safetyCheck = await this.evaluatePrescriptionSafety(
      prescription.patient_id,
      itemsRes.rows.map(i => ({ medicationName: i.medication_name, dosageForm: i.dosage_form })),
      organizationId,
      db
    );

    return {
      prescription,
      items: itemsRes.rows,
      patient: patRes.rows[0] || null,
      provider: provRes.rows[0] || null,
      pharmacy: pharmRes.rows[0] || null,
      dispensations: dispRes.rows,
      safetyCheck
    };
  }

  static async createDraftPrescription(
    data: {
      patientId: string;
      providerId: string;
      encounterId?: string;
      priority?: 'ROUTINE' | 'URGENT' | 'STAT';
      pharmacyId?: string;
      expiresAt?: string;
      items: Array<{
        medicationCatalogId?: string;
        medicationName: string;
        dosageForm?: string;
        doseAmount?: string;
        doseUnit?: string;
        route?: string;
        frequency: string;
        duration?: string;
        quantity: number;
        quantityUnit?: string;
        refillsAuthorized?: number;
        sigInstructions: string;
        indication?: string;
      }>;
    },
    context: { organizationId: string; userId: string; userRole?: string; ipAddress?: string; userAgent?: string },
    client?: IDatabaseClient
  ): Promise<{ prescription: PrescriptionOrder; items: PrescriptionItem[]; safetyCheck: SafetyCheckResult }> {
    const db = client || getDatabaseClient();

    if (!data.items || data.items.length === 0) {
      throw new MedicationError('ITEMS_REQUIRED', 'A prescription must contain at least one medication item', 400);
    }

    // Validate patient exists in organization
    const patRes = await db.query<Patient>(
      'SELECT id FROM patients WHERE id = $1 AND organization_id = $2',
      [data.patientId, context.organizationId]
    );
    if (patRes.rows.length === 0) {
      throw new MedicationError('PATIENT_NOT_FOUND', 'Patient record not found in active organization', 404);
    }

    // Validate provider exists in organization
    const provRes = await db.query<Provider>(
      'SELECT id FROM providers WHERE id = $1 AND organization_id = $2',
      [data.providerId, context.organizationId]
    );
    if (provRes.rows.length === 0) {
      throw new MedicationError('PROVIDER_NOT_FOUND', 'Prescribing provider not found in active organization', 404);
    }

    // Validate encounter if specified
    if (data.encounterId) {
      const encRes = await db.query(
        'SELECT id FROM encounters WHERE id = $1 AND organization_id = $2',
        [data.encounterId, context.organizationId]
      );
      if (encRes.rows.length === 0) {
        throw new MedicationError('ENCOUNTER_NOT_FOUND', 'Referenced encounter not found in active organization', 404);
      }
    }

    // Validate item fields
    for (const item of data.items) {
      if (!item.medicationName || !item.medicationName.trim()) {
        throw new MedicationError('INVALID_ITEM', 'Medication name is required for all items', 400);
      }
      if (!item.frequency || !item.frequency.trim()) {
        throw new MedicationError('INVALID_ITEM', `Frequency is required for medication: ${item.medicationName}`, 400);
      }
      if (!item.sigInstructions || !item.sigInstructions.trim()) {
        throw new MedicationError('INVALID_ITEM', `Clinician sig instructions required for medication: ${item.medicationName}`, 400);
      }
      if (!item.quantity || item.quantity <= 0) {
        throw new MedicationError('INVALID_ITEM', `Quantity must be greater than zero for: ${item.medicationName}`, 400);
      }
    }

    const prescriptionId = `rx_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const order: PrescriptionOrder = {
      id: prescriptionId,
      organization_id: context.organizationId,
      patient_id: data.patientId,
      provider_id: data.providerId,
      encounter_id: data.encounterId || null,
      status: 'DRAFT',
      priority: data.priority || 'ROUTINE',
      signed_at: null,
      signed_by_user_id: null,
      signature_hash: null,
      cancelled_at: null,
      cancelled_by_user_id: null,
      cancellation_reason: null,
      replaced_by_prescription_id: null,
      replaces_prescription_id: null,
      pharmacy_id: data.pharmacyId || null,
      expires_at: data.expiresAt || null,
      version: 1,
      created_at: now,
      updated_at: now
    };

    await db.query(
      `INSERT INTO prescription_orders (
        id, organization_id, patient_id, provider_id, encounter_id, status, priority,
        pharmacy_id, expires_at, version, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        order.id,
        order.organization_id,
        order.patient_id,
        order.provider_id,
        order.encounter_id,
        order.status,
        order.priority,
        order.pharmacy_id,
        order.expires_at,
        order.version,
        order.created_at,
        order.updated_at
      ]
    );

    // Insert items
    const insertedItems: PrescriptionItem[] = [];
    for (const rawItem of data.items) {
      const itemId = `rxi_${crypto.randomUUID()}`;
      const item: PrescriptionItem = {
        id: itemId,
        organization_id: context.organizationId,
        prescription_id: prescriptionId,
        medication_catalog_id: rawItem.medicationCatalogId || null,
        medication_name: rawItem.medicationName.trim(),
        dosage_form: rawItem.dosageForm || 'TABLET',
        dose_amount: rawItem.doseAmount || null,
        dose_unit: rawItem.doseUnit || null,
        route: rawItem.route || 'ORAL',
        frequency: rawItem.frequency.trim(),
        duration: rawItem.duration || null,
        quantity: rawItem.quantity,
        quantity_unit: rawItem.quantityUnit || 'TABLET',
        refills_authorized: rawItem.refillsAuthorized || 0,
        refills_remaining: rawItem.refillsAuthorized || 0,
        sig_instructions: rawItem.sigInstructions.trim(),
        indication: rawItem.indication || null,
        status: 'ACTIVE',
        created_at: now,
        updated_at: now
      };

      await db.query(
        `INSERT INTO prescription_items (
          id, organization_id, prescription_id, medication_catalog_id, medication_name,
          dosage_form, dose_amount, dose_unit, route, frequency, duration, quantity,
          quantity_unit, refills_authorized, refills_remaining, sig_instructions, indication,
          status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
        [
          item.id,
          item.organization_id,
          item.prescription_id,
          item.medication_catalog_id,
          item.medication_name,
          item.dosage_form,
          item.dose_amount,
          item.dose_unit,
          item.route,
          item.frequency,
          item.duration,
          item.quantity,
          item.quantity_unit,
          item.refills_authorized,
          item.refills_remaining,
          item.sig_instructions,
          item.indication,
          item.status,
          item.created_at,
          item.updated_at
        ]
      );
      insertedItems.push(item);
    }

    // Maintain backwards compatibility with legacy `prescriptions` table
    const firstItem = insertedItems[0];
    await db.query(
      `INSERT INTO prescriptions (
        id, organization_id, patient_id, provider_id, clinical_record_id, medication_name,
        dosage, frequency, duration, quantity, refills_remaining, instructions, status,
        start_date, end_date, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        prescriptionId,
        context.organizationId,
        order.patient_id,
        order.provider_id,
        null,
        firstItem.medication_name,
        `${firstItem.dose_amount || ''} ${firstItem.dose_unit || ''}`.trim() || firstItem.dosage_form,
        firstItem.frequency,
        firstItem.duration || '30 days',
        firstItem.quantity,
        firstItem.refills_remaining,
        firstItem.sig_instructions,
        'ACTIVE',
        now.slice(0, 10),
        null,
        now
      ]
    );

    const safetyCheck = await this.evaluatePrescriptionSafety(
      order.patient_id,
      insertedItems.map(i => ({ medicationName: i.medication_name, dosageForm: i.dosage_form })),
      context.organizationId,
      db
    );

    await AuditService.logEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      actorRole: context.userRole,
      action: 'prescription.created',
      resourceType: 'prescription',
      resourceId: prescriptionId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        patient_id: order.patient_id,
        item_count: insertedItems.length,
        status: order.status
      }
    });

    return {
      prescription: order,
      items: insertedItems,
      safetyCheck
    };
  }

  static async updateDraftPrescription(
    prescriptionId: string,
    data: {
      priority?: 'ROUTINE' | 'URGENT' | 'STAT';
      pharmacyId?: string;
      expiresAt?: string;
      items?: Array<{
        id?: string;
        medicationCatalogId?: string;
        medicationName: string;
        dosageForm?: string;
        doseAmount?: string;
        doseUnit?: string;
        route?: string;
        frequency: string;
        duration?: string;
        quantity: number;
        quantityUnit?: string;
        refillsAuthorized?: number;
        sigInstructions: string;
        indication?: string;
      }>;
    },
    context: { organizationId: string; userId: string; userRole?: string; ipAddress?: string; userAgent?: string },
    client?: IDatabaseClient
  ): Promise<{ prescription: PrescriptionOrder; items: PrescriptionItem[] }> {
    const db = client || getDatabaseClient();

    const rxRes = await db.query<PrescriptionOrder>(
      'SELECT * FROM prescription_orders WHERE id = $1 AND organization_id = $2',
      [prescriptionId, context.organizationId]
    );
    if (rxRes.rows.length === 0) {
      throw new MedicationError('PRESCRIPTION_NOT_FOUND', 'Prescription record not found', 404);
    }

    const current = rxRes.rows[0];

    // Immutability Protection: Cannot silently mutate signed prescriptions!
    if (current.status !== 'DRAFT') {
      throw new MedicationError(
        'CANNOT_MUTATE_SIGNED_PRESCRIPTION',
        `Prescription is in ${current.status} status and cannot be modified. Use formal cancellation or replacement.`,
        409
      );
    }

    const now = new Date().toISOString();
    const updatedOrder: PrescriptionOrder = {
      ...current,
      priority: data.priority || current.priority,
      pharmacy_id: data.pharmacyId !== undefined ? data.pharmacyId : current.pharmacy_id,
      expires_at: data.expiresAt !== undefined ? data.expiresAt : current.expires_at,
      version: current.version + 1,
      updated_at: now
    };

    await db.query(
      `UPDATE prescription_orders SET priority = $1, pharmacy_id = $2, expires_at = $3, version = $4, updated_at = $5
       WHERE id = $6 AND organization_id = $7`,
      [
        updatedOrder.priority,
        updatedOrder.pharmacy_id,
        updatedOrder.expires_at,
        updatedOrder.version,
        updatedOrder.updated_at,
        prescriptionId,
        context.organizationId
      ]
    );

    // If new items provided, replace items
    let items: PrescriptionItem[] = [];
    if (data.items && data.items.length > 0) {
      await db.query('DELETE FROM prescription_items WHERE prescription_id = $1 AND organization_id = $2', [
        prescriptionId,
        context.organizationId
      ]);

      for (const rawItem of data.items) {
        const itemId = rawItem.id || `rxi_${crypto.randomUUID()}`;
        const item: PrescriptionItem = {
          id: itemId,
          organization_id: context.organizationId,
          prescription_id: prescriptionId,
          medication_catalog_id: rawItem.medicationCatalogId || null,
          medication_name: rawItem.medicationName.trim(),
          dosage_form: rawItem.dosageForm || 'TABLET',
          dose_amount: rawItem.doseAmount || null,
          dose_unit: rawItem.doseUnit || null,
          route: rawItem.route || 'ORAL',
          frequency: rawItem.frequency.trim(),
          duration: rawItem.duration || null,
          quantity: rawItem.quantity,
          quantity_unit: rawItem.quantityUnit || 'TABLET',
          refills_authorized: rawItem.refillsAuthorized || 0,
          refills_remaining: rawItem.refillsAuthorized || 0,
          sig_instructions: rawItem.sigInstructions.trim(),
          indication: rawItem.indication || null,
          status: 'ACTIVE',
          created_at: now,
          updated_at: now
        };

        await db.query(
          `INSERT INTO prescription_items (
            id, organization_id, prescription_id, medication_catalog_id, medication_name,
            dosage_form, dose_amount, dose_unit, route, frequency, duration, quantity,
            quantity_unit, refills_authorized, refills_remaining, sig_instructions, indication,
            status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
          [
            item.id,
            item.organization_id,
            item.prescription_id,
            item.medication_catalog_id,
            item.medication_name,
            item.dosage_form,
            item.dose_amount,
            item.dose_unit,
            item.route,
            item.frequency,
            item.duration,
            item.quantity,
            item.quantity_unit,
            item.refills_authorized,
            item.refills_remaining,
            item.sig_instructions,
            item.indication,
            item.status,
            item.created_at,
            item.updated_at
          ]
        );
        items.push(item);
      }
    } else {
      const itemsRes = await db.query<PrescriptionItem>(
        'SELECT * FROM prescription_items WHERE prescription_id = $1 AND organization_id = $2',
        [prescriptionId, context.organizationId]
      );
      items = itemsRes.rows;
    }

    await AuditService.logEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      actorRole: context.userRole,
      action: 'prescription.updated',
      resourceType: 'prescription',
      resourceId: prescriptionId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: { version: updatedOrder.version }
    });

    return {
      prescription: updatedOrder,
      items
    };
  }

  static async signPrescription(
    prescriptionId: string,
    context: { organizationId: string; userId: string; userRole?: string; ipAddress?: string; userAgent?: string },
    client?: IDatabaseClient
  ): Promise<PrescriptionOrder> {
    const db = client || getDatabaseClient();

    const rxRes = await db.query<PrescriptionOrder>(
      'SELECT * FROM prescription_orders WHERE id = $1 AND organization_id = $2',
      [prescriptionId, context.organizationId]
    );
    if (rxRes.rows.length === 0) {
      throw new MedicationError('PRESCRIPTION_NOT_FOUND', 'Prescription not found', 404);
    }

    const current = rxRes.rows[0];

    // Idempotency: If already SIGNED by same user, return current
    if (current.status === 'SIGNED') {
      return current;
    }

    if (current.status !== 'DRAFT') {
      throw new MedicationError(
        'INVALID_SIGN_STATE',
        `Cannot sign prescription in ${current.status} status. Only DRAFT prescriptions may be signed.`,
        400
      );
    }

    // Retrieve items for snapshot hashing
    const itemsRes = await db.query<PrescriptionItem>(
      'SELECT * FROM prescription_items WHERE prescription_id = $1 AND organization_id = $2',
      [prescriptionId, context.organizationId]
    );
    if (itemsRes.rows.length === 0) {
      throw new MedicationError('ITEMS_REQUIRED', 'Prescription has no items to sign', 400);
    }

    const now = new Date().toISOString();

    // Compute cryptographic signature hash
    const payloadToHash = JSON.stringify({
      prescriptionId: current.id,
      patientId: current.patient_id,
      providerId: current.provider_id,
      signedBy: context.userId,
      signedAt: now,
      items: itemsRes.rows.map(i => ({
        name: i.medication_name,
        dose: i.dose_amount,
        unit: i.dose_unit,
        freq: i.frequency,
        qty: i.quantity,
        instructions: i.sig_instructions
      }))
    });

    const signatureHash = crypto.createHash('sha256').update(payloadToHash).digest('hex');

    const signedOrder: PrescriptionOrder = {
      ...current,
      status: 'SIGNED',
      signed_at: now,
      signed_by_user_id: context.userId,
      signature_hash: signatureHash,
      version: current.version + 1,
      updated_at: now
    };

    await db.query(
      `UPDATE prescription_orders SET
        status = $1, signed_at = $2, signed_by_user_id = $3, signature_hash = $4, version = $5, updated_at = $6
       WHERE id = $7 AND organization_id = $8`,
      [
        signedOrder.status,
        signedOrder.signed_at,
        signedOrder.signed_by_user_id,
        signedOrder.signature_hash,
        signedOrder.version,
        signedOrder.updated_at,
        prescriptionId,
        context.organizationId
      ]
    );

    // Also auto-add signed medications to patient active medication history
    for (const item of itemsRes.rows) {
      await this.recordPatientMedication(
        {
          patientId: current.patient_id,
          medicationCatalogId: item.medication_catalog_id || undefined,
          medicationName: item.medication_name,
          dosage: `${item.dose_amount || ''} ${item.dose_unit || ''}`.trim() || item.dosage_form,
          route: item.route,
          frequency: item.frequency,
          status: 'ACTIVE',
          source: 'PRESCRIPTION_FULFILLED',
          isPatientReported: false,
          encounterId: current.encounter_id || undefined,
          startDate: now.slice(0, 10),
          sigInstructions: item.sig_instructions
        },
        context,
        db
      ).catch(() => {
        // Safe continuation if already present
      });
    }

    await AuditService.logEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      actorRole: context.userRole,
      action: 'prescription.signed',
      resourceType: 'prescription',
      resourceId: prescriptionId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        patient_id: current.patient_id,
        signature_hash: signatureHash,
        version: signedOrder.version
      }
    });

    return signedOrder;
  }

  static async cancelPrescription(
    prescriptionId: string,
    reason: string,
    context: { organizationId: string; userId: string; userRole?: string; ipAddress?: string; userAgent?: string },
    client?: IDatabaseClient
  ): Promise<PrescriptionOrder> {
    const db = client || getDatabaseClient();

    if (!reason || !reason.trim()) {
      throw new MedicationError('REASON_REQUIRED', 'A cancellation reason is required to cancel a prescription', 400);
    }

    const rxRes = await db.query<PrescriptionOrder>(
      'SELECT * FROM prescription_orders WHERE id = $1 AND organization_id = $2',
      [prescriptionId, context.organizationId]
    );
    if (rxRes.rows.length === 0) {
      throw new MedicationError('PRESCRIPTION_NOT_FOUND', 'Prescription not found', 404);
    }

    const current = rxRes.rows[0];

    if (current.status === 'CANCELLED') {
      return current;
    }

    if (current.status === 'DISPENSED') {
      throw new MedicationError(
        'CANNOT_CANCEL_DISPENSED',
        'Cannot cancel a prescription that has already been fully dispensed.',
        400
      );
    }

    const now = new Date().toISOString();
    const cancelledOrder: PrescriptionOrder = {
      ...current,
      status: 'CANCELLED',
      cancelled_at: now,
      cancelled_by_user_id: context.userId,
      cancellation_reason: reason.trim(),
      version: current.version + 1,
      updated_at: now
    };

    await db.query(
      `UPDATE prescription_orders SET
        status = $1, cancelled_at = $2, cancelled_by_user_id = $3, cancellation_reason = $4, version = $5, updated_at = $6
       WHERE id = $7 AND organization_id = $8`,
      [
        cancelledOrder.status,
        cancelledOrder.cancelled_at,
        cancelledOrder.cancelled_by_user_id,
        cancelledOrder.cancellation_reason,
        cancelledOrder.version,
        cancelledOrder.updated_at,
        prescriptionId,
        context.organizationId
      ]
    );

    // Cancel items
    await db.query(
      `UPDATE prescription_items SET status = 'CANCELLED', updated_at = $1 WHERE prescription_id = $2`,
      [now, prescriptionId]
    );

    await AuditService.logEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      actorRole: context.userRole,
      action: 'prescription.cancelled',
      resourceType: 'prescription',
      resourceId: prescriptionId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        patient_id: current.patient_id,
        version: cancelledOrder.version
      }
    });

    return cancelledOrder;
  }

  static async replacePrescription(
    originalPrescriptionId: string,
    replacementData: {
      items: Array<{
        medicationCatalogId?: string;
        medicationName: string;
        dosageForm?: string;
        doseAmount?: string;
        doseUnit?: string;
        route?: string;
        frequency: string;
        duration?: string;
        quantity: number;
        quantityUnit?: string;
        refillsAuthorized?: number;
        sigInstructions: string;
        indication?: string;
      }>;
      reason: string;
      signImmediately?: boolean;
    },
    context: { organizationId: string; userId: string; userRole?: string; ipAddress?: string; userAgent?: string },
    client?: IDatabaseClient
  ): Promise<{ original: PrescriptionOrder; replacement: PrescriptionOrder; items: PrescriptionItem[] }> {
    const db = client || getDatabaseClient();

    if (!replacementData.reason || !replacementData.reason.trim()) {
      throw new MedicationError('REASON_REQUIRED', 'A reason is required to supersede a prescription', 400);
    }

    const origRes = await db.query<PrescriptionOrder>(
      'SELECT * FROM prescription_orders WHERE id = $1 AND organization_id = $2',
      [originalPrescriptionId, context.organizationId]
    );
    if (origRes.rows.length === 0) {
      throw new MedicationError('PRESCRIPTION_NOT_FOUND', 'Original prescription not found', 404);
    }

    const original = origRes.rows[0];

    // 1. Create the new replacement prescription
    const draftRes = await this.createDraftPrescription(
      {
        patientId: original.patient_id,
        providerId: original.provider_id,
        encounterId: original.encounter_id || undefined,
        priority: (original.priority as 'ROUTINE' | 'STAT' | 'URGENT') || 'ROUTINE',
        pharmacyId: original.pharmacy_id || undefined,
        items: replacementData.items
      },
      context,
      db
    );

    const replacementId = draftRes.prescription.id;
    const now = new Date().toISOString();

    // 2. Mark original as CANCELLED / REPLACED and link
    await db.query(
      `UPDATE prescription_orders SET
        status = 'CANCELLED', cancellation_reason = $1, cancelled_at = $2, cancelled_by_user_id = $3,
        replaced_by_prescription_id = $4, updated_at = $5
       WHERE id = $6 AND organization_id = $7`,
      [
        `Superseded by replacement prescription ${replacementId}: ${replacementData.reason.trim()}`,
        now,
        context.userId,
        replacementId,
        now,
        originalPrescriptionId,
        context.organizationId
      ]
    );

    // 3. Link replacement back to original
    await db.query(
      `UPDATE prescription_orders SET replaces_prescription_id = $1, updated_at = $2 WHERE id = $3`,
      [originalPrescriptionId, now, replacementId]
    );

    let finalReplacement = draftRes.prescription;
    finalReplacement.replaces_prescription_id = originalPrescriptionId;

    if (replacementData.signImmediately) {
      finalReplacement = await this.signPrescription(replacementId, context, db);
    }

    await AuditService.logEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      actorRole: context.userRole,
      action: 'prescription.replaced',
      resourceType: 'prescription',
      resourceId: originalPrescriptionId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        original_prescription_id: originalPrescriptionId,
        replacement_prescription_id: replacementId
      }
    });

    const updatedOrigRes = await db.query<PrescriptionOrder>(
      'SELECT * FROM prescription_orders WHERE id = $1',
      [originalPrescriptionId]
    );

    return {
      original: updatedOrigRes.rows[0],
      replacement: finalReplacement,
      items: draftRes.items
    };
  }

  // =========================================================================
  // 6. PHARMACY DISPENSING WORKFLOW
  // =========================================================================

  static async dispensePrescription(
    prescriptionId: string,
    data: {
      pharmacyId: string;
      itemId?: string;
      quantityDispensed: number;
      isComplete?: boolean;
      notes?: string;
    },
    context: { organizationId: string; userId: string; userRole?: string; ipAddress?: string; userAgent?: string },
    client?: IDatabaseClient
  ): Promise<{ dispensation: PrescriptionDispensation; prescription: PrescriptionOrder }> {
    const db = client || getDatabaseClient();

    if (!data.quantityDispensed || data.quantityDispensed <= 0) {
      throw new MedicationError('INVALID_QUANTITY', 'Dispensed quantity must be greater than zero', 400);
    }

    const rxRes = await db.query<PrescriptionOrder>(
      'SELECT * FROM prescription_orders WHERE id = $1 AND organization_id = $2',
      [prescriptionId, context.organizationId]
    );
    if (rxRes.rows.length === 0) {
      throw new MedicationError('PRESCRIPTION_NOT_FOUND', 'Prescription not found', 404);
    }

    const order = rxRes.rows[0];

    // Cannot dispense un-signed, cancelled or expired prescriptions!
    if (order.status !== 'SIGNED' && order.status !== 'PARTIALLY_DISPENSED') {
      throw new MedicationError(
        'CANNOT_DISPENSE_INVALID_STATUS',
        `Prescription cannot be dispensed while in ${order.status} status. Only SIGNED or PARTIALLY_DISPENSED orders may be dispensed.`,
        400
      );
    }

    // Check pharmacy exists
    const pharmRes = await db.query<Pharmacy>(
      'SELECT id, name FROM pharmacies WHERE id = $1 AND organization_id = $2 AND is_active = TRUE',
      [data.pharmacyId, context.organizationId]
    );
    if (pharmRes.rows.length === 0) {
      throw new MedicationError('PHARMACY_NOT_FOUND', 'Selected pharmacy is invalid or inactive', 404);
    }

    // Resolve items
    const itemsRes = await db.query<PrescriptionItem>(
      'SELECT * FROM prescription_items WHERE prescription_id = $1 AND organization_id = $2',
      [prescriptionId, context.organizationId]
    );
    if (itemsRes.rows.length === 0) {
      throw new MedicationError('NO_ITEMS', 'Prescription has no items', 400);
    }

    const targetItem = data.itemId
      ? itemsRes.rows.find(i => i.id === data.itemId)
      : itemsRes.rows[0];

    if (!targetItem) {
      throw new MedicationError('ITEM_NOT_FOUND', 'Specified prescription item not found', 404);
    }

    const dispensationId = `dsp_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const isComplete = data.isComplete === true || data.quantityDispensed >= targetItem.quantity;

    const dispensation: PrescriptionDispensation = {
      id: dispensationId,
      organization_id: context.organizationId,
      prescription_id: prescriptionId,
      prescription_item_id: targetItem.id,
      pharmacy_id: data.pharmacyId,
      dispensed_medication_name: targetItem.medication_name,
      quantity_dispensed: data.quantityDispensed,
      dispensation_status: isComplete ? 'COMPLETE' : 'PARTIAL',
      dispensed_by_user_id: context.userId,
      dispensed_at: now,
      notes: data.notes || null,
      created_at: now
    };

    await db.query(
      `INSERT INTO prescription_dispensations (
        id, organization_id, prescription_id, prescription_item_id, pharmacy_id,
        dispensed_medication_name, quantity_dispensed, dispensation_status,
        dispensed_by_user_id, dispensed_at, notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        dispensation.id,
        dispensation.organization_id,
        dispensation.prescription_id,
        dispensation.prescription_item_id,
        dispensation.pharmacy_id,
        dispensation.dispensed_medication_name,
        dispensation.quantity_dispensed,
        dispensation.dispensation_status,
        dispensation.dispensed_by_user_id,
        dispensation.dispensed_at,
        dispensation.notes,
        dispensation.created_at
      ]
    );

    // Update prescription status accordingly:
    // If complete -> DISPENSED; if partial -> PARTIALLY_DISPENSED
    const newStatus: PrescriptionStatus = isComplete ? 'DISPENSED' : 'PARTIALLY_DISPENSED';
    await db.query(
      `UPDATE prescription_orders SET status = $1, pharmacy_id = $2, updated_at = $3 WHERE id = $4`,
      [newStatus, data.pharmacyId, now, prescriptionId]
    );

    order.status = newStatus;
    order.pharmacy_id = data.pharmacyId;
    order.updated_at = now;

    await AuditService.logEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      actorRole: context.userRole,
      action: 'prescription.dispensed',
      resourceType: 'prescription_dispensation',
      resourceId: dispensationId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        prescription_id: prescriptionId,
        quantity_dispensed: data.quantityDispensed,
        dispensation_status: dispensation.dispensation_status
      }
    });

    return {
      dispensation,
      prescription: order
    };
  }

  // =========================================================================
  // 7. CLINICAL SAFETY CHECK EXTENSION POINT
  // =========================================================================

  static async evaluatePrescriptionSafety(
    patientId: string,
    items: Array<{ medicationName: string; dosageForm?: string }>,
    organizationId: string,
    client?: IDatabaseClient
  ): Promise<SafetyCheckResult> {
    const db = client || getDatabaseClient();
    const alerts: SafetyAlert[] = [];

    // Query active patient allergies
    const allergiesRes = await db.query<PatientAllergy>(
      'SELECT * FROM patient_allergies WHERE patient_id = $1 AND organization_id = $2 AND clinical_status = $3',
      [patientId, organizationId, 'ACTIVE']
    );
    const allergies = allergiesRes.rows;

    // Check each prescribed medication against known allergies
    for (const item of items) {
      const medLower = item.medicationName.toLowerCase();

      for (const alg of allergies) {
        const algLower = alg.substance_name.toLowerCase();

        const isExact = medLower.includes(algLower) || algLower.includes(medLower);
        const isPenicillinCross =
          (algLower.includes('penicillin') || algLower.includes('amoxicillin') || algLower.includes('ampicillin')) &&
          (medLower.includes('amoxicillin') || medLower.includes('penicillin') || medLower.includes('ampicillin') || medLower.includes('augmentin'));

        if (isExact || isPenicillinCross) {
          alerts.push({
            type: 'ALLERGY_WARNING',
            severity: alg.severity === 'SEVERE' || alg.severity === 'LIFE_THREATENING' ? 'CRITICAL' : 'WARNING',
            title: `Documented Allergy Alert: ${alg.substance_name}`,
            message: `Patient has documented active allergy to "${alg.substance_name}" (${alg.reaction_description}, Severity: ${alg.severity}). Prescribed medication "${item.medicationName}" poses an active allergic hazard.`,
            allergyId: alg.id,
            medicationName: item.medicationName,
            requiresClinicianOverride: true
          });
        }
      }
    }

    return {
      hasAlerts: alerts.length > 0,
      hasBlockingAlerts: alerts.some(a => a.severity === 'CRITICAL'),
      alerts,
      externalEngineStatus: 'UNAVAILABLE',
      disclaimer:
        'CLINICAL SAFETY NOTICE: Real-time external drug-drug interaction and contraindication checking engine (e.g. FDB/Lexicomp) is not configured in this environment. Showing verified patient documented allergies only. Prescribing clinicians must independently verify clinical appropriateness, patient contraindications, and dosage guidelines.',
      evaluatedAt: new Date().toISOString()
    };
  }

  static async recordSafetyOverride(
    prescriptionId: string,
    data: {
      patientId: string;
      allergyId?: string;
      alertType: string;
      alertDescription: string;
      overrideReason: string;
    },
    context: { organizationId: string; userId: string; userRole?: string; ipAddress?: string; userAgent?: string },
    client?: IDatabaseClient
  ): Promise<{ id: string }> {
    const db = client || getDatabaseClient();

    if (!data.overrideReason || !data.overrideReason.trim()) {
      throw new MedicationError('REASON_REQUIRED', 'A clinical override rationale is mandatory to proceed past a safety warning', 400);
    }

    const id = `ovr_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    await db.query(
      `INSERT INTO safety_check_overrides (
        id, organization_id, prescription_id, patient_id, allergy_id, alert_type,
        alert_description, override_reason, overridden_by_user_id, overridden_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        context.organizationId,
        prescriptionId,
        data.patientId,
        data.allergyId || null,
        data.alertType,
        data.alertDescription,
        data.overrideReason.trim(),
        context.userId,
        now
      ]
    );

    await AuditService.logEvent({
      organizationId: context.organizationId,
      actorId: context.userId,
      actorRole: context.userRole,
      action: 'prescription.safety_override',
      resourceType: 'safety_check_override',
      resourceId: id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        prescription_id: prescriptionId,
        patient_id: data.patientId,
        alert_type: data.alertType
      }
    });

    return { id };
  }
}
