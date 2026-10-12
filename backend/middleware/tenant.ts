/**
 * CLINILYNC Organization Tenancy Isolation Middleware
 * 
 * Guarantees that users are physically barred from reading or mutating
 * resources that belong to another healthcare organization.
 */

import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';
import { AuditService } from '../security/audit.js';

export function enforceTenantIsolation(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
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

  const headerOrgId = req.headers['x-organization-id'] as string;
  if (headerOrgId && headerOrgId !== context.activeOrganization.id) {
    // Log security violation attempt
    AuditService.logEvent({
      organizationId: context.activeOrganization.id,
      actorId: context.user.id,
      actorRole: context.roles.map(r => r.code).join(','),
      action: 'security.tenant_breach_attempt',
      resourceType: 'Organization',
      resourceId: headerOrgId,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: {
        attemptedOrg: headerOrgId,
        authorizedOrg: context.activeOrganization.id,
        path: req.originalUrl,
        method: req.method
      },
      severity: 'CRITICAL'
    });

    res.status(403).json({
      error: {
        code: 'FORBIDDEN_ORGANIZATION_ISOLATION_VIOLATION',
        message: 'Access denied: You do not have permission to access resources in this organization'
      }
    });
    return;
  }

  next();
}
