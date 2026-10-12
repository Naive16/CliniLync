/**
 * CLINILYNC Authentication Middleware
 * 
 * Validates session tokens, loads user roles and organization memberships,
 * and attaches a typed SecurityContext to the Express request.
 */

import { Request, Response, NextFunction } from 'express';
import { sessionManager } from '../security/session.js';
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

  const session = await sessionManager.getSessionAsync(token);
  if (!session) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED_SESSION_EXPIRED',
        message: 'Session has expired or is invalid. Please sign in again.'
      }
    });
    return;
  }

  try {
    const db = getDatabaseClient();

    // 1. Fetch user
    const userRes = await db.query<User>(
      'SELECT id, email, first_name, last_name, is_super_admin, status FROM users WHERE id = $1',
      [session.userId]
    );

    if (userRes.rows.length === 0 || userRes.rows[0].status !== 'ACTIVE') {
      await sessionManager.invalidateSessionAsync(token);
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED_USER_DISABLED',
          message: 'User account is inactive or disabled'
        }
      });
      return;
    }

    const user = userRes.rows[0];

    // 2. Fetch active organization
    const orgRes = await db.query<Organization>(
      'SELECT * FROM organizations WHERE id = $1 AND is_active = TRUE',
      [session.activeOrganizationId]
    );

    if (orgRes.rows.length === 0) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN_ORGANIZATION_INACTIVE',
          message: 'Requested organization is inactive or does not exist'
        }
      });
      return;
    }

    const organization = orgRes.rows[0];

    // 3. Verify user's membership and status in the active organization
    let roles: Role[] = [];
    let permissionCodes: string[] = [];

    if (false) { // Platform administration never implies organization or clinical permissions
      // Super Admin gets all permissions
      const allPerms = await db.query<{ code: string }>('SELECT code FROM permissions');
      permissionCodes = allPerms.rows.map(p => p.code);
      roles = [{
        id: 'role_super_admin',
        name: 'SUPER ADMIN',
        code: 'SUPER_ADMIN',
        is_system_role: true,
        created_at: new Date().toISOString()
      }];
    } else {
      const checkStatusRes = await db.query<{ role_id: string; status: string }>(
        'SELECT role_id, status FROM user_organizations WHERE user_id = $1 AND organization_id = $2',
        [user.id, organization.id]
      );

      if (checkStatusRes.rows.length === 0) {
        res.status(403).json({
          error: {
            code: 'FORBIDDEN_NOT_A_MEMBER',
            message: 'You are not a member of this organization'
          }
        });
        return;
      }

      const membership = checkStatusRes.rows[0];
      if (membership.status !== 'ACTIVE') {
        res.status(403).json({
          error: {
            code: 'FORBIDDEN_MEMBERSHIP_INACTIVE',
            message: `Your membership in this organization is ${membership.status.toLowerCase()}. Access denied.`
          }
        });
        return;
      }

      const roleIds = checkStatusRes.rows.map(r => r.role_id);
      if (roleIds.length > 0) {
        for (const rid of roleIds) {
          const rRes = await db.query<Role>('SELECT * FROM roles WHERE id = $1', [rid]);
          if (rRes.rows[0]) roles.push(rRes.rows[0]);

          const rpRes = await db.query<{ permission_id: string }>(
            'SELECT permission_id FROM role_permissions WHERE role_id = $1',
            [rid]
          );
          for (const rp of rpRes.rows) {
            const pRes = await db.query<{ code: string }>('SELECT code FROM permissions WHERE id = $1', [rp.permission_id]);
            if (pRes.rows[0] && !permissionCodes.includes(pRes.rows[0].code)) {
              permissionCodes.push(pRes.rows[0].code);
            }
          }
        }
      }
    }

    const context: SecurityContext = {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        isSuperAdmin: user.is_super_admin
      },
      activeOrganization: organization,
      roles,
      permissions: permissionCodes,
      sessionToken: token,
      membership: {
        role: roles[0]?.code || 'MEMBER',
        status: 'ACTIVE'
      }
    };

    sessionManager.cacheContext(token, context);
    req.securityContext = context;
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
