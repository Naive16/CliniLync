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
import { requirePermission } from '../../middleware/require-permission.js';
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

  const now = new Date().toISOString();
  const updated: Department = {
    ...existing,
    name: name !== undefined ? name : existing.name,
    code: code !== undefined ? code.toUpperCase().trim() : existing.code,
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
     WHERE id = $10`,
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
      departmentId
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

/**
 * POST /api/v1/departments/:departmentId/deactivate - Deactivate department
 */
v1DepartmentsRouter.post('/:departmentId/deactivate', requirePermission(Permissions.DEPARTMENT_UPDATE), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const { departmentId } = req.params;

  const now = new Date().toISOString();
  await db.query(
    'UPDATE departments SET is_active = FALSE, updated_at = $1 WHERE id = $2 AND organization_id = $3',
    [now, departmentId, context.activeOrganization.id]
  );

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
