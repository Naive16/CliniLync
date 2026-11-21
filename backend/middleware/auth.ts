/**
 * CLINILYNC Authentication Middleware
 * 
 * Validates session tokens, loads user roles and organization memberships,
 * and attaches a typed SecurityContext to the Express request.
 */

import { Request, Response, NextFunction } from 'express';
import { sessionManager, hashSessionToken } from '../security/session.js';
import { getDatabaseClient } from '../../database/db.js';
import { SecurityContext, Role, Organization, User } from '../types/domain.js';
import { AuditService } from '../security/audit.js';

export interface AuthenticatedRequest extends Request {
  securityContext?: SecurityContext;
}

export async function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token && req.cookies && req.cookies.clinilync_session) {
    token = req.cookies.clinilync_session;
  }

  if (!token) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED_NO_TOKEN',
        message: 'Authentication token required'
      }
    });
    return;
  }

  try {
    const db = getDatabaseClient();
    const now = new Date();
    const nowIso = now.toISOString();
    const idleCutoff = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    const refreshCutoff = new Date(now.getTime() - 60 * 1000).toISOString();

    // Resolve session, user, organization, memberships, roles and permissions
    // in one database round-trip rather than sequential queries on every API call.
    const access = await db.query<any>(
      `WITH session_row AS MATERIALIZED (
         SELECT token_hash, user_id, active_organization_id, last_active_at
         FROM sessions
         WHERE token_hash = $1
           AND revoked_at IS NULL
           AND expires_at > $2
           AND last_active_at > $3
       ),
       touched AS (
         UPDATE sessions AS s
         SET last_active_at = $2
         FROM session_row AS sr
         WHERE s.token_hash = sr.token_hash
           AND sr.last_active_at < $4
         RETURNING s.token_hash
       )
       SELECT
         sr.user_id AS session_user_id,
         sr.active_organization_id,
         u.id AS auth_user_id,
         u.email AS auth_email,
         u.first_name AS auth_first_name,
         u.last_name AS auth_last_name,
         u.is_super_admin AS auth_is_super_admin,
         u.status AS auth_user_status,
         o.*,
         uo.id AS membership_id,
         uo.status AS membership_status,
         r.id AS joined_role_id,
         r.name AS joined_role_name,
         r.code AS joined_role_code,
         r.description AS joined_role_description,
         r.is_system_role AS joined_role_is_system_role,
         r.created_at AS joined_role_created_at,
         p.code AS permission_code
       FROM session_row AS sr
       LEFT JOIN touched AS t ON t.token_hash = sr.token_hash
       LEFT JOIN users AS u ON u.id = sr.user_id
       LEFT JOIN organizations AS o ON o.id = sr.active_organization_id
       LEFT JOIN user_organizations AS uo
         ON uo.user_id = sr.user_id AND uo.organization_id = sr.active_organization_id
       LEFT JOIN roles AS r ON r.id = uo.role_id
       LEFT JOIN role_permissions AS rp ON rp.role_id = r.id
       LEFT JOIN permissions AS p ON p.id = rp.permission_id`,
      [hashSessionToken(token), nowIso, idleCutoff, refreshCutoff]
    );

    const first = access.rows[0];
    if (!first) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED_SESSION_EXPIRED',
          message: 'Session has expired or is invalid. Please sign in again.'
        }
      });
      return;
    }

    if (!first.auth_user_id || first.auth_user_status !== 'ACTIVE') {
      await sessionManager.invalidateSessionAsync(token);
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED_USER_DISABLED',
          message: 'User account is inactive or disabled'
        }
      });
      return;
    }

    if (!first.id || first.is_active !== true) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN_ORGANIZATION_INACTIVE',
          message: 'Requested organization is inactive or does not exist'
        }
      });
      return;
    }

    if (!first.membership_id) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN_NOT_A_MEMBER',
          message: 'You are not a member of this organization'
        }
      });
      return;
    }

    if (first.membership_status !== 'ACTIVE') {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN_MEMBERSHIP_INACTIVE',
          message: 'Your membership in this organization is ' + String(first.membership_status || '').toLowerCase() + '. Access denied.'
        }
      });
      return;
    }

    const rolesById = new Map<string, Role>();
    const permissionSet = new Set<string>();
    for (const row of access.rows) {
      if (row.joined_role_id && !rolesById.has(row.joined_role_id)) {
        rolesById.set(row.joined_role_id, {
          id: row.joined_role_id,
          name: row.joined_role_name || '',
          code: row.joined_role_code || '',
          description: row.joined_role_description || undefined,
          is_system_role: Boolean(row.joined_role_is_system_role),
          created_at: row.joined_role_created_at || ''
        });
      }
      if (row.permission_code) permissionSet.add(row.permission_code);
    }

    const roles = Array.from(rolesById.values());
    const organization = first as unknown as Organization;
    const context: SecurityContext = {
      user: {
        id: first.auth_user_id,
        email: first.auth_email || '',
        firstName: first.auth_first_name || '',
        lastName: first.auth_last_name || '',
        isSuperAdmin: Boolean(first.auth_is_super_admin)
      },
      activeOrganization: organization,
      roles,
      permissions: Array.from(permissionSet),
      sessionToken: token,
      membership: {
        id: first.membership_id,
        role: roles[0]?.code || 'MEMBER',
        status: 'ACTIVE'
      }
    };

    sessionManager.cacheContext(token, context);
    req.securityContext = context;

    const onboardingRoute = req.originalUrl.startsWith('/api/v1/onboarding');
    const sessionOrTenantRoute = req.originalUrl.startsWith('/api/v1/auth')
      || req.originalUrl.startsWith('/api/v1/me')
      || req.originalUrl.startsWith('/api/v1/organizations');
    if (organization.onboarding_status && organization.onboarding_status !== 'ACTIVE' && !onboardingRoute && !sessionOrTenantRoute) {
      res.status(423).json({
        error: {
          code: 'ONBOARDING_INCOMPLETE',
          message: 'Clinic setup is not complete. Finish onboarding before opening the workspace.',
        },
      });
      return;
    }
    next();
  } catch (err) {
    console.error('Error hydrating security context:', err);
    res.status(500).json({
      error: {
        code: 'INTERNAL_SECURITY_ERROR',
        message: 'Failed to verify authorization state'
      }
    });
  }
}

/**
 * Account-type boundaries are enforced server-side in addition to frontend
 * route guards. A PATIENT role is never treated as a clinic staff role.
 */
export function requireStaffAccount(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const context = req.securityContext;
  if (!context) {
    void authenticateToken(req, res, () => requireStaffAccount(req, res, next));
    return;
  }

  if (context.roles.some((role) => role.code === 'PATIENT')) {
    res.status(403).json({ error: { code: 'STAFF_ACCOUNT_REQUIRED', message: 'This resource is available to clinic staff accounts only.' } });
    return;
  }

  next();
}

export function requirePatientAccount(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const context = req.securityContext;
  if (!context) {
    void authenticateToken(req, res, () => requirePatientAccount(req, res, next));
    return;
  }

  if (!context.roles.some((role) => role.code === 'PATIENT')) {
    res.status(403).json({ error: { code: 'PATIENT_ACCOUNT_REQUIRED', message: 'This resource is available to verified patient accounts only.' } });
    return;
  }

  next();
}

/**
 * Middleware factory enforcing that the authenticated user possesses the specified permission.
 */
export function requirePermission(permission: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const context = req.securityContext;
    if (!context) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
      });
      return;
    }

    if (!context.permissions.includes(permission)) {
      AuditService.logEvent({
        organizationId: context.activeOrganization.id,
        actorId: context.user.id,
        action: 'security.permission_denied',
        resourceType: 'Permission',
        resourceId: permission,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        metadata: { requiredPermission: permission, userRoles: context.roles.map(r => r.code) },
        severity: 'WARNING'
      });

      res.status(403).json({
        error: {
          code: 'FORBIDDEN_PERMISSION_DENIED',
          message: `You do not have permission to perform this action (${permission}).`
        }
      });
      return;
    }

    next();
  };
}

/**
 * Middleware enforcing that any organization parameter strictly matches the caller's active organization.
 */
export function requireOrganizationAccess(paramName: string = 'organizationId') {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const context = req.securityContext;
    if (!context) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    const targetOrgId = req.params[paramName] || req.body[paramName] || req.query[paramName];
    if (targetOrgId && targetOrgId !== context.activeOrganization.id) {
      AuditService.logEvent({
        organizationId: context.activeOrganization.id,
        actorId: context.user.id,
        action: 'security.cross_tenant_access_denied',
        resourceType: 'Organization',
        resourceId: String(targetOrgId),
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        metadata: { targetOrgId, currentOrgId: context.activeOrganization.id },
        severity: 'WARNING'
      });

      res.status(403).json({
        error: {
          code: 'FORBIDDEN_CROSS_TENANT_ACCESS',
          message: 'Cross-organization access is strictly forbidden.'
        }
      });
      return;
    }

    next();
  };
}
