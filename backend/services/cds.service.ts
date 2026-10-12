/**
 * CLINILYNC Clinical Decision Support (CDS) Foundations Service
 * 
 * Strict Safety Guidelines & Compliance:
 * 1. Strictly clinician-reviewed; never autonomous or AI-generated diagnosis/prescriptions.
 * 2. Unapproved rules cannot generate active clinical alerts.
 * 3. Does not automatically mutate any diagnosis, problem list, or care plan.
 * 4. Transparent evidence references and human-readable explanations.
 * 5. Multi-tenant isolation and append-only sanitized audit logging.
 */

import crypto from 'node:crypto';
import { getDatabaseClient } from '../../database/db.js';
import {
  ClinicalRule,
  ClinicalAlert,
  ClinicalAlertReviewStatus,
  ClinicalRuleStatus,
  Patient,
  Encounter
} from '../types/domain.js';
import { AuditService } from '../security/audit.js';

export class CDSError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = 'CDSError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class CDSService {
  /**
   * Get clinical decision support rules for organization
   */
  static async getClinicalRules(
    organizationId: string,
    userId: string,
    userRole?: string
  ): Promise<ClinicalRule[]> {
    const db = getDatabaseClient();

    const rulesRes = await db.query<ClinicalRule>(
      'SELECT * FROM clinical_rules WHERE organization_id = $1 ORDER BY created_at DESC',
      [organizationId]
    );

    return rulesRes.rows;
  }

  /**
   * Toggle clinical rule status (DISABLED, TESTING, ACTIVE)
   * Strictly gated to CLINICAL_DIRECTOR / clinical_rule.manage
   */
  static async toggleRuleStatus(params: {
    organizationId: string;
    ruleId: string;
    targetStatus: ClinicalRuleStatus;
    userId: string;
    userRole?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<ClinicalRule> {
    const db = getDatabaseClient();

    const ruleRes = await db.query<ClinicalRule>(
      'SELECT * FROM clinical_rules WHERE id = $1 AND organization_id = $2',
      [params.ruleId, params.organizationId]
    );
    if (!ruleRes.rows.length) {
      throw new CDSError('RULE_NOT_FOUND', 'Clinical rule not found in active organization', 404);
    }

    const nowIso = new Date().toISOString();
    const isActive = params.targetStatus === 'ACTIVE';
    const activatedAt = isActive ? nowIso : null;
    const activatedByUserId = isActive ? params.userId : null;

    const upRes = await db.query<ClinicalRule>(
      `UPDATE clinical_rules
       SET rule_status = $1, updated_at = $2, activated_at = $3, activated_by_user_id = $4
       WHERE id = $5 AND organization_id = $6
       RETURNING *`,
      [
        params.targetStatus,
        nowIso,
        activatedAt,
        activatedByUserId,
        params.ruleId,
        params.organizationId
      ]
    );

    const updated = upRes.rows[0];

    await AuditService.logEvent({
      organizationId: params.organizationId,
      actorId: params.userId,
      actorRole: params.userRole || 'CLINICAL_DIRECTOR',
      action: isActive ? 'clinical_rule.activated' : 'clinical_rule.deactivated',
      resourceType: 'ClinicalRule',
      resourceId: params.ruleId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: {
        targetStatus: params.targetStatus
      }
    });

    return updated;
  }

  /**
   * Get evaluated clinical alerts
   */
  static async getClinicalAlerts(params: {
    organizationId: string;
    patientId?: string | null;
    encounterId?: string | null;
    userId: string;
    userRole?: string;
  }): Promise<ClinicalAlert[]> {
    const db = getDatabaseClient();

    let sql = 'SELECT * FROM clinical_alerts WHERE organization_id = $1';
    const queryParams: unknown[] = [params.organizationId];

    if (params.patientId) {
      sql += ' AND patient_id = $2';
      queryParams.push(params.patientId);
    } else if (params.encounterId) {
      sql += ' AND encounter_id = $2';
      queryParams.push(params.encounterId);
    }

    sql += ' ORDER BY created_at DESC';

    const alertsRes = await db.query<ClinicalAlert>(sql, queryParams);
    return alertsRes.rows;
  }

  /**
   * Get single clinical alert
   */
  static async getClinicalAlertById(
    organizationId: string,
    alertId: string,
    userId: string,
    userRole?: string
  ): Promise<ClinicalAlert> {
    const db = getDatabaseClient();

    const alertRes = await db.query<ClinicalAlert>(
      'SELECT * FROM clinical_alerts WHERE id = $1 AND organization_id = $2',
      [alertId, organizationId]
    );
    if (!alertRes.rows.length) {
      throw new CDSError('ALERT_NOT_FOUND', 'Clinical alert not found in active organization', 404);
    }

    return alertRes.rows[0];
  }

  /**
   * Review clinical alert (Clinician review action: ACKNOWLEDGED, DISMISSED, ACTION_TAKEN)
   */
  static async reviewClinicalAlert(params: {
    organizationId: string;
    alertId: string;
    reviewStatus: ClinicalAlertReviewStatus;
    reviewNotes?: string | null;
    userId: string;
    userRole?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<ClinicalAlert> {
    const db = getDatabaseClient();

    const alertRes = await db.query<ClinicalAlert>(
      'SELECT * FROM clinical_alerts WHERE id = $1 AND organization_id = $2',
      [params.alertId, params.organizationId]
    );
    if (!alertRes.rows.length) {
      throw new CDSError('ALERT_NOT_FOUND', 'Clinical alert not found in active organization', 404);
    }

    const nowIso = new Date().toISOString();

    const upRes = await db.query<ClinicalAlert>(
      `UPDATE clinical_alerts
       SET review_status = $1, reviewed_by_user_id = $2, reviewed_at = $3, review_notes = $4
       WHERE id = $5 AND organization_id = $6
       RETURNING *`,
      [
        params.reviewStatus,
        params.userId,
        nowIso,
        params.reviewNotes?.trim() || null,
        params.alertId,
        params.organizationId
      ]
    );

    const updated = upRes.rows[0];

    await AuditService.logEvent({
      organizationId: params.organizationId,
      actorId: params.userId,
      actorRole: params.userRole || 'DOCTOR',
      action: 'clinical_alert.reviewed',
      resourceType: 'ClinicalAlert',
      resourceId: params.alertId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: {
        reviewStatus: params.reviewStatus,
        hasNotes: Boolean(params.reviewNotes)
      }
    });

    return updated;
  }
}
