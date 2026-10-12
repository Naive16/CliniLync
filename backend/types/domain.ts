/**
 * CLINILYNC Domain Type Definitions
 */

export interface Organization {
  id: string;
  name: string;
  legal_name?: string;
  tax_id?: string;
  slug: string;
  country_code: string;
  currency_code: string;
  timezone: string;
  phone?: string;
  email?: string;
  address_line1?: string;
  city?: string;
  postal_code?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  password_hash: string;
  salt: string;
  first_name: string;
  last_name: string;
  phone?: string;
  avatar_url?: string;
  is_super_admin: boolean;
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING';
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: string;
  name: string;
  code: string;
  description?: string;
  is_system_role: boolean;
  created_at: string;
}

export interface Permission {
  id: string;
  code: string;
  category: string;
  description: string;
  created_at: string;
}

export interface UserOrganization {
  id: string;
  user_id: string;
  organization_id: string;
  role_id: string;
  is_primary: boolean;
  status: string;
  created_at: string;
}

export interface SecurityContext {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    isSuperAdmin: boolean;
  };
  activeOrganization: Organization;
  roles: Role[];
  permissions: string[];
  sessionToken: string;
  membership?: {
    id?: string;
    role?: string;
    status?: string;
  };
}

export interface Patient {
  id: string;
  organization_id: string;
  user_id?: string | null;
  mrn: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: string;
  blood_group?: string | null;
  email?: string | null;
  phone?: string | null;
  address_line1?: string | null;
  city?: string | null;
  postal_code?: string | null;
  preferred_language?: string | null;
  contact_preference?: 'EMAIL' | 'PHONE' | 'SMS' | 'POSTAL' | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  allergies_summary?: string | null;
  primary_provider_id?: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' | 'DECEASED' | 'MERGED';
  is_active: boolean;
  archived_at?: string | null;
  archived_reason?: string | null;
  archived_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PatientContact {
  id: string;
  organization_id: string;
  patient_id: string;
  name: string;
  relationship: string;
  phone: string;
  email?: string | null;
  is_emergency_contact: boolean;
  has_legal_authority: boolean;
  created_at: string;
  updated_at: string;
}

export interface PatientConsent {
  id: string;
  organization_id: string;
  patient_id: string;
  consent_type: 'GENERAL_TREATMENT' | 'TELEHEALTH' | 'DATA_SHARING' | 'RESEARCH';
  purpose: string;
  status: 'GRANTED' | 'REVOKED' | 'EXPIRED';
  granted_at: string;
  expires_at?: string | null;
  revoked_at?: string | null;
  revoked_by_user_id?: string | null;
  recorded_by_user_id: string;
  notes?: string | null;
  created_at: string;
}

export interface Specialty {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  category: string;
  is_active: boolean;
  created_at: string;
}

export interface Department {
  id: string;
  organization_id: string;
  name: string;
  code: string;
  description?: string | null;
  parent_department_id?: string | null;
  head_provider_id?: string | null;
  email?: string | null;
  phone?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface Provider {
  id: string;
  organization_id: string;
  user_id?: string | null;
  department_id?: string | null;
  title?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  specialty_id?: string | null;
  specialization: string;
  license_number: string;
  consultation_fee: number;
  email?: string | null;
  phone?: string | null;
  bio?: string | null;
  qualifications?: string | null;
  is_credential_verified: boolean;
  is_accepting_patients: boolean;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  archived_at?: string | null;
  archived_reason?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface ProviderDepartment {
  id: string;
  provider_id: string;
  department_id: string;
  is_primary: boolean;
  created_at: string;
}

export interface AppointmentType {
  id: string;
  organization_id: string;
  name: string;
  code: string;
  description?: string | null;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  department_id?: string | null;
  specialty_id?: string | null;
  is_active: boolean;
  allow_self_booking: boolean;
  color_code?: string;
  created_at: string;
  updated_at: string;
}

export interface ProviderAvailability {
  id: string;
  organization_id: string;
  provider_id: string;
  day_of_week: number; // 1=Mon ... 7=Sun
  start_time: string; // HH:MM
  end_time: string;   // HH:MM
  timezone: string;
  is_active: boolean;
  effective_start_date?: string | null;
  effective_end_date?: string | null;
  created_at: string;
}

export interface ProviderScheduleException {
  id: string;
  organization_id: string;
  provider_id: string;
  start_datetime: string;
  end_datetime: string;
  reason: string;
  is_all_day: boolean;
  created_at: string;
}

export type AppointmentStatus =
  | 'REQUESTED'
  | 'SCHEDULED'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW'
  | 'RESCHEDULED';

export interface Appointment {
  id: string;
  organization_id: string;
  patient_id: string;
  provider_id: string;
  department_id?: string | null;
  appointment_type_id?: string | null;
  scheduled_time: string;
  end_time?: string | null;
  duration_minutes: number;
  appointment_type: string;
  timezone?: string;
  status: AppointmentStatus;
  reason_for_visit?: string | null;
  cancellation_reason?: string | null;
  creation_source?: 'STAFF' | 'PORTAL' | 'EXTERNAL';
  created_by_user_id?: string | null;
  checked_in_at?: string | null;
  checked_in_by_user_id?: string | null;
  started_at?: string | null;
  started_by_user_id?: string | null;
  completed_at?: string | null;
  completed_by_user_id?: string | null;
  cancelled_at?: string | null;
  cancelled_by_user_id?: string | null;
  rescheduled_from_appointment_id?: string | null;
  rescheduled_to_appointment_id?: string | null;
  no_show_at?: string | null;
  no_show_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClinicalRecord {
  id: string;
  organization_id: string;
  patient_id: string;
  provider_id: string;
  appointment_id?: string;
  encounter_date: string;
  encounter_type: string;
  chief_complaint: string;
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  is_finalized: boolean;
  finalized_at?: string;
  finalized_by?: string;
  created_at: string;
  updated_at: string;
}

export interface Diagnosis {
  id: string;
  organization_id: string;
  patient_id: string;
  clinical_record_id?: string;
  code: string;
  description: string;
  severity: string;
  status: string;
  diagnosed_date: string;
  created_at: string;
}

export interface Allergy {
  id: string;
  organization_id: string;
  patient_id: string;
  allergen: string;
  reaction: string;
  severity: string;
  status: string;
  created_at: string;
}

export interface Vitals {
  id: string;
  organization_id: string;
  patient_id: string;
  clinical_record_id?: string;
  recorded_by?: string;
  systolic_bp?: number;
  diastolic_bp?: number;
  heart_rate?: number;
  respiratory_rate?: number;
  temperature_celsius?: number;
  oxygen_saturation?: number;
  weight_kg?: number;
  height_cm?: number;
  bmi?: number;
  recorded_at: string;
}

export interface Invoice {
  id: string;
  organization_id: string;
  patient_id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  subtotal: number;
  tax: number;
  discount: number;
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  currency: string;
  status: 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOID' | 'OVERDUE';
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface AuditLogEntry {
  id: string;
  organization_id: string;
  actor_id: string;
  actor_role?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  ip_address?: string;
  user_agent?: string;
  metadata?: Record<string, unknown>;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  created_at: string;
}

export type EncounterStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type EncounterType = 'IN_PERSON' | 'TELEHEALTH' | 'URGENT_CARE' | 'FOLLOW_UP' | 'HOME_VISIT';

export interface Encounter {
  id: string;
  organization_id: string;
  patient_id: string;
  provider_id: string;
  appointment_id?: string | null;
  encounter_type: EncounterType | string;
  status: EncounterStatus;
  reason_for_visit?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  timezone: string;
  cancellation_reason?: string | null;
  cancelled_at?: string | null;
  cancelled_by_user_id?: string | null;
  completed_at?: string | null;
  completed_by_user_id?: string | null;
  created_by_user_id: string;
  updated_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
}

export type ClinicalNoteStatus = 'DRAFT' | 'SIGNED' | 'AMENDED';
export type ClinicalNoteType =
  | 'PROGRESS_NOTE'
  | 'CONSULTATION'
  | 'PROCEDURE_NOTE'
  | 'H_AND_P'
  | 'DISCHARGE_SUMMARY'
  | 'PHONE_NOTE';

export interface ClinicalNote {
  id: string;
  organization_id: string;
  encounter_id: string;
  patient_id: string;
  author_id: string;
  author_provider_id?: string | null;
  note_type: ClinicalNoteType | string;
  status: ClinicalNoteStatus;
  version: number;
  chief_complaint?: string | null;
  history_of_present_illness?: string | null;
  past_medical_history?: string | null;
  surgical_history?: string | null;
  family_social_history?: string | null;
  review_of_systems?: string | null;
  physical_examination?: string | null;
  assessment?: string | null;
  plan?: string | null;
  follow_up_instructions?: string | null;
  signed_at?: string | null;
  signed_by_user_id?: string | null;
  amended_from_note_id?: string | null;
  amendment_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClinicalNoteVersion {
  id: string;
  note_id: string;
  organization_id: string;
  version_number: number;
  status: string;
  snapshot_data: string;
  author_id: string;
  signed_by_user_id?: string | null;
  signed_at?: string | null;
  amended_by_user_id?: string | null;
  amended_at?: string | null;
  amendment_reason?: string | null;
  created_at: string;
}

export type ObservationStatus = 'PRELIMINARY' | 'FINAL' | 'AMENDED';

export interface ClinicalObservation {
  id: string;
  organization_id: string;
  encounter_id: string;
  patient_id: string;
  recorded_by_user_id: string;
  observation_type: string;
  numeric_value?: number | null;
  text_value?: string | null;
  unit: string;
  status: ObservationStatus;
  notes?: string | null;
  measured_at: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Phase 9: Diagnoses, Longitudinal Problems, Care Plans & Decision Support
// ---------------------------------------------------------------------------

export interface TerminologyConcept {
  id: string;
  system: string;
  version: string;
  code: string;
  display_name: string;
  category: string;
  is_active: boolean;
  created_at: string;
}

export type DiagnosisType = 'PRIMARY' | 'SECONDARY' | 'ADMITTING' | 'DISCHARGE' | 'DIFFERENTIAL';
export type DiagnosisClinicalStatus = 'ACTIVE' | 'RESOLVED' | 'RECURRENCE' | 'RULED_OUT';

export interface EncounterDiagnosis {
  id: string;
  organization_id: string;
  patient_id: string;
  encounter_id: string;
  diagnosis_code?: string | null;
  terminology_system?: string | null;
  terminology_version?: string | null;
  display_name: string;
  description?: string | null;
  diagnosis_type: DiagnosisType | string;
  is_primary: boolean;
  clinical_status: DiagnosisClinicalStatus | string;
  onset_date?: string | null;
  diagnosed_date: string;
  recorded_by_user_id: string;
  created_at: string;
  updated_at: string;
}

export type ProblemStatus = 'ACTIVE' | 'RESOLVED' | 'INACTIVE';

export interface PatientProblem {
  id: string;
  organization_id: string;
  patient_id: string;
  problem_name: string;
  code?: string | null;
  terminology_system?: string | null;
  status: ProblemStatus | string;
  onset_date?: string | null;
  resolved_date?: string | null;
  resolution_notes?: string | null;
  encounter_id?: string | null;
  recorded_by_user_id: string;
  reviewed_by_user_id?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export type CarePlanStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'ON_HOLD'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'SUPERSEDED';

export interface CarePlan {
  id: string;
  organization_id: string;
  patient_id: string;
  encounter_id?: string | null;
  responsible_provider_id?: string | null;
  title: string;
  clinical_rationale?: string | null;
  description?: string | null;
  start_date: string;
  review_date?: string | null;
  status: CarePlanStatus | string;
  status_reason?: string | null;
  created_by_user_id: string;
  updated_by_user_id?: string | null;
  completed_at?: string | null;
  completed_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
}

export type CarePlanItemCategory =
  | 'LIFESTYLE'
  | 'SELF_CARE'
  | 'CONSULTATION'
  | 'MONITORING'
  | 'EDUCATION'
  | 'REFERRAL'
  | 'OTHER';

export type CarePlanItemStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface CarePlanItem {
  id: string;
  organization_id: string;
  care_plan_id: string;
  patient_id: string;
  category: CarePlanItemCategory | string;
  description: string;
  responsible_role?: string | null;
  due_date?: string | null;
  status: CarePlanItemStatus | string;
  completion_notes?: string | null;
  completed_at?: string | null;
  completed_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface FollowUpInstruction {
  id: string;
  organization_id: string;
  patient_id: string;
  encounter_id: string;
  care_plan_id?: string | null;
  timeframe?: string | null;
  reassessment_date?: string | null;
  instructions: string;
  warning_signs?: string | null;
  is_patient_facing: boolean;
  author_id: string;
  created_at: string;
  updated_at: string;
}

export type ClinicalRuleStatus = 'DISABLED' | 'TESTING' | 'ACTIVE';
export type ClinicalRuleSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface ClinicalRule {
  id: string;
  organization_id: string;
  title: string;
  description?: string | null;
  clinical_context: string;
  rule_status: ClinicalRuleStatus | string;
  severity: ClinicalRuleSeverity | string;
  evidence_reference?: string | null;
  human_explanation: string;
  created_by_user_id: string;
  activated_at?: string | null;
  activated_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
}

export type ClinicalAlertReviewStatus = 'PENDING' | 'ACKNOWLEDGED' | 'DISMISSED' | 'ACTION_TAKEN';

export interface ClinicalAlert {
  id: string;
  organization_id: string;
  patient_id: string;
  encounter_id?: string | null;
  rule_id: string;
  rule_version: string;
  severity: ClinicalRuleSeverity | string;
  explanation: string;
  trigger_context?: string | null;
  review_status: ClinicalAlertReviewStatus | string;
  reviewed_by_user_id?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
  created_at: string;
}

// =========================================================================
// Medication, Allergy & Prescription Types (Phase 10)
// =========================================================================

export type PrescriptionStatus = 'DRAFT' | 'SIGNED' | 'PARTIALLY_DISPENSED' | 'DISPENSED' | 'CANCELLED' | 'REPLACED' | 'EXPIRED';

export interface MedicationCatalogItem {
  id: string;
  display_name: string;
  generic_name?: string | null;
  active_ingredients?: string | null;
  strength?: string | null;
  strength_unit?: string | null;
  dosage_form: string;
  route_of_administration: string;
  classification: string;
  catalog_source: string;
  source_version: string;
  external_code?: string | null;
  terminology_system?: string | null;
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PatientAllergy {
  id: string;
  organization_id: string;
  patient_id: string;
  substance_name: string;
  allergen_type: string;
  reaction_description: string;
  severity: string;
  verification_status: string;
  clinical_status: string;
  source_of_information: string;
  recorded_by_user_id: string;
  reviewed_by_user_id?: string | null;
  reviewed_at?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PatientMedication {
  id: string;
  organization_id: string;
  patient_id: string;
  medication_catalog_id?: string | null;
  medication_name: string;
  dosage?: string | null;
  route?: string | null;
  frequency?: string | null;
  status: string;
  source: string;
  is_patient_reported: boolean;
  reconciliation_status: string;
  encounter_id?: string | null;
  recorded_by_user_id: string;
  start_date?: string | null;
  end_date?: string | null;
  sig_instructions?: string | null;
  discontinuation_reason?: string | null;
  discontinued_at?: string | null;
  discontinued_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Pharmacy {
  id: string;
  organization_id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address_line1?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country_code: string;
  is_internal: boolean;
  is_active: boolean;
  integration_status: string;
  created_at: string;
  updated_at: string;
}

export interface PrescriptionOrder {
  id: string;
  organization_id: string;
  patient_id: string;
  provider_id: string;
  encounter_id?: string | null;
  status: PrescriptionStatus | string;
  priority: string;
  signed_at?: string | null;
  signed_by_user_id?: string | null;
  signature_hash?: string | null;
  cancelled_at?: string | null;
  cancelled_by_user_id?: string | null;
  cancellation_reason?: string | null;
  replaced_by_prescription_id?: string | null;
  replaces_prescription_id?: string | null;
  pharmacy_id?: string | null;
  expires_at?: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface PrescriptionItem {
  id: string;
  organization_id: string;
  prescription_id: string;
  medication_catalog_id?: string | null;
  medication_name: string;
  dosage_form: string;
  dose_amount?: string | null;
  dose_unit?: string | null;
  route: string;
  frequency: string;
  duration?: string | null;
  quantity: number;
  quantity_unit?: string | null;
  refills_authorized: number;
  refills_remaining: number;
  sig_instructions: string;
  indication?: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface PrescriptionDispensation {
  id: string;
  organization_id: string;
  prescription_id: string;
  prescription_item_id?: string | null;
  pharmacy_id: string;
  dispensed_medication_name: string;
  quantity_dispensed: number;
  dispensation_status: string;
  dispensed_by_user_id: string;
  dispensed_at: string;
  notes?: string | null;
  created_at: string;
}

export interface MedicationReconciliation {
  id: string;
  organization_id: string;
  patient_id: string;
  encounter_id?: string | null;
  reconciled_by_user_id: string;
  reconciled_at?: string;
  discrepancy_count?: number;
  notes?: string | null;
  created_at: string;
}

export interface SafetyAlert {
  type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  message: string;
  allergyId?: string;
  medicationName: string;
  requiresClinicianOverride?: boolean;
}

export interface SafetyCheckResult {
  hasAlerts: boolean;
  hasBlockingAlerts: boolean;
  alerts: SafetyAlert[];
  externalEngineStatus: string;
  disclaimer: string;
  evaluatedAt: string;
}


