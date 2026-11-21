/**
 * CLINILYNC Current User Profile API Router (v1)
 */

import { Router, Response } from 'express';
import { getDatabaseClient } from '../../../database/db.js';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth.js';
import { Organization } from '../../types/domain.js';

export const v1MeRouter = Router();

v1MeRouter.use(authenticateToken);

/**
 * GET /api/v1/me
 * Retrieves current user identity, active organization context, assigned roles, and granted permissions.
 */
v1MeRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const requestId = (req.headers['x-request-id'] as string) || `req_${Date.now()}`;

  let availableOrgs: Organization[] = [];
  if (context.user.isSuperAdmin) {
    const all = await db.query<Organization>('SELECT * FROM organizations WHERE is_active = TRUE ORDER BY name ASC');
    availableOrgs = all.rows;
  } else {
    const organizations = await db.query<Organization>(
      `SELECT DISTINCT o.*
       FROM organizations AS o
       INNER JOIN user_organizations AS uo ON uo.organization_id = o.id
       WHERE uo.user_id = $1 AND uo.status = $2 AND o.is_active = TRUE
       ORDER BY o.name ASC`,
      [context.user.id, 'ACTIVE']
    );
    availableOrgs = organizations.rows;
  }

  res.status(200).json({
    data: {
      user: context.user,
      activeOrganization: context.activeOrganization,
      roles: context.roles,
      permissions: context.permissions,
      availableOrganizations: availableOrgs
    },
    meta: {
      requestId,
      timestamp: new Date().toISOString()
    }
  });
});
