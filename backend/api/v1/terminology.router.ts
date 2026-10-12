/**
 * CLINILYNC Terminology API Router (v1)
 * 
 * Base path: /api/v1/terminology
 */

import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth.js';
import { DiagnosisService } from '../../services/diagnosis.service.js';

export const v1TerminologyRouter = Router();

v1TerminologyRouter.use(authenticateToken);

/**
 * GET /api/v1/terminology/search
 * Query active terminology concepts (e.g. ICD-10)
 */
v1TerminologyRouter.get('/search', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { system, q } = req.query;

  try {
    const concepts = await DiagnosisService.searchTerminology(
      system ? String(system) : 'ICD-10',
      q ? String(q) : undefined
    );

    res.json({
      data: {
        concepts,
        total: concepts.length
      }
    });
  } catch (err) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to search terminology concepts.' } });
  }
});
