/**
 * CLINILYNC Versioned Organizations & Membership API Router (v1)
 * 
 * Enforces multi-tenant data boundaries and membership validation.
 */

import { Router, Response } from 'express';
import { getDatabaseClient } from '../../../database/db.js';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth.js';
import { originValidationMiddleware } from '../../middleware/csrf.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { AuditService } from '../../security/audit.js';
import { Organization, Role } from '../../types/domain.js';
import { SUPPORTED_COUNTRY_CODES, SUPPORTED_CURRENCY_CODES } from '../../config/organization-settings.js';

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

/** PATCH /api/v1/organizations/current - Update authorized clinic settings. */
v1OrgsRouter.patch('/current', requirePermission('organization.update'), originValidationMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const body = req.body || {};
  const countryCode = typeof body.countryCode === 'string' ? body.countryCode.trim().toUpperCase() : context.activeOrganization.country_code;
  const currencyCode = typeof body.currencyCode === 'string' ? body.currencyCode.trim().toUpperCase() : context.activeOrganization.currency_code;
  const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : null;

  if (!SUPPORTED_COUNTRY_CODES.includes(countryCode as typeof SUPPORTED_COUNTRY_CODES[number])) {
    res.status(400).json({ error: { code: 'INVALID_COUNTRY', message: 'Select a supported country.' } });
    return;
  }
  if (!SUPPORTED_CURRENCY_CODES.includes(currencyCode as typeof SUPPORTED_CURRENCY_CODES[number])) {
    res.status(400).json({ error: { code: 'INVALID_CURRENCY', message: 'Select a supported ISO currency code.' } });
    return;
  }

  const result = await db.query<Organization>(
    `UPDATE organizations SET country_code = $1, region = $2, city = $3, address_line1 = $4,
      postal_code = $5, currency_code = $6, timezone = $7, phone = $8, email = $9, updated_at = $10
     WHERE id = $11 AND is_active = TRUE`,
    [countryCode, clean(body.region, 100), clean(body.city, 100), clean(body.addressLine1, 255), clean(body.postalCode, 32), currencyCode,
      clean(body.timezone, 80) || context.activeOrganization.timezone, clean(body.phone, 32), clean(body.email, 255), new Date().toISOString(), context.activeOrganization.id]
  );
  if (result.rowCount === 0) {
    res.status(404).json({ error: { code: 'ORGANIZATION_NOT_FOUND', message: 'Active organization not found.' } });
    return;
  }
  await AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: context.roles.map(role => role.code).join(','),
    action: 'organization.settings_updated',
    resourceType: 'Organization',
    resourceId: context.activeOrganization.id,
    metadata: { fields: ['countryCode', 'region', 'city', 'addressLine1', 'postalCode', 'currencyCode', 'timezone', 'phone', 'email'] },
    severity: 'INFO', ipAddress: req.ip, userAgent: req.get('user-agent')
  });
  const refreshed = await db.query<Organization>('SELECT * FROM organizations WHERE id = $1', [context.activeOrganization.id]);
  res.json({ data: { organization: refreshed.rows[0] } });
});

/** GET /api/v1/organizations/current/users - List active staff in the current tenant. */
v1OrgsRouter.get('/current/users', requirePermission('user.view'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const memberships = await db.query<any>('SELECT * FROM user_organizations WHERE organization_id = $1 AND status = $2', [context.activeOrganization.id, 'ACTIVE']);
  const users = [];
  for (const membership of memberships.rows) {
    const userResult = await db.query<any>('SELECT id, email, first_name, last_name, status, is_super_admin FROM users WHERE id = $1', [membership.user_id]);
    if (!userResult.rows[0]) continue;
    const roleResult = await db.query<any>('SELECT code, name FROM roles WHERE id = $1', [membership.role_id]);
    if (roleResult.rows[0]?.code === 'PATIENT' || userResult.rows[0].is_super_admin) continue;
    users.push({ ...userResult.rows[0], role_code: roleResult.rows[0]?.code || '', role_name: roleResult.rows[0]?.name || '' });
  }
  res.json({ data: { users } });
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
