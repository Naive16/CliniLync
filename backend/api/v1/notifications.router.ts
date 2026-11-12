import { Router, Response } from 'express';
import { getDatabaseClient } from '../../../database/db.js';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth.js';
import { originValidationMiddleware } from '../../middleware/csrf.js';
import { AuditService } from '../../security/audit.js';

export const v1NotificationsRouter = Router();
v1NotificationsRouter.use(authenticateToken);

v1NotificationsRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
  const db = getDatabaseClient();
  const result = await db.query(
    `SELECT * FROM notifications
     WHERE organization_id = $1 AND user_id = $2
     ORDER BY created_at DESC LIMIT $3`,
    [context.activeOrganization.id, context.user.id, limit]
  );
  const unreadResult = await db.query(
    `SELECT * FROM notifications
     WHERE organization_id = $1 AND user_id = $2 AND read_at IS NULL`,
    [context.activeOrganization.id, context.user.id]
  );

  res.json({
    data: {
      notifications: result.rows,
      unreadCount: unreadResult.rows.length
    },
    meta: { organizationId: context.activeOrganization.id }
  });
});

v1NotificationsRouter.patch('/:notificationId/read', originValidationMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const readAt = new Date().toISOString();
  const result = await db.query(
    `UPDATE notifications SET read_at = $1
     WHERE id = $2 AND organization_id = $3 AND user_id = $4 AND read_at IS NULL`,
    [readAt, req.params.notificationId, context.activeOrganization.id, context.user.id]
  );

  if (result.rowCount === 0) {
    res.status(404).json({ error: { code: 'NOTIFICATION_NOT_FOUND', message: 'Notification not found.' } });
    return;
  }

  res.json({ data: { success: true, readAt } });
});

v1NotificationsRouter.post('/read-all', originValidationMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const readAt = new Date().toISOString();
  const result = await db.query(
    `UPDATE notifications SET read_at = $1
     WHERE organization_id = $2 AND user_id = $3 AND read_at IS NULL`,
    [readAt, context.activeOrganization.id, context.user.id]
  );

  await AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    action: 'notification.read_all',
    resourceType: 'Notification',
    resourceId: context.user.id,
    metadata: { count: result.rowCount },
    severity: 'INFO',
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.json({ data: { success: true, count: result.rowCount, readAt } });
});
