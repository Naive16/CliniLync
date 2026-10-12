/**
 * CLINILYNC Prescriptions API Router (v1)
 * 
 * Base path: /api/v1/prescriptions
 */

import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth.js';
import { enforceTenantIsolation } from '../../middleware/tenant.js';
import { Permissions } from '../../security/permissions.js';
import { MedicationService, MedicationError } from '../../services/medication.service.js';

export const v1PrescriptionsRouter = Router();

v1PrescriptionsRouter.use(authenticateToken);
v1PrescriptionsRouter.use(enforceTenantIsolation);

// GET /api/v1/prescriptions (List scoped to organization)
v1PrescriptionsRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;

  if (!context.permissions.includes(Permissions.PRESCRIPTION_VIEW)) {
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'User lacks prescription.view permission' }
    });
    return;
  }

  const patientId = typeof req.query.patientId === 'string' ? req.query.patientId : undefined;
  const providerId = typeof req.query.providerId === 'string' ? req.query.providerId : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;

  try {
    const result = await MedicationService.listPrescriptions(
      context.activeOrganization.id,
      { patientId, providerId, status }
    );

    res.json({
      data: result.prescriptions,
      meta: { total: result.total }
    });
  } catch (err) {
    if (err instanceof MedicationError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list prescriptions' } });
  }
});

// POST /api/v1/prescriptions (Create draft prescription)
v1PrescriptionsRouter.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;

  if (!context.permissions.includes(Permissions.PRESCRIPTION_CREATE)) {
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'User lacks prescription.create permission' }
    });
    return;
  }

  try {
    const result = await MedicationService.createDraftPrescription(
      req.body,
      {
        organizationId: context.activeOrganization.id,
        userId: context.user.id,
        userRole: context.membership?.role || context.roles[0]?.code,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      }
    );

    res.status(201).json({
      data: result,
      meta: { message: 'Prescription drafted successfully' }
    });
  } catch (err) {
    if (err instanceof MedicationError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
});

// POST /api/v1/prescriptions/safety-check (Check items against patient allergies)
v1PrescriptionsRouter.post('/safety-check', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;

  if (
    !context.permissions.includes(Permissions.PRESCRIPTION_VIEW) &&
    !context.permissions.includes(Permissions.PRESCRIPTION_CREATE)
  ) {
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'User lacks prescription permissions' }
    });
    return;
  }

  const { patientId, items } = req.body;
  if (!patientId || !items || !Array.isArray(items)) {
    res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'patientId and items array required' } });
    return;
  }

  try {
    const safetyResult = await MedicationService.evaluatePrescriptionSafety(
      patientId,
      items,
      context.activeOrganization.id
    );

    res.json({
      data: safetyResult
    });
  } catch (err) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Safety evaluation failed' } });
  }
});

// GET /api/v1/prescriptions/:prescriptionId
v1PrescriptionsRouter.get('/:prescriptionId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;

  if (!context.permissions.includes(Permissions.PRESCRIPTION_VIEW)) {
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'User lacks prescription.view permission' }
    });
    return;
  }

  try {
    const result = await MedicationService.getPrescriptionDetails(
      req.params.prescriptionId,
      context.activeOrganization.id
    );

    res.json({
      data: result
    });
  } catch (err) {
    if (err instanceof MedicationError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve prescription' } });
  }
});

// PATCH /api/v1/prescriptions/:prescriptionId (Update draft only)
v1PrescriptionsRouter.patch('/:prescriptionId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;

  if (
    !context.permissions.includes(Permissions.PRESCRIPTION_UPDATE_DRAFT) &&
    !context.permissions.includes(Permissions.PRESCRIPTION_UPDATE)
  ) {
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'User lacks prescription.update_draft permission' }
    });
    return;
  }

  try {
    const result = await MedicationService.updateDraftPrescription(
      req.params.prescriptionId,
      req.body,
      {
        organizationId: context.activeOrganization.id,
        userId: context.user.id,
        userRole: context.membership?.role || context.roles[0]?.code,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      }
    );

    res.json({
      data: result,
      meta: { message: 'Draft prescription updated successfully' }
    });
  } catch (err) {
    if (err instanceof MedicationError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
});

// POST /api/v1/prescriptions/:prescriptionId/sign
v1PrescriptionsRouter.post('/:prescriptionId/sign', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;

  if (!context.permissions.includes(Permissions.PRESCRIPTION_SIGN)) {
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'User lacks prescription.sign authorization' }
    });
    return;
  }

  try {
    const signed = await MedicationService.signPrescription(
      req.params.prescriptionId,
      {
        organizationId: context.activeOrganization.id,
        userId: context.user.id,
        userRole: context.membership?.role || context.roles[0]?.code,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      }
    );

    res.json({
      data: signed,
      meta: { message: 'Prescription attested and signed cryptographically' }
    });
  } catch (err) {
    if (err instanceof MedicationError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
});

// POST /api/v1/prescriptions/:prescriptionId/cancel
v1PrescriptionsRouter.post('/:prescriptionId/cancel', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;

  if (!context.permissions.includes(Permissions.PRESCRIPTION_CANCEL)) {
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'User lacks prescription.cancel permission' }
    });
    return;
  }

  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    res.status(400).json({ error: { code: 'REASON_REQUIRED', message: 'Cancellation reason is mandatory' } });
    return;
  }

  try {
    const cancelled = await MedicationService.cancelPrescription(
      req.params.prescriptionId,
      reason,
      {
        organizationId: context.activeOrganization.id,
        userId: context.user.id,
        userRole: context.membership?.role || context.roles[0]?.code,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      }
    );

    res.json({
      data: cancelled,
      meta: { message: 'Prescription cancelled successfully' }
    });
  } catch (err) {
    if (err instanceof MedicationError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
});

// POST /api/v1/prescriptions/:prescriptionId/replace
v1PrescriptionsRouter.post('/:prescriptionId/replace', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;

  if (!context.permissions.includes(Permissions.PRESCRIPTION_CREATE)) {
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'User lacks prescription.create permission to replace' }
    });
    return;
  }

  try {
    const result = await MedicationService.replacePrescription(
      req.params.prescriptionId,
      req.body,
      {
        organizationId: context.activeOrganization.id,
        userId: context.user.id,
        userRole: context.membership?.role || context.roles[0]?.code,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      }
    );

    res.status(201).json({
      data: result,
      meta: { message: 'Prescription superseded by replacement order' }
    });
  } catch (err) {
    if (err instanceof MedicationError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
});

// POST /api/v1/prescriptions/:prescriptionId/dispense
v1PrescriptionsRouter.post('/:prescriptionId/dispense', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;

  if (!context.permissions.includes(Permissions.PRESCRIPTION_DISPENSE)) {
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'User lacks prescription.dispense authorization' }
    });
    return;
  }

  try {
    const result = await MedicationService.dispensePrescription(
      req.params.prescriptionId,
      req.body,
      {
        organizationId: context.activeOrganization.id,
        userId: context.user.id,
        userRole: context.membership?.role || context.roles[0]?.code,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      }
    );

    res.status(201).json({
      data: result,
      meta: { message: 'Dispensation recorded successfully' }
    });
  } catch (err) {
    if (err instanceof MedicationError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
});

// POST /api/v1/prescriptions/:prescriptionId/safety-override
v1PrescriptionsRouter.post('/:prescriptionId/safety-override', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;

  if (!context.permissions.includes(Permissions.PRESCRIPTION_CREATE) && !context.permissions.includes(Permissions.PRESCRIPTION_SIGN)) {
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'User lacks prescribing authorization' }
    });
    return;
  }

  try {
    const override = await MedicationService.recordSafetyOverride(
      req.params.prescriptionId,
      req.body,
      {
        organizationId: context.activeOrganization.id,
        userId: context.user.id,
        userRole: context.membership?.role || context.roles[0]?.code,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      }
    );

    res.status(201).json({
      data: override,
      meta: { message: 'Safety check override recorded with clinical justification' }
    });
  } catch (err) {
    if (err instanceof MedicationError) {
      res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
});
