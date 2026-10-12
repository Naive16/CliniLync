/**
 * CLINILYNC RBAC Permission Middleware
 * 
 * Enforces declarative permission gates on API routes.
 */

import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';
import { RBACService } from '../security/rbac.js';
import { AuditService } from '../security/audit.js';

export function requirePermission(permission: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const context = req.securityContext;

    if (!context) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Security context missing'
        }
      });
      return;
    }

    if (!RBACService.hasPermission(context, permission)) {
      AuditService.logEvent({
        organizationId: context.activeOrganization.id,
        actorId: context.user.id,
        actorRole: context.roles.map(r => r.code).join(','),
        action: 'security.permission_denied',
        resourceType: 'Permission',
        resourceId: permission,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        metadata: {
          missingPermission: permission,
          userRoles: context.roles.map(r => r.code),
          path: req.originalUrl
        },
        severity: 'WARNING'
      });

      res.status(403).json({
        error: {
          code: 'FORBIDDEN_INSUFFICIENT_PERMISSIONS',
          message: `Access denied: Missing required permission '${permission}'`
        }
      });
      return;
    }

    next();
  };
}

export function requireAnyPermission(permissions: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const context = req.securityContext;

    if (!context) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Security context missing'
        }
      });
      return;
    }

    if (!RBACService.hasAnyPermission(context, permissions)) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN_INSUFFICIENT_PERMISSIONS',
          message: `Access denied: Requires at least one of [${permissions.join(', ')}]`
        }
      });
      return;
    }

    next();
  };
}
