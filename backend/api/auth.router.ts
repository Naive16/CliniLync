/**
 * CLINILYNC Authentication API Router
 */

import { Router, Request, Response } from 'express';
import { getDatabaseClient } from '../../database/db.js';
import { verifyPassword } from '../security/password.js';
import { sessionManager } from '../security/session.js';
import { AuditService } from '../security/audit.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { User, Organization } from '../types/domain.js';

export const authRouter = Router();

authRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password, organizationId } = req.body;

  if (!email || !password) {
    res.status(400).json({
      error: { code: 'INVALID_CREDENTIALS_REQUEST', message: 'Email and password are required' }
    });
    return;
  }

  const db = getDatabaseClient();
  const userRes = await db.query<User>(
    'SELECT * FROM users WHERE email = $1 AND status = $2',
    [email.toLowerCase().trim(), 'ACTIVE']
  );

  if (userRes.rows.length === 0) {
    AuditService.logEvent({
      organizationId: organizationId || 'system',
      actorId: 'anonymous',
      action: 'auth.login_failed',
      resourceType: 'User',
      resourceId: email,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { reason: 'User not found' },
      severity: 'WARNING'
    });

    res.status(401).json({
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }
    });
    return;
  }

  const user = userRes.rows[0];
  const isValid = verifyPassword(password, user.password_hash, user.salt);

  if (!isValid) {
    AuditService.logEvent({
      organizationId: organizationId || 'system',
      actorId: user.id,
      action: 'auth.login_failed',
      resourceType: 'User',
      resourceId: user.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { reason: 'Password mismatch' },
      severity: 'WARNING'
    });

    res.status(401).json({
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }
    });
    return;
  }

  // Determine active organization
  let activeOrgId = organizationId;

  if (!activeOrgId) {
    // Find user's primary or first organization
    const orgsRes = await db.query<{ organization_id: string }>(
      'SELECT organization_id FROM user_organizations WHERE user_id = $1 AND status = $2 ORDER BY is_primary DESC LIMIT 1',
      [user.id, 'ACTIVE']
    );

    if (orgsRes.rows.length > 0) {
      activeOrgId = orgsRes.rows[0].organization_id;
    } else if (user.is_super_admin) {
      // Default to St. Jude for Super Admin
      activeOrgId = 'org_st_jude';
    } else {
      res.status(403).json({
        error: { code: 'NO_ASSIGNED_ORGANIZATION', message: 'User is not assigned to any organization' }
      });
      return;
    }
  }

  // Create session
  const token = await sessionManager.createSessionAsync(user.id, activeOrgId);

  // Fetch available organizations for this user
  let availableOrgs: Organization[] = [];
  if (user.is_super_admin) {
    const allOrgs = await db.query<Organization>('SELECT * FROM organizations WHERE is_active = TRUE');
    availableOrgs = allOrgs.rows;
  } else {
    const userOrgsRes = await db.query<{ organization_id: string }>(
      'SELECT organization_id FROM user_organizations WHERE user_id = $1',
      [user.id]
    );
    for (const uo of userOrgsRes.rows) {
      const oRes = await db.query<Organization>('SELECT * FROM organizations WHERE id = $1 AND is_active = TRUE', [uo.organization_id]);
      if (oRes.rows[0] && !availableOrgs.some(ao => ao.id === oRes.rows[0].id)) {
        availableOrgs.push(oRes.rows[0]);
      }
    }
  }

  const currentOrg = availableOrgs.find(o => o.id === activeOrgId) || availableOrgs[0];

  AuditService.logEvent({
    organizationId: activeOrgId,
    actorId: user.id,
    action: 'auth.login_success',
    resourceType: 'Session',
    resourceId: 'session',
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata: { email: user.email, activeOrg: activeOrgId },
    severity: 'INFO'
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      isSuperAdmin: user.is_super_admin,
      avatarUrl: user.avatar_url
    },
    activeOrganization: currentOrg,
    availableOrganizations: availableOrgs
  });
});

authRouter.post('/logout', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  await sessionManager.invalidateSessionAsync(context.sessionToken);

  AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    action: 'auth.logout',
    resourceType: 'Session',
    resourceId: 'session',
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    severity: 'INFO'
  });

  res.json({ success: true, message: 'Logged out successfully' });
});

authRouter.get('/me', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();

  let availableOrgs: Organization[] = [];
  if (context.user.isSuperAdmin) {
    const allOrgs = await db.query<Organization>('SELECT * FROM organizations WHERE is_active = TRUE');
    availableOrgs = allOrgs.rows;
  } else {
    const userOrgsRes = await db.query<{ organization_id: string }>(
      'SELECT organization_id FROM user_organizations WHERE user_id = $1',
      [context.user.id]
    );
    for (const uo of userOrgsRes.rows) {
      const oRes = await db.query<Organization>('SELECT * FROM organizations WHERE id = $1 AND is_active = TRUE', [uo.organization_id]);
      if (oRes.rows[0] && !availableOrgs.some(ao => ao.id === oRes.rows[0].id)) {
        availableOrgs.push(oRes.rows[0]);
      }
    }
  }

  res.json({
    user: context.user,
    activeOrganization: context.activeOrganization,
    roles: context.roles,
    permissions: context.permissions,
    availableOrganizations: availableOrgs
  });
});

authRouter.post('/switch-org', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { organizationId } = req.body;

  if (!organizationId) {
    res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Organization ID is required' } });
    return;
  }

  const db = getDatabaseClient();

  // Verify membership
  if (true) { // Organization switching always requires active membership.
    const check = await db.query(
      'SELECT id FROM user_organizations WHERE user_id = $1 AND organization_id = $2 AND status = $3',
      [context.user.id, organizationId, 'ACTIVE']
    );

    if (check.rows.length === 0) {
      AuditService.logEvent({
        organizationId: context.activeOrganization.id,
        actorId: context.user.id,
        action: 'security.org_switch_denied',
        resourceType: 'Organization',
        resourceId: organizationId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        severity: 'WARNING'
      });

      res.status(403).json({
        error: { code: 'FORBIDDEN_NOT_A_MEMBER', message: 'You do not belong to this organization' }
      });
      return;
    }
  }

  await sessionManager.updateSessionOrganizationAsync(context.sessionToken, organizationId);

  AuditService.logEvent({
    organizationId: organizationId,
    actorId: context.user.id,
    action: 'auth.switch_organization',
    resourceType: 'Organization',
    resourceId: organizationId,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata: { fromOrg: context.activeOrganization.id, toOrg: organizationId },
    severity: 'INFO'
  });

  res.json({ success: true, activeOrganizationId: organizationId });
});
