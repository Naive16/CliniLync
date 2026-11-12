import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';

/** Keep setup and session APIs reachable while protecting the clinical workspace. */
export function requireActiveOrganization(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const status = req.securityContext?.activeOrganization?.onboarding_status || 'ACTIVE';
  if (status !== 'ACTIVE') {
    res.status(423).json({
      error: {
        code: 'ONBOARDING_INCOMPLETE',
        message: 'Clinic setup is not complete. Finish onboarding before opening the workspace.',
      },
    });
    return;
  }
  next();
}
