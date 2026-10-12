/**
 * CLINILYNC Specialties API Router (v1)
 */

import { Router, Response } from 'express';
import { getDatabaseClient } from '../../../database/db.js';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth.js';
import { Specialty } from '../../types/domain.js';

export const v1SpecialtiesRouter = Router();

v1SpecialtiesRouter.use(authenticateToken);

/**
 * GET /api/v1/specialties - List medical specialties catalog
 */
v1SpecialtiesRouter.get('/', async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  const db = getDatabaseClient();
  const specRes = await db.query<Specialty>(
    'SELECT * FROM specialties WHERE is_active = TRUE ORDER BY name ASC'
  );

  res.json({
    data: {
      specialties: specRes.rows,
      total: specRes.rows.length
    }
  });
});
