/**
 * CLINILYNC Centralized Authorization Engine
 * 
 * Conceptually: authorize(user, organization, permission, resource)
 * Evaluates:
 * 1. Authenticated user identity
 * 2. Active session & security context
 * 3. Organization membership in the target organization
 * 4. Membership status (ACTIVE vs SUSPENDED / REVOKED)
 * 5. Role and permission assignments in that specific organization
 * 6. Target organization data isolation boundary
 * 7. Resource relationship & RLAC constraints
 * 8. Audit event logging on access denials
 */

import { getDatabaseClient } from '../../database/db.js';
import { SecurityContext, Role } from '../types/domain.js';
import { AuditService } from './audit.js';
import { ResourceAccessService, ResourceAuthorizationRequest } from './resource-access.js';

export interface AuthorizationEvaluationRequest {
  user: {
    id: string;
    email: string;
    isSuperAdmin?: boolean;
  };
  organizationId: string;
  permission?: string;
  resource?: {
    type: 'Patient' | 'ClinicalRecord' | 'Appointment' | 'Invoice' | 'LabResult' | 'Organization' | 'User';
    id: string;
    organizationId?: string;
    patientId?: string;
    providerId?: string;
    isReleasedToPatient?: boolean;
  };
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthorizationResult {
  allowed: boolean;
  code?: string;
  reason?: string;
  evaluatedRole?: string;
  membershipStatus?: string;
}

export class AuthorizationService {
  /**
   * Evaluates authorization for a user against a target organization, permission, and optional resource.
   */
  static async authorize(req: AuthorizationEvaluationRequest): Promise<AuthorizationResult> {
    const { user, organizationId, permission, resource } = req;

    if (!user || !user.id) {
      return {
        allowed: false,
        code: 'UNAUTHENTICATED',
        reason: 'Valid authenticated user context required'
      };
    }

    if (!organizationId) {
      return {
        allowed: false,
        code: 'BAD_REQUEST_NO_ORGANIZATION',
        reason: 'Target organization context is required'
      };
    }

    const db = getDatabaseClient();

    // Platform administrator status does not bypass organization membership or clinical permissions.
    // Organization Membership Verification
    const membershipRes = await db.query<{ role_id: string; status: string }>(
      'SELECT role_id, status FROM user_organizations WHERE user_id = $1 AND organization_id = $2',
      [user.id, organizationId]
    );

    if (membershipRes.rows.length === 0) {
      await this.logAuthorizationDenial(req, 'FORBIDDEN_NOT_A_MEMBER', 'User is not a member of the target organization');
      return {
        allowed: false,
        code: 'FORBIDDEN_NOT_A_MEMBER',
        reason: 'User is not an authorized member of this organization'
      };
    }

    const membership = membershipRes.rows[0];

    // Membership Status Verification (Ensure membership has not been suspended/revoked)
    if (membership.status !== 'ACTIVE') {
      await this.logAuthorizationDenial(
        req,
        'FORBIDDEN_MEMBERSHIP_INACTIVE',
        `Organization membership is ${membership.status}`
      );
      return {
        allowed: false,
        code: 'FORBIDDEN_MEMBERSHIP_INACTIVE',
        reason: `Organization membership is ${membership.status.toLowerCase()}. Access denied.`,
        membershipStatus: membership.status
      };
    }

    // Role & Permission Verification
    const roleId = membership.role_id;
    const roleRes = await db.query<Role>('SELECT * FROM roles WHERE id = $1', [roleId]);
    const role = roleRes.rows[0];

    // Fetch permission codes granted to this role
    let grantedPermissions: string[] = [];
    const rpRes = await db.query<{ permission_id: string }>(
      'SELECT permission_id FROM role_permissions WHERE role_id = $1',
      [roleId]
    );

    for (const rp of rpRes.rows) {
      const pRes = await db.query<{ code: string }>('SELECT code FROM permissions WHERE id = $1', [rp.permission_id]);
      if (pRes.rows[0] && !grantedPermissions.includes(pRes.rows[0].code)) {
        grantedPermissions.push(pRes.rows[0].code);
      }
    }

    if (permission) {
      if (!grantedPermissions.includes(permission)) {
        await this.logAuthorizationDenial(
          req,
          'FORBIDDEN_PERMISSION_DENIED',
          `Role '${role?.code || roleId}' lacks permission '${permission}'`
        );
        return {
          allowed: false,
          code: 'FORBIDDEN_PERMISSION_DENIED',
          reason: `You do not have the required permission (${permission}) to perform this action.`,
          evaluatedRole: role?.code,
          membershipStatus: 'ACTIVE'
        };
      }
    }

    // Resource-Level and Tenant Isolation Evaluation
    if (resource) {
      // Validate resource belongs to target organization
      if (resource.organizationId && resource.organizationId !== organizationId) {
        await this.logAuthorizationDenial(
          req,
          'FORBIDDEN_TENANT_ISOLATION_VIOLATION',
          `Resource org (${resource.organizationId}) does not match authorized org (${organizationId})`
        );
        return {
          allowed: false,
          code: 'FORBIDDEN_TENANT_ISOLATION_VIOLATION',
          reason: 'Cross-organization resource access is strictly prohibited.'
        };
      }

      // If the resource is one governed by RLAC, invoke ResourceAccessService
      if (['Patient', 'ClinicalRecord', 'Appointment', 'Invoice', 'LabResult'].includes(resource.type)) {
        const dummyContext: SecurityContext = {
          user: {
            id: user.id,
            email: user.email,
            firstName: '',
            lastName: '',
            isSuperAdmin: false
          },
          activeOrganization: {
            id: organizationId,
            name: '',
            slug: '',
            country_code: '',
            currency_code: '',
            timezone: '',
            is_active: true,
            created_at: '',
            updated_at: ''
          },
          roles: role ? [role] : [],
          permissions: grantedPermissions,
          sessionToken: ''
        };

        const rlacVerdict = ResourceAccessService.canAccessResource({
          context: dummyContext,
          resourceType: resource.type as 'Patient' | 'ClinicalRecord' | 'Appointment' | 'Invoice' | 'LabResult',
          resourceId: resource.id,
          resourceOrganizationId: resource.organizationId || organizationId,
          patientId: resource.patientId,
          providerId: resource.providerId,
          isReleasedToPatient: resource.isReleasedToPatient
        });

        if (!rlacVerdict.allowed) {
          await this.logAuthorizationDenial(
            req,
            'FORBIDDEN_RESOURCE_ACCESS_DENIED',
            rlacVerdict.reason || 'Resource access denied'
          );
          return {
            allowed: false,
            code: 'FORBIDDEN_RESOURCE_ACCESS_DENIED',
            reason: rlacVerdict.reason || 'Access to this specific resource was denied by policy.',
            evaluatedRole: role?.code,
            membershipStatus: 'ACTIVE'
          };
        }
      }
    }

    return {
      allowed: true,
      evaluatedRole: role?.code,
      membershipStatus: 'ACTIVE'
    };
  }

  /**
   * Asserts authorization, throwing an error with HTTP status 403 if denied.
   */
  static async assertAuthorized(req: AuthorizationEvaluationRequest): Promise<AuthorizationResult> {
    const verdict = await this.authorize(req);
    if (!verdict.allowed) {
      const err = new Error(verdict.reason || 'Forbidden: Access denied');
      (err as unknown as { status: number; code: string }).status = 403;
      (err as unknown as { status: number; code: string }).code = verdict.code || 'FORBIDDEN';
      throw err;
    }
    return verdict;
  }

  /**
   * Fast permission evaluation against an authenticated SecurityContext
   */
  static hasPermission(context: SecurityContext, permission: string): boolean {
    return context.permissions.includes(permission);
  }

  private static async logAuthorizationDenial(
    req: AuthorizationEvaluationRequest,
    code: string,
    reason: string
  ): Promise<void> {
    try {
      await AuditService.logEvent({
        organizationId: req.organizationId,
        actorId: req.user.id,
        action: 'security.authorization_denied',
        resourceType: req.resource?.type || 'Authorization',
        resourceId: req.resource?.id || req.permission || req.organizationId,
        ipAddress: req.ipAddress || '127.0.0.1',
        userAgent: req.userAgent || 'CLINILYNC-Service',
        metadata: {
          code,
          reason,
          permission: req.permission,
          userEmail: req.user.email
        },
        severity: 'WARNING'
      });
    } catch (err) {
      console.error('[AUDIT DENIAL LOG ERROR]', err);
    }
  }
}
