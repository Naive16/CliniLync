/**
 * CLINILYNC Versioned Security & Diagnostic Router (v1)
 * 
 * Demonstrates centralized authorization enforcement, multi-tenancy verification,
 * and immutable audit trail inspection without exposing PHI or sensitive credentials.
 */

import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest, requirePermission } from '../../middleware/auth.js';
import { AuthorizationService } from '../../security/authorization.js';
import { AuditService } from '../../security/audit.js';
import { Permissions, RolePermissionsMap, SystemRoles } from '../../security/permissions.js';

export const v1DiagnosticRouter = Router();

v1DiagnosticRouter.use(authenticateToken);

/**
 * POST /api/v1/diagnostic/verify-access
 * 
 * Verifies whether the authenticated caller is authorized to perform an action requiring
 * a specific permission within a target organization.
 * 
 * Returns HTTP 200 when authorized, or HTTP 403 Forbidden with security error code.
 */
v1DiagnosticRouter.post('/verify-access', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { permission, organizationId, resource } = req.body;
  const requestId = (req.headers['x-request-id'] as string) || `req_${Date.now()}`;

  const targetOrg = organizationId || context.activeOrganization.id;

  const result = await AuthorizationService.authorize({
    user: context.user,
    organizationId: targetOrg,
    permission,
    resource,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  if (!result.allowed) {
    res.status(403).json({
      error: {
        code: result.code || 'FORBIDDEN_PERMISSION_DENIED',
        message: result.reason || 'Access denied by authorization policy.'
      }
    });
    return;
  }

  res.status(200).json({
    data: {
      authorized: true,
      permission: permission || 'None specified (membership check only)',
      organizationId: targetOrg,
      evaluatedRole: result.evaluatedRole,
      membershipStatus: result.membershipStatus
    },
    meta: {
      requestId,
      timestamp: new Date().toISOString()
    }
  });
});

/**
 * GET /api/v1/diagnostic/audit-trail
 * 
 * Returns immutable server-side audit logs for the caller's organization.
 * Strictly protected by the 'audit.view' permission.
 */
v1DiagnosticRouter.get('/audit-trail', requirePermission(Permissions.AUDIT_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const requestId = (req.headers['x-request-id'] as string) || `req_${Date.now()}`;
  const limit = Math.min(Number(req.query.limit) || 25, 100);

  const logs = await AuditService.getOrganizationAuditLogs(context.activeOrganization.id, limit);

  res.status(200).json({
    data: {
      auditLogs: logs
    },
    meta: {
      count: logs.length,
      organizationId: context.activeOrganization.id,
      requestId,
      timestamp: new Date().toISOString()
    }
  });
});

/**
 * GET /api/v1/diagnostic/permissions-matrix
 * 
 * Returns the centralized role-permission registry definition for system verification.
 */
v1DiagnosticRouter.get('/permissions-matrix', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const requestId = (req.headers['x-request-id'] as string) || `req_${Date.now()}`;

  res.status(200).json({
    data: {
      roles: SystemRoles,
      permissions: Permissions,
      matrix: RolePermissionsMap
    },
    meta: {
      requestId,
      timestamp: new Date().toISOString()
    }
  });
});
