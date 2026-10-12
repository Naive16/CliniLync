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
    const userOrgsRes = await db.query<{ organization_id: string }>(
      'SELECT organization_id FROM user_organizations WHERE user_id = $1 AND status = $2',
      [context.user.id, 'ACTIVE']
    );
    for (const uo of userOrgsRes.rows) {
      const oRes = await db.query<Organization>('SELECT * FROM organizations WHERE id = $1 AND is_active = TRUE', [uo.organization_id]);
      if (oRes.rows[0] && !availableOrgs.some(ao => ao.id === oRes.rows[0].id)) {
        availableOrgs.push(oRes.rows[0]);
      }
    }
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
