/**
 * CLINILYNC Administration & Audit API Router
 */

import { Router, Response } from 'express';
import { getDatabaseClient } from '../../database/db.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { enforceTenantIsolation } from '../middleware/tenant.js';
import { requirePermission } from '../middleware/require-permission.js';
import { Permissions } from '../security/permissions.js';
import { AuditService } from '../security/audit.js';

export const adminRouter = Router();

adminRouter.use(authenticateToken);
adminRouter.use(enforceTenantIsolation);

// GET /api/admin/audit-logs - Query immutable audit logs
adminRouter.get('/audit-logs', requirePermission(Permissions.AUDIT_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const limit = Math.min(100, Number(req.query.limit) || 50);

  const logs = await AuditService.getOrganizationAuditLogs(context.activeOrganization.id, limit);
  res.json({ logs, total: logs.length });
});

// GET /api/admin/users - List users in organization
adminRouter.get('/users', requirePermission(Permissions.USER_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();

  const uoRes = await db.query<{ user_id: string; role_id: string }>(
    'SELECT user_id, role_id FROM user_organizations WHERE organization_id = $1',
    [context.activeOrganization.id]
  );

  const users: any[] = [];
  for (const uo of uoRes.rows) {
    const [uRes, rRes] = await Promise.all([
      db.query('SELECT id, email, first_name, last_name, phone, avatar_url, status FROM users WHERE id = $1', [uo.user_id]),
      db.query('SELECT name as role_name, code as role_code FROM roles WHERE id = $1', [uo.role_id])
    ]);
    if (uRes.rows[0]) {
      users.push({
        ...uRes.rows[0],
        role_name: rRes.rows[0]?.role_name || 'Staff',
        role_code: rRes.rows[0]?.role_code || 'STAFF'
      });
    }
  }

  res.json({ users });
});

// GET /api/admin/metrics - Organization operational summary
adminRouter.get('/metrics', requirePermission(Permissions.REPORT_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();

  const [patients, appointments, records, invoices] = await Promise.all([
    db.query('SELECT count(*) as count FROM patients WHERE organization_id = $1', [context.activeOrganization.id]),
    db.query('SELECT count(*) as count FROM appointments WHERE organization_id = $1', [context.activeOrganization.id]),
    db.query('SELECT count(*) as count FROM clinical_records WHERE organization_id = $1', [context.activeOrganization.id]),
    db.query('SELECT count(*) as count, sum(total_amount) as total_revenue, sum(balance_due) as outstanding FROM invoices WHERE organization_id = $1', [context.activeOrganization.id])
  ]);

  res.json({
    activePatients: patients.rows[0]?.count || 0,
    totalAppointments: appointments.rows[0]?.count || 0,
    clinicalEncounters: records.rows[0]?.count || 0,
    financialSummary: {
      invoicesIssued: invoices.rows[0]?.count || 0,
      totalBilled: invoices.rows[0]?.total_revenue || 0,
      outstandingBalance: invoices.rows[0]?.outstanding || 0
    }
  });
});
