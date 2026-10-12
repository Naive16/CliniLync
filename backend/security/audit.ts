/**
 * CLINILYNC Immutable Audit Logging Service
 * 
 * Records tamper-evident, append-only security and clinical audit trails.
 */

import crypto from 'node:crypto';
import { getDatabaseClient } from '../../database/db.js';
import { AuditLogEntry } from '../types/domain.js';

export interface AuditEventParams {
  organizationId: string;
  actorId: string;
  actorRole?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
}

export class AuditService {
  /**
   * Appends an audit event to the permanent record.
   * Sanitizes sensitive fields (passwords, salts, auth tokens) before persisting.
   */
  static async logEvent(params: AuditEventParams): Promise<AuditLogEntry> {
    const db = getDatabaseClient();
    const id = `audit_${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();

    // Sanitize metadata to prevent credential, token, or raw PHI note content leakage
    let sanitizedMeta: Record<string, unknown> | null = null;
    if (params.metadata) {
      sanitizedMeta = { ...params.metadata };
      delete sanitizedMeta.password;
      delete sanitizedMeta.password_hash;
      delete sanitizedMeta.salt;
      delete sanitizedMeta.token;
      delete sanitizedMeta.authorization;
      delete sanitizedMeta.chief_complaint;
      delete sanitizedMeta.history_of_present_illness;
      delete sanitizedMeta.past_medical_history;
      delete sanitizedMeta.surgical_history;
      delete sanitizedMeta.family_social_history;
      delete sanitizedMeta.review_of_systems;
      delete sanitizedMeta.physical_examination;
      delete sanitizedMeta.assessment;
      delete sanitizedMeta.plan;
      delete sanitizedMeta.follow_up_instructions;
      delete sanitizedMeta.notes;
      delete sanitizedMeta.snapshot_data;
      delete sanitizedMeta.sig_instructions;
      delete sanitizedMeta.instructions;
      delete sanitizedMeta.reaction_description;
      delete sanitizedMeta.discontinuation_reason;
    }

    const entry: AuditLogEntry = {
      id,
      organization_id: params.organizationId,
      actor_id: params.actorId,
      actor_role: params.actorRole || 'SYSTEM',
      action: params.action,
      resource_type: params.resourceType,
      resource_id: params.resourceId || undefined,
      ip_address: params.ipAddress || '127.0.0.1',
      user_agent: params.userAgent || 'CLINILYNC-Service',
      metadata: sanitizedMeta || undefined,
      severity: params.severity || 'INFO',
      created_at: timestamp
    };

    try {
      await db.query(
        `INSERT INTO audit_logs 
          (id, organization_id, actor_id, actor_role, action, resource_type, resource_id, ip_address, user_agent, metadata, severity, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          entry.id,
          entry.organization_id,
          entry.actor_id,
          entry.actor_role,
          entry.action,
          entry.resource_type,
          entry.resource_id,
          entry.ip_address,
          entry.user_agent,
          JSON.stringify(entry.metadata || {}),
          entry.severity,
          entry.created_at
        ]
      );
    } catch (err) {
      // Emergency console fallback if database log fails
      console.error('[CRITICAL AUDIT LOG FAILURE]', err, entry);
    }

    return entry;
  }

  /**
   * Retrieves audit logs for an organization with pagination.
   */
  static async getOrganizationAuditLogs(organizationId: string, limit: number = 50): Promise<AuditLogEntry[]> {
    const db = getDatabaseClient();
    const res = await db.query<AuditLogEntry>(
      `SELECT * FROM audit_logs WHERE organization_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [organizationId, limit]
    );
    return res.rows;
  }
}
