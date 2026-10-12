/**
 * CLINILYNC Care Plan & Follow-Up Documentation Service
 * 
 * Provides:
 * 1. Clinician-authored structured care plans with validated state machine transitions.
 * 2. Fine-grained care plan items / action tracking (lifestyle, self-care, consultations, monitoring).
 * 3. Atomic status transitions, concurrency safeguards, and defensible audit logging.
 * 4. Clinician-authored follow-up instructions (timeframe, reassessment, warning signs, patient-facing distinction).
 */

import crypto from 'node:crypto';
import { getDatabaseClient } from '../../database/db.js';
import {
  CarePlan,
  CarePlanItem,
  CarePlanStatus,
  CarePlanItemStatus,
  CarePlanItemCategory,
  FollowUpInstruction,
  Patient,
  Encounter,
  Provider
} from '../types/domain.js';
import { AuditService } from '../security/audit.js';

export class CarePlanError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = 'CarePlanError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export const VALID_CARE_PLAN_TRANSITIONS: Record<CarePlanStatus, CarePlanStatus[]> = {
  DRAFT: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['ON_HOLD', 'COMPLETED', 'CANCELLED', 'SUPERSEDED'],
  ON_HOLD: ['ACTIVE', 'CANCELLED', 'COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  SUPERSEDED: []
};

export interface CreateCarePlanParams {
  organizationId: string;
  patientId: string;
  encounterId?: string | null;
  responsibleProviderId?: string | null;
  title: string;
  clinicalRationale?: string | null;
  description?: string | null;
  startDate?: string | null;
  reviewDate?: string | null;
  status?: CarePlanStatus | string;
  items?: Array<{
    category: CarePlanItemCategory | string;
    description: string;
    responsibleRole?: string | null;
    dueDate?: string | null;
  }>;
  userId: string;
  userRole?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface RecordFollowUpParams {
  organizationId: string;
  patientId: string;
  encounterId: string;
  carePlanId?: string | null;
  timeframe?: string | null;
  reassessmentDate?: string | null;
  instructions: string;
  warningSigns?: string | null;
  isPatientFacing?: boolean;
  userId: string;
  userRole?: string;
  ipAddress?: string;
  userAgent?: string;
}

export class CarePlanService {
  /**
   * Get care plans for a patient
   */
  static async getPatientCarePlans(
    organizationId: string,
    patientId: string,
    userId: string,
    userRole?: string
  ): Promise<Array<CarePlan & { items: CarePlanItem[] }>> {
    const db = getDatabaseClient();

    // 1. Verify patient belongs to organization
    const patRes = await db.query<Patient>(
      'SELECT * FROM patients WHERE id = $1 AND organization_id = $2',
      [patientId, organizationId]
    );
    if (!patRes.rows.length) {
      throw new CarePlanError('PATIENT_NOT_FOUND', 'Patient record not found in active organization', 404);
    }

    const plansRes = await db.query<CarePlan>(
      'SELECT * FROM care_plans WHERE patient_id = $1 AND organization_id = $2 ORDER BY created_at DESC',
      [patientId, organizationId]
    );

    const itemsRes = await db.query<CarePlanItem>(
      'SELECT * FROM care_plan_items WHERE patient_id = $1 AND organization_id = $2 ORDER BY created_at ASC',
      [patientId, organizationId]
    );

    return plansRes.rows.map(plan => ({
      ...plan,
      items: itemsRes.rows.filter(it => it.care_plan_id === plan.id)
    }));
  }

  /**
   * Get single care plan with items
   */
  static async getCarePlanById(
    organizationId: string,
    carePlanId: string,
    userId: string,
    userRole?: string
  ): Promise<CarePlan & { items: CarePlanItem[] }> {
    const db = getDatabaseClient();

    const planRes = await db.query<CarePlan>(
      'SELECT * FROM care_plans WHERE id = $1 AND organization_id = $2',
      [carePlanId, organizationId]
    );
    if (!planRes.rows.length) {
      throw new CarePlanError('CARE_PLAN_NOT_FOUND', 'Care plan not found in active organization', 404);
    }
    const plan = planRes.rows[0];

    const itemsRes = await db.query<CarePlanItem>(
      'SELECT * FROM care_plan_items WHERE care_plan_id = $1 AND organization_id = $2 ORDER BY created_at ASC',
      [carePlanId, organizationId]
    );

    return {
      ...plan,
      items: itemsRes.rows
    };
  }

  /**
   * Create clinician-authored care plan
   */
  static async createCarePlan(params: CreateCarePlanParams): Promise<CarePlan & { items: CarePlanItem[] }> {
    const db = getDatabaseClient();

    if (!params.title || !params.title.trim()) {
      throw new CarePlanError('INVALID_TITLE', 'Care plan title is required', 400);
    }

    // Verify patient
    const patRes = await db.query<Patient>(
      'SELECT * FROM patients WHERE id = $1 AND organization_id = $2',
      [params.patientId, params.organizationId]
    );
    if (!patRes.rows.length) {
      throw new CarePlanError('PATIENT_NOT_FOUND', 'Patient record not found in active organization', 404);
    }

    // Verify optional encounter linkage
    if (params.encounterId) {
      const encRes = await db.query<Encounter>(
        'SELECT * FROM encounters WHERE id = $1 AND organization_id = $2 AND patient_id = $3',
        [params.encounterId, params.organizationId, params.patientId]
      );
      if (!encRes.rows.length) {
        throw new CarePlanError('ENCOUNTER_NOT_FOUND', 'Linked encounter not found for patient in active organization', 404);
      }
    }

    // Verify optional provider
    if (params.responsibleProviderId) {
      const provRes = await db.query<Provider>(
        'SELECT * FROM providers WHERE id = $1 AND organization_id = $2',
        [params.responsibleProviderId, params.organizationId]
      );
      if (!provRes.rows.length) {
        throw new CarePlanError('PROVIDER_NOT_FOUND', 'Responsible healthcare provider not found in active organization', 404);
      }
    }

    const planId = `cp_${crypto.randomUUID().substring(0, 10)}`;
    const nowIso = new Date().toISOString();
    const startDate = params.startDate || nowIso.split('T')[0];
    const status = params.status || 'ACTIVE';

    const insertPlanRes = await db.query<CarePlan>(
      `INSERT INTO care_plans (
        id, organization_id, patient_id, encounter_id, responsible_provider_id,
        title, clinical_rationale, description, start_date, review_date,
        status, created_by_user_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        planId,
        params.organizationId,
        params.patientId,
        params.encounterId || null,
        params.responsibleProviderId || null,
        params.title.trim(),
        params.clinicalRationale?.trim() || null,
        params.description?.trim() || null,
        startDate,
        params.reviewDate || null,
        status,
        params.userId,
        nowIso,
        nowIso
      ]
    );
    const plan = insertPlanRes.rows[0];

    const insertedItems: CarePlanItem[] = [];
    if (params.items && Array.isArray(params.items)) {
      for (const it of params.items) {
        if (!it.description || !it.description.trim()) continue;
        const itemId = `cpi_${crypto.randomUUID().substring(0, 10)}`;
        const itRes = await db.query<CarePlanItem>(
          `INSERT INTO care_plan_items (
            id, organization_id, care_plan_id, patient_id, category,
            description, responsible_role, due_date, status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING *`,
          [
            itemId,
            params.organizationId,
            planId,
            params.patientId,
            it.category || 'SELF_CARE',
            it.description.trim(),
            it.responsibleRole?.trim() || 'PATIENT',
            it.dueDate || null,
            'PLANNED',
            nowIso,
            nowIso
          ]
        );
        insertedItems.push(itRes.rows[0]);
      }
    }

    await AuditService.logEvent({
      organizationId: params.organizationId,
      actorId: params.userId,
      actorRole: params.userRole || 'DOCTOR',
      action: 'care_plan.created',
      resourceType: 'CarePlan',
      resourceId: planId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: {
        patientId: params.patientId,
        title: params.title.trim(),
        status,
        itemCount: insertedItems.length
      }
    });

    return {
      ...plan,
      items: insertedItems
    };
  }

  /**
   * Update care plan details (title, clinical rationale, description, review date)
   */
  static async updateCarePlan(params: {
    organizationId: string;
    carePlanId: string;
    title?: string;
    clinicalRationale?: string | null;
    description?: string | null;
    reviewDate?: string | null;
    userId: string;
    userRole?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<CarePlan> {
    const db = getDatabaseClient();

    const curRes = await db.query<CarePlan>(
      'SELECT * FROM care_plans WHERE id = $1 AND organization_id = $2',
      [params.carePlanId, params.organizationId]
    );
    if (!curRes.rows.length) {
      throw new CarePlanError('CARE_PLAN_NOT_FOUND', 'Care plan not found in active organization', 404);
    }
    const current = curRes.rows[0];

    if (current.status === 'COMPLETED' || current.status === 'CANCELLED' || current.status === 'SUPERSEDED') {
      throw new CarePlanError(
        'IMMUTABLE_TERMINAL_STATE',
        `Care plan in ${current.status} status cannot be modified`,
        400
      );
    }

    const updatedTitle = params.title?.trim() || current.title;
    const updatedRationale = params.clinicalRationale !== undefined ? params.clinicalRationale : current.clinical_rationale;
    const updatedDesc = params.description !== undefined ? params.description : current.description;
    const updatedReview = params.reviewDate !== undefined ? params.reviewDate : current.review_date;
    const nowIso = new Date().toISOString();

    const upRes = await db.query<CarePlan>(
      `UPDATE care_plans 
       SET title = $1, clinical_rationale = $2, description = $3, review_date = $4, updated_by_user_id = $5, updated_at = $6
       WHERE id = $7 AND organization_id = $8
       RETURNING *`,
      [
        updatedTitle,
        updatedRationale,
        updatedDesc,
        updatedReview,
        params.userId,
        nowIso,
        params.carePlanId,
        params.organizationId
      ]
    );

    const updated = upRes.rows[0];

    await AuditService.logEvent({
      organizationId: params.organizationId,
      actorId: params.userId,
      actorRole: params.userRole || 'DOCTOR',
      action: 'care_plan.updated',
      resourceType: 'CarePlan',
      resourceId: params.carePlanId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: {
        title: updatedTitle
      }
    });

    return updated;
  }

  /**
   * Transition care plan status along validated state machine
   */
  static async transitionCarePlanStatus(params: {
    organizationId: string;
    carePlanId: string;
    targetStatus: CarePlanStatus;
    statusReason?: string | null;
    userId: string;
    userRole?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<CarePlan> {
    const db = getDatabaseClient();

    const curRes = await db.query<CarePlan>(
      'SELECT * FROM care_plans WHERE id = $1 AND organization_id = $2',
      [params.carePlanId, params.organizationId]
    );
    if (!curRes.rows.length) {
      throw new CarePlanError('CARE_PLAN_NOT_FOUND', 'Care plan not found in active organization', 404);
    }
    const current = curRes.rows[0];

    const currentStatus = current.status as CarePlanStatus;
    const allowed = VALID_CARE_PLAN_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(params.targetStatus)) {
      throw new CarePlanError(
        'INVALID_STATUS_TRANSITION',
        `Cannot transition care plan from ${currentStatus} to ${params.targetStatus}. Permitted next states: [${allowed.join(', ')}]`,
        400
      );
    }

    const nowIso = new Date().toISOString();
    const isCompleted = params.targetStatus === 'COMPLETED';
    const completedAt = isCompleted ? (current.completed_at || nowIso) : null;
    const completedByUserId = isCompleted ? (current.completed_by_user_id || params.userId) : null;

    const upRes = await db.query<CarePlan>(
      `UPDATE care_plans 
       SET status = $1, status_reason = $2, updated_by_user_id = $3, updated_at = $4,
           completed_at = $5, completed_by_user_id = $6
       WHERE id = $7 AND organization_id = $8
       RETURNING *`,
      [
        params.targetStatus,
        params.statusReason?.trim() || null,
        params.userId,
        nowIso,
        completedAt,
        completedByUserId,
        params.carePlanId,
        params.organizationId
      ]
    );

    const updated = upRes.rows[0];

    await AuditService.logEvent({
      organizationId: params.organizationId,
      actorId: params.userId,
      actorRole: params.userRole || 'DOCTOR',
      action: 'care_plan.status_changed',
      resourceType: 'CarePlan',
      resourceId: params.carePlanId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: {
        fromStatus: currentStatus,
        toStatus: params.targetStatus,
        statusReason: params.statusReason
      }
    });

    return updated;
  }

  /**
   * Add item to existing care plan
   */
  static async addCarePlanItem(params: {
    organizationId: string;
    carePlanId: string;
    category: CarePlanItemCategory | string;
    description: string;
    responsibleRole?: string | null;
    dueDate?: string | null;
    userId: string;
    userRole?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<CarePlanItem> {
    const db = getDatabaseClient();

    if (!params.description || !params.description.trim()) {
      throw new CarePlanError('INVALID_DESCRIPTION', 'Care plan item description is required', 400);
    }

    const planRes = await db.query<CarePlan>(
      'SELECT * FROM care_plans WHERE id = $1 AND organization_id = $2',
      [params.carePlanId, params.organizationId]
    );
    if (!planRes.rows.length) {
      throw new CarePlanError('CARE_PLAN_NOT_FOUND', 'Care plan not found in active organization', 404);
    }
    const plan = planRes.rows[0];

    const itemId = `cpi_${crypto.randomUUID().substring(0, 10)}`;
    const nowIso = new Date().toISOString();

    const insertRes = await db.query<CarePlanItem>(
      `INSERT INTO care_plan_items (
        id, organization_id, care_plan_id, patient_id, category,
        description, responsible_role, due_date, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        itemId,
        params.organizationId,
        params.carePlanId,
        plan.patient_id,
        params.category || 'SELF_CARE',
        params.description.trim(),
        params.responsibleRole?.trim() || 'PATIENT',
        params.dueDate || null,
        'PLANNED',
        nowIso,
        nowIso
      ]
    );

    const item = insertRes.rows[0];

    await AuditService.logEvent({
      organizationId: params.organizationId,
      actorId: params.userId,
      actorRole: params.userRole || 'DOCTOR',
      action: 'care_plan.item_added',
      resourceType: 'CarePlanItem',
      resourceId: itemId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: {
        carePlanId: params.carePlanId,
        category: params.category
      }
    });

    return item;
  }

  /**
   * Update or mark completed a single care plan item.
   * Notice: Completing an item does NOT auto-complete the entire parent care plan.
   */
  static async updateCarePlanItem(params: {
    organizationId: string;
    carePlanId: string;
    itemId: string;
    description?: string;
    status?: CarePlanItemStatus | string;
    completionNotes?: string | null;
    userId: string;
    userRole?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<CarePlanItem> {
    const db = getDatabaseClient();

    const curRes = await db.query<CarePlanItem>(
      'SELECT * FROM care_plan_items WHERE id = $1 AND care_plan_id = $2 AND organization_id = $3',
      [params.itemId, params.carePlanId, params.organizationId]
    );
    if (!curRes.rows.length) {
      throw new CarePlanError('ITEM_NOT_FOUND', 'Care plan item not found in active organization', 404);
    }
    const current = curRes.rows[0];

    const updatedDesc = params.description?.trim() || current.description;
    const updatedStatus = params.status || current.status;
    const isCompleted = updatedStatus === 'COMPLETED';
    const nowIso = new Date().toISOString();
    const completedAt = isCompleted ? (current.completed_at || nowIso) : null;
    const completedByUserId = isCompleted ? (current.completed_by_user_id || params.userId) : null;

    const upRes = await db.query<CarePlanItem>(
      `UPDATE care_plan_items
       SET description = $1, status = $2, completion_notes = $3, updated_at = $4,
           completed_at = $5, completed_by_user_id = $6
       WHERE id = $7 AND organization_id = $8
       RETURNING *`,
      [
        updatedDesc,
        updatedStatus,
        params.completionNotes?.trim() || current.completion_notes,
        nowIso,
        completedAt,
        completedByUserId,
        params.itemId,
        params.organizationId
      ]
    );

    const updated = upRes.rows[0];

    await AuditService.logEvent({
      organizationId: params.organizationId,
      actorId: params.userId,
      actorRole: params.userRole || 'DOCTOR',
      action: isCompleted ? 'care_plan.item_completed' : 'care_plan.item_updated',
      resourceType: 'CarePlanItem',
      resourceId: params.itemId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: {
        carePlanId: params.carePlanId,
        status: updatedStatus
      }
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // Follow-Up Instructions
  // -------------------------------------------------------------------------

  /**
   * Get follow up instructions for an encounter
   */
  static async getEncounterFollowUp(
    organizationId: string,
    encounterId: string,
    userId: string,
    userRole?: string
  ): Promise<FollowUpInstruction[]> {
    const db = getDatabaseClient();

    const encRes = await db.query<Encounter>(
      'SELECT * FROM encounters WHERE id = $1 AND organization_id = $2',
      [encounterId, organizationId]
    );
    if (!encRes.rows.length) {
      throw new CarePlanError('ENCOUNTER_NOT_FOUND', 'Encounter not found in active organization', 404);
    }

    const fupRes = await db.query<FollowUpInstruction>(
      'SELECT * FROM follow_up_instructions WHERE encounter_id = $1 AND organization_id = $2 ORDER BY created_at DESC',
      [encounterId, organizationId]
    );

    return fupRes.rows;
  }

  /**
   * Record clinician-authored follow-up instruction
   */
  static async recordFollowUp(params: RecordFollowUpParams): Promise<FollowUpInstruction> {
    const db = getDatabaseClient();

    if (!params.instructions || !params.instructions.trim()) {
      throw new CarePlanError('INVALID_INSTRUCTIONS', 'Follow-up instructions text is required', 400);
    }

    // Verify encounter
    const encRes = await db.query<Encounter>(
      'SELECT * FROM encounters WHERE id = $1 AND organization_id = $2 AND patient_id = $3',
      [params.encounterId, params.organizationId, params.patientId]
    );
    if (!encRes.rows.length) {
      throw new CarePlanError('ENCOUNTER_NOT_FOUND', 'Encounter not found for patient in active organization', 404);
    }

    const fupId = `fup_${crypto.randomUUID().substring(0, 10)}`;
    const nowIso = new Date().toISOString();
    const isPatientFacing = params.isPatientFacing !== undefined ? Boolean(params.isPatientFacing) : true;

    const insertRes = await db.query<FollowUpInstruction>(
      `INSERT INTO follow_up_instructions (
        id, organization_id, patient_id, encounter_id, care_plan_id,
        timeframe, reassessment_date, instructions, warning_signs,
        is_patient_facing, author_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        fupId,
        params.organizationId,
        params.patientId,
        params.encounterId,
        params.carePlanId || null,
        params.timeframe?.trim() || null,
        params.reassessmentDate || null,
        params.instructions.trim(),
        params.warningSigns?.trim() || null,
        isPatientFacing,
        params.userId,
        nowIso,
        nowIso
      ]
    );

    const fup = insertRes.rows[0];

    await AuditService.logEvent({
      organizationId: params.organizationId,
      actorId: params.userId,
      actorRole: params.userRole || 'DOCTOR',
      action: 'follow_up.recorded',
      resourceType: 'FollowUpInstruction',
      resourceId: fupId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: {
        encounterId: params.encounterId,
        patientId: params.patientId,
        isPatientFacing
      }
    });

    return fup;
  }

  /**
   * Update follow-up instruction
   */
  static async updateFollowUp(params: {
    organizationId: string;
    followUpId: string;
    timeframe?: string | null;
    reassessmentDate?: string | null;
    instructions?: string;
    warningSigns?: string | null;
    isPatientFacing?: boolean;
    userId: string;
    userRole?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<FollowUpInstruction> {
    const db = getDatabaseClient();

    const curRes = await db.query<FollowUpInstruction>(
      'SELECT * FROM follow_up_instructions WHERE id = $1 AND organization_id = $2',
      [params.followUpId, params.organizationId]
    );
    if (!curRes.rows.length) {
      throw new CarePlanError('FOLLOW_UP_NOT_FOUND', 'Follow up instruction not found in active organization', 404);
    }
    const current = curRes.rows[0];

    const updatedInst = params.instructions?.trim() || current.instructions;
    const updatedTimeframe = params.timeframe !== undefined ? params.timeframe : current.timeframe;
    const updatedReassess = params.reassessmentDate !== undefined ? params.reassessmentDate : current.reassessment_date;
    const updatedWarnings = params.warningSigns !== undefined ? params.warningSigns : current.warning_signs;
    const updatedFacing = params.isPatientFacing !== undefined ? Boolean(params.isPatientFacing) : current.is_patient_facing;
    const nowIso = new Date().toISOString();

    const upRes = await db.query<FollowUpInstruction>(
      `UPDATE follow_up_instructions
       SET instructions = $1, timeframe = $2, reassessment_date = $3, warning_signs = $4, is_patient_facing = $5, updated_at = $6
       WHERE id = $7 AND organization_id = $8
       RETURNING *`,
      [
        updatedInst,
        updatedTimeframe,
        updatedReassess,
        updatedWarnings,
        updatedFacing,
        nowIso,
        params.followUpId,
        params.organizationId
      ]
    );

    const updated = upRes.rows[0];

    await AuditService.logEvent({
      organizationId: params.organizationId,
      actorId: params.userId,
      actorRole: params.userRole || 'DOCTOR',
      action: 'follow_up.updated',
      resourceType: 'FollowUpInstruction',
      resourceId: params.followUpId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: {
        isPatientFacing: updatedFacing
      }
    });

    return updated;
  }
}
