/**
 * CLINILYNC Versioned Authentication API Router (v1)
 * 
 * Complies with Clinilync Phase 5 Specification:
 * - Versioned API prefix: /api/v1/auth/*
 * - Consistent envelope: { data: {}, meta: {} }
 * - Secure cookies: HttpOnly, SameSite=lax, Secure in production
 * - Anti-enumeration: Identical error messages and constant-time hashing
 * - Immutable server-side audit logging
 */

import { Router, Request, Response } from 'express';
import { getDatabaseClient } from '../../../database/db.js';
import { verifyPassword, hashPassword } from '../../security/password.js';
import { sessionManager } from '../../security/session.js';
import { AuditService } from '../../security/audit.js';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth.js';
import { authRateLimiter, resetRateLimit } from '../../middleware/rate-limiter.js';
import { originValidationMiddleware } from '../../middleware/csrf.js';
import { User, Organization } from '../../types/domain.js';

export const v1AuthRouter = Router();

// Constant dummy salt/hash for timing-safe comparison on invalid user emails
const DUMMY_HASH = hashPassword('DummyTimingAttackMitigationKey123!');

/**
 * POST /api/v1/auth/login
 * Authenticates user credentials, sets secure HttpOnly session cookie, and returns active security context.
 */
v1AuthRouter.post('/login', authRateLimiter, originValidationMiddleware, async (req: Request, res: Response): Promise<void> => {
  const { email, password, organizationId } = req.body;
  const requestId = (req.headers['x-request-id'] as string) || `req_${Date.now()}`;

  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Email and password are required fields.'
      }
    });
    return;
  }

  const cleanEmail = email.toLowerCase().trim();
  const db = getDatabaseClient();

  const userRes = await db.query<User>(
    'SELECT * FROM users WHERE email = $1 AND status = $2',
    [cleanEmail, 'ACTIVE']
  );

  let user: User | null = userRes.rows[0] || null;
  let isValid = false;

  if (user) {
    isValid = verifyPassword(password, user.password_hash, user.salt);
  } else {
    // Constant-time dummy execution to prevent user enumeration via response timing
    verifyPassword(password, DUMMY_HASH.hash, DUMMY_HASH.salt);
  }

  if (!user || !isValid) {
    await AuditService.logEvent({
      organizationId: organizationId || 'system',
      actorId: user ? user.id : 'anonymous',
      action: 'auth.login_failed',
      resourceType: 'User',
      resourceId: cleanEmail,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      metadata: { reason: 'Invalid credentials provided', cleanEmail },
      severity: 'WARNING'
    });

    // Anti-enumeration: Identical error message regardless of whether user exists
    res.status(401).json({
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.'
      }
    });
    return;
  }

  // Determine active organization
  let activeOrgId = organizationId;

  if (activeOrgId) {
    // Verify user belongs to requested organization if not Super Admin
    if (!user.is_super_admin) {
      const membershipCheck = await db.query<{ status: string }>(
        'SELECT status FROM user_organizations WHERE user_id = $1 AND organization_id = $2',
        [user.id, activeOrgId]
      );

      if (membershipCheck.rows.length === 0) {
        await AuditService.logEvent({
          organizationId: activeOrgId,
          actorId: user.id,
          action: 'auth.login_denied_not_member',
          resourceType: 'Organization',
          resourceId: activeOrgId,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          severity: 'WARNING'
        });

        res.status(403).json({
          error: {
            code: 'FORBIDDEN_NOT_A_MEMBER',
            message: 'You are not a member of the requested organization.'
          }
        });
        return;
      }

      if (membershipCheck.rows[0].status !== 'ACTIVE') {
        res.status(403).json({
          error: {
            code: 'FORBIDDEN_MEMBERSHIP_INACTIVE',
            message: `Your membership in this organization is ${membershipCheck.rows[0].status.toLowerCase()}.`
          }
        });
        return;
      }
    }
  } else {
    // Automatically select user's primary active organization
    const orgsRes = await db.query<{ organization_id: string }>(
      'SELECT organization_id FROM user_organizations WHERE user_id = $1 AND status = $2 ORDER BY is_primary DESC LIMIT 1',
      [user.id, 'ACTIVE']
    );

    if (orgsRes.rows.length > 0) {
      activeOrgId = orgsRes.rows[0].organization_id;
    } else if (user.is_super_admin) {
      activeOrgId = 'org_st_jude';
    } else {
      res.status(403).json({
        error: {
          code: 'NO_ASSIGNED_ORGANIZATION',
          message: 'User does not possess an active membership in any organization.'
        }
      });
      return;
    }
  }

  // Issue cryptographic session token
  const token = await sessionManager.createSessionAsync(user.id, activeOrgId);
  resetRateLimit(req);

  // Set secure HttpOnly session cookie
  res.cookie('clinilync_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
    path: '/'
  });

  // Query accessible organizations for this user
  let accessibleOrgs: Organization[] = [];
  if (user.is_super_admin) {
    const all = await db.query<Organization>('SELECT * FROM organizations WHERE is_active = TRUE ORDER BY name ASC');
    accessibleOrgs = all.rows;
  } else {
    const userOrgsRes = await db.query<{ organization_id: string }>(
      'SELECT organization_id FROM user_organizations WHERE user_id = $1 AND status = $2',
      [user.id, 'ACTIVE']
    );
    for (const uo of userOrgsRes.rows) {
      const oRes = await db.query<Organization>('SELECT * FROM organizations WHERE id = $1 AND is_active = TRUE', [uo.organization_id]);
      if (oRes.rows[0] && !accessibleOrgs.some(ao => ao.id === oRes.rows[0].id)) {
        accessibleOrgs.push(oRes.rows[0]);
      }
    }
  }

  const currentOrg = accessibleOrgs.find(o => o.id === activeOrgId) || accessibleOrgs[0];

  // Record audit log
  await AuditService.logEvent({
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

  res.status(200).json({
    data: {
      token, // Also provided in payload for non-cookie API clients (e.g. mobile/tests)
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        isSuperAdmin: user.is_super_admin,
        avatarUrl: user.avatar_url
      },
      activeOrganization: currentOrg,
      availableOrganizations: accessibleOrgs
    },
    meta: {
      requestId,
      timestamp: new Date().toISOString()
    }
  });
});

/**
 * POST /api/v1/auth/logout
 * Revokes the server-side session and clears the browser session cookie.
 */
v1AuthRouter.post('/logout', authenticateToken, originValidationMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const requestId = (req.headers['x-request-id'] as string) || `req_${Date.now()}`;

  await sessionManager.invalidateSessionAsync(context.sessionToken);

  res.clearCookie('clinilync_session', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  });

  await AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    action: 'auth.logout',
    resourceType: 'Session',
    resourceId: 'session',
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    severity: 'INFO'
  });

  res.status(200).json({
    data: {
      message: 'Logged out successfully.'
    },
    meta: {
      requestId,
      timestamp: new Date().toISOString()
    }
  });
});

/**
 * GET /api/v1/auth/session
 * Verifies active session validity and returns session metadata.
 */
v1AuthRouter.get('/session', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const session = sessionManager.getSession(context.sessionToken);
  const requestId = (req.headers['x-request-id'] as string) || `req_${Date.now()}`;

  res.status(200).json({
    data: {
      active: true,
      user: context.user,
      activeOrganization: context.activeOrganization,
      roles: context.roles,
      permissions: context.permissions,
      expiresAt: session ? new Date(session.expiresAt).toISOString() : null,
      lastActiveAt: session ? new Date(session.lastActiveAt).toISOString() : null
    },
    meta: {
      requestId,
      timestamp: new Date().toISOString()
    }
  });
});

/**
 * POST /api/v1/auth/switch-org
 * Switches the authenticated user's active tenant organization context.
 */
v1AuthRouter.post('/switch-org', authenticateToken, originValidationMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const { organizationId } = req.body;
  const requestId = (req.headers['x-request-id'] as string) || `req_${Date.now()}`;

  if (!organizationId) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'organizationId is required'
      }
    });
    return;
  }

  const db = getDatabaseClient();

  if (true) { // Organization switching always requires active membership.
    const check = await db.query<{ status: string }>(
      'SELECT status FROM user_organizations WHERE user_id = $1 AND organization_id = $2',
      [context.user.id, organizationId]
    );

    if (check.rows.length === 0) {
      await AuditService.logEvent({
        organizationId: context.activeOrganization.id,
        actorId: context.user.id,
        action: 'security.org_switch_denied_not_member',
        resourceType: 'Organization',
        resourceId: organizationId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        severity: 'WARNING'
      });

      res.status(403).json({
        error: {
          code: 'FORBIDDEN_NOT_A_MEMBER',
          message: 'You are not an authorized member of the requested organization.'
        }
      });
      return;
    }

    if (check.rows[0].status !== 'ACTIVE') {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN_MEMBERSHIP_INACTIVE',
          message: `Your membership in this organization is ${check.rows[0].status.toLowerCase()}. Access denied.`
        }
      });
      return;
    }
  }

  // Switch session active organization
  await sessionManager.updateSessionOrganizationAsync(context.sessionToken, organizationId);

  await AuditService.logEvent({
    organizationId,
    actorId: context.user.id,
    action: 'auth.switch_organization',
    resourceType: 'Organization',
    resourceId: organizationId,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata: { fromOrg: context.activeOrganization.id, toOrg: organizationId },
    severity: 'INFO'
  });

  res.status(200).json({
    data: {
      activeOrganizationId: organizationId,
      message: 'Active organization switched successfully.'
    },
    meta: {
      requestId,
      timestamp: new Date().toISOString()
    }
  });
});
