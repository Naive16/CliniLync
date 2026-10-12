/**
 * CLINILYNC Organizations API Router
 */

import { Router, Response } from 'express';
import { getDatabaseClient } from '../../database/db.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { Organization } from '../types/domain.js';

export const orgsRouter = Router();

orgsRouter.use(authenticateToken);

orgsRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();

  if (context.user.isSuperAdmin) {
    const all = await db.query<Organization>('SELECT * FROM organizations WHERE is_active = TRUE ORDER BY name ASC');
    res.json({ organizations: all.rows });
    return;
  }

  const uoRes = await db.query<{ organization_id: string }>(
    'SELECT organization_id FROM user_organizations WHERE user_id = $1',
    [context.user.id]
  );

  const orgs: Organization[] = [];
  for (const uo of uoRes.rows) {
    const oRes = await db.query<Organization>('SELECT * FROM organizations WHERE id = $1 AND is_active = TRUE', [uo.organization_id]);
    if (oRes.rows[0] && !orgs.some(o => o.id === oRes.rows[0].id)) {
      orgs.push(oRes.rows[0]);
    }
  }

  res.json({ organizations: orgs });
});

orgsRouter.get('/current', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  res.json({ organization: context.activeOrganization });
});
