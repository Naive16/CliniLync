/**
 * CLINILYNC Departments API Router (v1)
 * 
 * Endpoints for hospital departments, organizational units, and staff assignments.
 */

import { Router, Response } from 'express';
import crypto from 'node:crypto';
import { getDatabaseClient } from '../../../database/db.js';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth.js';
import { enforceTenantIsolation } from '../../middleware/tenant.js';
import { requireAnyPermission, requirePermission } from '../../middleware/require-permission.js';
import { Permissions } from '../../security/permissions.js';
import { AuditService } from '../../security/audit.js';
import { Department, ProviderDepartment, Provider } from '../../types/domain.js';

export const v1DepartmentsRouter = Router();

v1DepartmentsRouter.use(authenticateToken);
v1DepartmentsRouter.use(enforceTenantIsolation);

/**
 * GET /api/v1/departments - List organization departments
 */
v1DepartmentsRouter.get('/', requirePermission(Permissions.DEPARTMENT_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { search, status } = req.query;

  let query = 'SELECT * FROM departments WHERE organization_id = $1';
  const params: unknown[] = [context.activeOrganization.id];

  if (status === 'ACTIVE') {
    query += ' AND is_active = TRUE';
  } else if (status === 'INACTIVE') {
    query += ' AND is_active = FALSE';
  }

  const deptRes = await db.query<Department>(query, params);
  let departments = deptRes.rows;

  if (search && typeof search === 'string') {
    const q = search.toLowerCase().trim();
    departments = departments.filter(d => 
      d.name.toLowerCase().includes(q) || 
      d.code.toLowerCase().includes(q) ||
      (d.description && d.description.toLowerCase().includes(q))
    );
  }

  // Enrich with assigned providers count
  const enriched = await Promise.all(
    departments.map(async (d) => {
      const pdRes = await db.query<ProviderDepartment>(
        'SELECT * FROM provider_departments WHERE department_id = $1',
        [d.id]
      );
      return {
        ...d,
        assignedProvidersCount: pdRes.rows.length
      };
    })
  );

  res.json({
    data: {
      departments: enriched,
      total: enriched.length
    },
    meta: {
      organizationId: context.activeOrganization.id,
      timestamp: new Date().toISOString()
    }
  });
});

/**
 * POST /api/v1/departments - Create department
 */
v1DepartmentsRouter.post('/', requirePermission(Permissions.DEPARTMENT_CREATE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { name, code, description, parentDepartmentId, headProviderId, email, phone } = req.body;

  if (!name || !code) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'name and code are required.' } });
    return;
  }

  // Check code uniqueness within organization
  const existingCode = await db.query(
    'SELECT id FROM departments WHERE organization_id = $1 AND code = $2',
    [context.activeOrganization.id, code.toUpperCase().trim()]
  );
  if (existingCode.rows.length > 0) {
    res.status(409).json({ error: { code: 'DUPLICATE_CODE', message: `Department code ${code} already exists in this organization.` } });
    return;
  }

  // Validate parentDepartmentId if provided
  if (parentDepartmentId) {
    const parentRes = await db.query<Department>(
      'SELECT id FROM departments WHERE id = $1 AND organization_id = $2',
      [parentDepartmentId, context.activeOrganization.id]
    );
    if (parentRes.rows.length === 0) {
      res.status(400).json({ error: { code: 'INVALID_PARENT', message: 'Parent department not found in active organization.' } });
      return;
    }
  }

  const deptId = `dept_${crypto.randomUUID().substring(0, 8)}`;
  const now = new Date().toISOString();

  const newDept: Department = {
    id: deptId,
    organization_id: context.activeOrganization.id,
    name,
    code: code.toUpperCase().trim(),
    description: description || null,
    parent_department_id: parentDepartmentId || null,
    head_provider_id: headProviderId || null,
    email: email || null,
    phone: phone || null,
    is_active: true,
    created_at: now,
    updated_at: now
  };

  await db.query(
    `INSERT INTO departments 
      (id, organization_id, name, code, description, parent_department_id, head_provider_id, email, phone, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      newDept.id,
      newDept.organization_id,
      newDept.name,
      newDept.code,
      newDept.description,
      newDept.parent_department_id,
      newDept.head_provider_id,
      newDept.email,
      newDept.phone,
      newDept.is_active,
      newDept.created_at,
      newDept.updated_at
    ]
  );

  await AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: 'STAFF',
    action: 'department.created',
    resourceType: 'Department',
    resourceId: deptId,
    metadata: { name: newDept.name, code: newDept.code },
    severity: 'INFO',
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.status(201).json({
    data: { department: newDept },
    meta: { message: 'Department successfully created.' }
  });
});

/**
 * GET /api/v1/departments/:departmentId - Department details
 */
v1DepartmentsRouter.get('/:departmentId', requirePermission(Permissions.DEPARTMENT_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { departmentId } = req.params;

  const deptRes = await db.query<Department>(
    'SELECT * FROM departments WHERE id = $1 AND organization_id = $2',
    [departmentId, context.activeOrganization.id]
  );

  if (deptRes.rows.length === 0) {
    res.status(404).json({ error: { code: 'DEPARTMENT_NOT_FOUND', message: 'Department not found.' } });
    return;
  }

  const department = deptRes.rows[0];

  // Fetch assigned providers
  const pdRes = await db.query(
    `SELECT p.*, pd.is_primary FROM providers p
     JOIN provider_departments pd ON pd.provider_id = p.id
     WHERE pd.department_id = $1`,
    [departmentId]
  );

  res.json({
    data: {
      department,
      assignedProviders: pdRes.rows
    }
  });
});

/**
 * PATCH /api/v1/departments/:departmentId - Update department
 */
v1DepartmentsRouter.patch('/:departmentId', requirePermission(Permissions.DEPARTMENT_UPDATE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { departmentId } = req.params;

  const deptRes = await db.query<Department>(
    'SELECT * FROM departments WHERE id = $1 AND organization_id = $2',
    [departmentId, context.activeOrganization.id]
  );

  if (deptRes.rows.length === 0) {
    res.status(404).json({ error: { code: 'DEPARTMENT_NOT_FOUND', message: 'Department not found.' } });
    return;
  }

  const existing = deptRes.rows[0];
  const { name, code, description, parentDepartmentId, headProviderId, email, phone, isActive } = req.body;

  // Prevent self-parenting or circular hierarchy
  if (parentDepartmentId && parentDepartmentId === departmentId) {
    res.status(400).json({ error: { code: 'CIRCULAR_HIERARCHY', message: 'A department cannot be its own parent.' } });
    return;
  }

  if (parentDepartmentId) {
    const parent = await db.query('SELECT id FROM departments WHERE id = $1 AND organization_id = $2', [parentDepartmentId, context.activeOrganization.id]);
    if (parent.rows.length === 0) {
      res.status(400).json({ error: { code: 'INVALID_PARENT', message: 'Parent department not found in active organization.' } });
      return;
    }
  }

  const nextCode = code !== undefined ? String(code).toUpperCase().trim() : existing.code;
  const duplicateCode = await db.query(
    'SELECT id FROM departments WHERE organization_id = $1 AND code = $2 AND id != $3',
    [context.activeOrganization.id, nextCode, departmentId]
  );
  if (duplicateCode.rows.length > 0) {
    res.status(409).json({ error: { code: 'DUPLICATE_CODE', message: `Department code ${nextCode} already exists in this organization.` } });
    return;
  }

  const now = new Date().toISOString();
  const updated: Department = {
    ...existing,
    name: name !== undefined ? name : existing.name,
    code: nextCode,
    description: description !== undefined ? description : existing.description,
    parent_department_id: parentDepartmentId !== undefined ? parentDepartmentId : existing.parent_department_id,
    head_provider_id: headProviderId !== undefined ? headProviderId : existing.head_provider_id,
    email: email !== undefined ? email : existing.email,
    phone: phone !== undefined ? phone : existing.phone,
    is_active: isActive !== undefined ? Boolean(isActive) : existing.is_active,
    updated_at: now
  };

  await db.query(
    `UPDATE departments 
     SET name = $1, code = $2, description = $3, parent_department_id = $4, head_provider_id = $5, email = $6, phone = $7, is_active = $8, updated_at = $9
     WHERE id = $10 AND organization_id = $11`,
    [
      updated.name,
      updated.code,
      updated.description,
      updated.parent_department_id,
      updated.head_provider_id,
      updated.email,
      updated.phone,
      updated.is_active,
      updated.updated_at,
      departmentId,
      context.activeOrganization.id
    ]
  );

  await AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: 'STAFF',
    action: 'department.updated',
    resourceType: 'Department',
    resourceId: departmentId,
    metadata: { updatedFields: Object.keys(req.body) },
    severity: 'INFO',
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.json({ data: { department: updated } });
});

async function departmentIsManagedByUser(departmentId: string, organizationId: string, userId: string): Promise<boolean> {
  const db = getDatabaseClient();
  const department = await db.query<any>('SELECT administrator_user_id FROM departments WHERE id = $1 AND organization_id = $2', [departmentId, organizationId]);
  if (department.rows[0]?.administrator_user_id === userId) return true;
  const membership = await db.query<any>(
    'SELECT id FROM department_memberships WHERE department_id = $1 AND organization_id = $2 AND user_id = $3 AND membership_role = $4 AND status = $5',
    [departmentId, organizationId, userId, 'DEPARTMENT_ADMIN', 'ACTIVE']
  );
  return membership.rows.length > 0;
}

/** GET /api/v1/departments/:departmentId/members - Tenant-scoped department staff. */
v1DepartmentsRouter.get('/:departmentId/members', requireAnyPermission([Permissions.DEPARTMENT_STAFF_VIEW, Permissions.DEPARTMENT_MANAGE_ASSIGNMENTS]), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const department = await db.query<Department>('SELECT * FROM departments WHERE id = $1 AND organization_id = $2', [req.params.departmentId, context.activeOrganization.id]);
  if (!department.rows[0]) {
    res.status(404).json({ error: { code: 'DEPARTMENT_NOT_FOUND', message: 'Department not found.' } });
    return;
  }
  const memberships = await db.query<any>('SELECT * FROM department_memberships WHERE department_id = $1 AND organization_id = $2 AND status = $3', [req.params.departmentId, context.activeOrganization.id, 'ACTIVE']);
  const members = [];
  for (const membership of memberships.rows) {
    const user = await db.query<any>('SELECT id, email, first_name, last_name, status FROM users WHERE id = $1', [membership.user_id]);
    if (user.rows[0]) members.push({ ...membership, user: user.rows[0] });
  }
  res.json({ data: { department: department.rows[0], members } });
});

/** PATCH /api/v1/departments/:departmentId/administrator - Assign an existing tenant user. */
v1DepartmentsRouter.patch('/:departmentId/administrator', requirePermission(Permissions.DEPARTMENT_MANAGE_ASSIGNMENTS), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const userId = typeof req.body.userId === 'string' ? req.body.userId.trim() : '';
  const department = await db.query<Department>('SELECT * FROM departments WHERE id = $1 AND organization_id = $2', [req.params.departmentId, context.activeOrganization.id]);
  if (!department.rows[0]) {
    res.status(404).json({ error: { code: 'DEPARTMENT_NOT_FOUND', message: 'Department not found.' } });
    return;
  }
  const user = await db.query<any>('SELECT id, email, first_name, last_name, is_super_admin FROM users WHERE id = $1', [userId]);
  const membership = await db.query<any>('SELECT id, role_id FROM user_organizations WHERE user_id = $1 AND organization_id = $2 AND status = $3', [userId, context.activeOrganization.id, 'ACTIVE']);
  const role = membership.rows[0] ? await db.query<any>('SELECT code FROM roles WHERE id = $1', [membership.rows[0].role_id]) : { rows: [] };
  if (!user.rows[0] || !membership.rows[0] || user.rows[0].is_super_admin || role.rows[0]?.code === 'PATIENT') {
    res.status(400).json({ error: { code: 'INVALID_STAFF_MEMBER', message: 'The administrator must be an active member of this organization.' } });
    return;
  }
  const now = new Date().toISOString();
  await db.query('UPDATE departments SET administrator_user_id = $1, updated_at = $2 WHERE id = $3 AND organization_id = $4', [userId, now, req.params.departmentId, context.activeOrganization.id]);
  const existing = await db.query<any>('SELECT id FROM department_memberships WHERE organization_id = $1 AND department_id = $2 AND user_id = $3', [context.activeOrganization.id, req.params.departmentId, userId]);
  if (existing.rows[0]) {
    await db.query('UPDATE department_memberships SET membership_role = $1, status = $2, assigned_by_user_id = $3, updated_at = $4 WHERE id = $5', ['DEPARTMENT_ADMIN', 'ACTIVE', context.user.id, now, existing.rows[0].id]);
  } else {
    await db.query(
      `INSERT INTO department_memberships (id, organization_id, department_id, user_id, membership_role, status, assigned_by_user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [`dm_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`, context.activeOrganization.id, req.params.departmentId, userId, 'DEPARTMENT_ADMIN', 'ACTIVE', context.user.id, now, now]
    );
  }
  await AuditService.logEvent({ organizationId: context.activeOrganization.id, actorId: context.user.id, actorRole: context.roles.map(role => role.code).join(','), action: 'department.administrator_assigned', resourceType: 'Department', resourceId: req.params.departmentId, metadata: { administratorUserId: userId }, severity: 'INFO', ipAddress: req.ip, userAgent: req.get('user-agent') });
  res.json({ data: { success: true, administrator: user.rows[0] } });
});

/** POST /api/v1/departments/:departmentId/members/:userId/remove - Deactivate a department membership. */
v1DepartmentsRouter.post('/:departmentId/members/:userId/remove', requireAnyPermission([Permissions.DEPARTMENT_STAFF_REMOVE, Permissions.DEPARTMENT_MANAGE_ASSIGNMENTS]), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const isOrgManager = context.permissions.includes(Permissions.DEPARTMENT_MANAGE_ASSIGNMENTS);
  if (!isOrgManager && !(await departmentIsManagedByUser(req.params.departmentId, context.activeOrganization.id, context.user.id))) {
    res.status(403).json({ error: { code: 'FORBIDDEN_DEPARTMENT', message: 'Only the department administrator or organization administrator may manage department staff.' } });
    return;
  }
  const result = await db.query('UPDATE department_memberships SET status = $1, updated_at = $2 WHERE organization_id = $3 AND department_id = $4 AND user_id = $5 AND status = $6', ['REMOVED', new Date().toISOString(), context.activeOrganization.id, req.params.departmentId, req.params.userId, 'ACTIVE']);
  if (result.rowCount === 0) {
    res.status(404).json({ error: { code: 'MEMBERSHIP_NOT_FOUND', message: 'Active department membership not found.' } });
    return;
  }
  res.json({ data: { success: true } });
});

/**
 * POST /api/v1/departments/:departmentId/deactivate - Deactivate department
 */
v1DepartmentsRouter.post('/:departmentId/deactivate', requirePermission(Permissions.DEPARTMENT_UPDATE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { departmentId } = req.params;

  const now = new Date().toISOString();
  const result = await db.query(
    'UPDATE departments SET is_active = FALSE, updated_at = $1 WHERE id = $2 AND organization_id = $3',
    [now, departmentId, context.activeOrganization.id]
  );

  if (result.rowCount === 0) {
    res.status(404).json({ error: { code: 'DEPARTMENT_NOT_FOUND', message: 'Department not found.' } });
    return;
  }

  await AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: 'STAFF',
    action: 'department.deactivated',
    resourceType: 'Department',
    resourceId: departmentId,
    severity: 'WARNING',
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.json({ data: { success: true, departmentId, isActive: false } });
});

/**
 * POST /api/v1/departments/:departmentId/activate - Reactivate department
 */
v1DepartmentsRouter.post('/:departmentId/activate', requirePermission(Permissions.DEPARTMENT_UPDATE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { departmentId } = req.params;
  const result = await db.query(
    'UPDATE departments SET is_active = TRUE, updated_at = $1 WHERE id = $2 AND organization_id = $3',
    [new Date().toISOString(), departmentId, context.activeOrganization.id]
  );
  if (result.rowCount === 0) {
    res.status(404).json({ error: { code: 'DEPARTMENT_NOT_FOUND', message: 'Department not found.' } });
    return;
  }
  await AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: 'STAFF',
    action: 'department.activated',
    resourceType: 'Department',
    resourceId: departmentId,
    severity: 'INFO',
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });
  res.json({ data: { success: true, departmentId, isActive: true } });
});
