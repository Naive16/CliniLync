/**
 * CLINILYNC Versioned Organizations & Membership API Router (v1)
 * 
 * Enforces multi-tenant data boundaries and membership validation.
 */

import { Router, Response } from 'express';
import { getDatabaseClient } from '../../../database/db.js';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth.js';
import { AuditService } from '../../security/audit.js';
import { Organization, Role } from '../../types/domain.js';

export const v1OrgsRouter = Router();

v1OrgsRouter.use(authenticateToken);

/**
 * GET /api/v1/organizations
 * Retrieves all organizations accessible to the authenticated user.
 */
v1OrgsRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const requestId = (req.headers['x-request-id'] as string) || `req_${Date.now()}`;

  if (context.user.isSuperAdmin) {
    const all = await db.query<Organization>('SELECT * FROM organizations WHERE is_active = TRUE ORDER BY name ASC');
    res.status(200).json({
      data: {
        organizations: all.rows
      },
      meta: {
        total: all.rows.length,
        requestId,
        timestamp: new Date().toISOString()
      }
    });
    return;
  }

  // Regular users only see organizations where they possess an ACTIVE membership
  const userOrgsRes = await db.query<{ organization_id: string }>(
    'SELECT organization_id FROM user_organizations WHERE user_id = $1 AND status = $2',
    [context.user.id, 'ACTIVE']
  );

  const orgs: Organization[] = [];
  for (const uo of userOrgsRes.rows) {
    const oRes = await db.query<Organization>(
      'SELECT * FROM organizations WHERE id = $1 AND is_active = TRUE',
      [uo.organization_id]
    );
    if (oRes.rows[0] && !orgs.some(o => o.id === oRes.rows[0].id)) {
      orgs.push(oRes.rows[0]);
    }
  }

  res.status(200).json({
    data: {
      organizations: orgs
    },
    meta: {
      total: orgs.length,
      requestId,
      timestamp: new Date().toISOString()
    }
  });
});

/**
 * GET /api/v1/organizations/current
 * Returns the caller's currently active organization.
 */
v1OrgsRouter.get('/current', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const requestId = (req.headers['x-request-id'] as string) || `req_${Date.now()}`;

  res.status(200).json({
    data: {
      organization: context.activeOrganization
    },
    meta: {
      requestId,
      timestamp: new Date().toISOString()
    }
  });
});

/**
 * GET /api/v1/organizations/:organizationId/membership
 * Verifies the caller's membership, role, and granted permissions in a specific target organization.
 * Strictly returns 403 Forbidden if the caller is not an authorized member.
 */
v1OrgsRouter.get('/:organizationId/membership', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { organizationId } = req.params;
  const requestId = (req.headers['x-request-id'] as string) || `req_${Date.now()}`;
  const db = getDatabaseClient();

  // Validate target organization existence
  const targetOrgRes = await db.query<Organization>(
    'SELECT * FROM organizations WHERE id = $1 AND is_active = TRUE',
    [organizationId]
  );

  if (targetOrgRes.rows.length === 0) {
    res.status(404).json({
      error: {
        code: 'ORGANIZATION_NOT_FOUND',
        message: 'The requested organization does not exist or is inactive.'
      }
    });
    return;
  }

  const targetOrg = targetOrgRes.rows[0];

  // Super Admin bypass
  if (context.user.isSuperAdmin) {
    const allPerms = await db.query<{ code: string }>('SELECT code FROM permissions');
    res.status(200).json({
      data: {
        membership: {
          organizationId: targetOrg.id,
          organizationName: targetOrg.name,
          status: 'ACTIVE',
          isPrimary: true,
          role: {
            id: 'role_super_admin',
            name: 'SUPER ADMIN',
            code: 'SUPER_ADMIN'
          },
          permissions: allPerms.rows.map(p => p.code),
          isPlatformAdmin: true
        }
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString()
      }
    });
    return;
  }

  // Query caller's membership in target organization
  const membershipRes = await db.query<{
    id: string;
    role_id: string;
    is_primary: boolean;
    status: string;
    created_at: string;
  }>(
    'SELECT id, role_id, is_primary, status, created_at FROM user_organizations WHERE user_id = $1 AND organization_id = $2',
    [context.user.id, organizationId]
  );

  if (membershipRes.rows.length === 0) {
    await AuditService.logEvent({
      organizationId: context.activeOrganization.id,
      actorId: context.user.id,
      action: 'security.cross_tenant_membership_probe_denied',
      resourceType: 'Organization',
      resourceId: organizationId,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { targetOrganizationId: organizationId },
      severity: 'WARNING'
    });

    res.status(403).json({
      error: {
        code: 'FORBIDDEN_NOT_A_MEMBER',
        message: 'You are not a member of this organization.'
      }
    });
    return;
  }

  const membership = membershipRes.rows[0];

  if (membership.status !== 'ACTIVE') {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN_MEMBERSHIP_INACTIVE',
        message: `Your membership in this organization is ${membership.status.toLowerCase()}. Access denied.`
      }
    });
    return;
  }

  // Load role & permissions
  const roleRes = await db.query<Role>('SELECT * FROM roles WHERE id = $1', [membership.role_id]);
  const role = roleRes.rows[0];

  let permissionCodes: string[] = [];
  const rpRes = await db.query<{ permission_id: string }>(
    'SELECT permission_id FROM role_permissions WHERE role_id = $1',
    [membership.role_id]
  );
  for (const rp of rpRes.rows) {
    const pRes = await db.query<{ code: string }>('SELECT code FROM permissions WHERE id = $1', [rp.permission_id]);
    if (pRes.rows[0] && !permissionCodes.includes(pRes.rows[0].code)) {
      permissionCodes.push(pRes.rows[0].code);
    }
  }

  res.status(200).json({
    data: {
      membership: {
        organizationId: targetOrg.id,
        organizationName: targetOrg.name,
        status: membership.status,
        isPrimary: membership.is_primary,
        role: role ? { id: role.id, name: role.name, code: role.code } : null,
        permissions: permissionCodes,
        joinedAt: membership.created_at
      }
    },
    meta: {
      requestId,
      timestamp: new Date().toISOString()
    }
  });
});
