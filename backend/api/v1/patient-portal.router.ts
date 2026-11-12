import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { getDatabaseClient } from '../../../database/db.js';
import { authenticateToken, AuthenticatedRequest, requireStaffAccount } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { originValidationMiddleware } from '../../middleware/csrf.js';
import { authRateLimiter } from '../../middleware/rate-limiter.js';
import { AuditService } from '../../security/audit.js';
import { hashPassword } from '../../security/password.js';
import { Permissions, SystemRoles } from '../../security/permissions.js';
import { config } from '../../config/index.js';
import { sendTransactionalEmail } from '../../services/email.service.js';

export const patientPortalRouter = Router();

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

/** Public activation: the invitation itself proves control of the clinic-provided email address. */
patientPortalRouter.post('/activate', authRateLimiter, originValidationMiddleware, async (req: Request, res: Response): Promise<void> => {
  const token = cleanText(req.body?.token, 256);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!token || password.length < 6) {
    res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'Provide your invitation and a password with at least 6 characters.' } });
    return;
  }

  const db = getDatabaseClient();
  try {
    const result = await db.transaction(async (tx) => {
      const invitationResult = await tx.query<any>(
        `SELECT * FROM patient_portal_invitations
         WHERE token_hash = $1 AND accepted_at IS NULL AND revoked_at IS NULL`,
        [tokenHash(token)]
      );
      const invitation = invitationResult.rows[0];
      if (!invitation || new Date(String(invitation.expires_at)).getTime() <= Date.now()) {
        const error = new Error('This patient portal invitation is invalid or has expired.');
        (error as Error & { code?: string }).code = 'PATIENT_INVITATION_INVALID';
        throw error;
      }

      const patientResult = await tx.query<any>(
        'SELECT * FROM patients WHERE id = $1 AND organization_id = $2 AND is_active = TRUE',
        [invitation.patient_id, invitation.organization_id]
      );
      const patient = patientResult.rows[0];
      if (!patient || patient.user_id) {
        const error = new Error('This patient portal invitation is no longer available.');
        (error as Error & { code?: string }).code = 'PATIENT_INVITATION_ALREADY_USED';
        throw error;
      }

      const existingUser = await tx.query('SELECT id FROM users WHERE email = $1', [invitation.email]);
      if (existingUser.rows.length > 0) {
        const error = new Error('A portal account already exists for this email address.');
        (error as Error & { code?: string }).code = 'PATIENT_ACCOUNT_EXISTS';
        throw error;
      }

      const patientRole = await tx.query<{ id: string }>('SELECT id FROM roles WHERE code = $1', [SystemRoles.PATIENT]);
      if (!patientRole.rows[0]) {
        const error = new Error('Patient portal access is not configured.');
        (error as Error & { code?: string }).code = 'PATIENT_ROLE_NOT_CONFIGURED';
        throw error;
      }

      const userId = `usr_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`;
      const now = new Date().toISOString();
      const passwordRecord = hashPassword(password);
      await tx.query(
        `INSERT INTO users
          (id, email, password_hash, salt, first_name, last_name, is_super_admin, status, email_verified_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [userId, invitation.email, passwordRecord.hash, passwordRecord.salt, patient.first_name, patient.last_name, false, 'ACTIVE', now, now, now]
      );
      await tx.query(
        `INSERT INTO user_organizations
          (id, user_id, organization_id, role_id, is_primary, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [`uo_${userId}_${invitation.organization_id}`, userId, invitation.organization_id, patientRole.rows[0].id, true, 'ACTIVE', now]
      );
      const linked = await tx.query(
        'UPDATE patients SET user_id = $1, updated_at = $2 WHERE id = $3 AND organization_id = $4 AND user_id IS NULL',
        [userId, now, patient.id, invitation.organization_id]
      );
      if (linked.rowCount === 0) {
        const error = new Error('This patient record has already been linked to a portal account.');
        (error as Error & { code?: string }).code = 'PATIENT_INVITATION_ALREADY_USED';
        throw error;
      }
      await tx.query(
        'UPDATE patient_portal_invitations SET accepted_at = $1 WHERE id = $2 AND accepted_at IS NULL AND revoked_at IS NULL',
        [now, invitation.id]
      );
      return { userId, organizationId: invitation.organization_id, invitationId: invitation.id, patientId: patient.id };
    });

    await AuditService.logEvent({
      organizationId: result.organizationId,
      actorId: result.userId,
      action: 'patient_portal.invitation_accepted',
      resourceType: 'PatientPortalInvitation',
      resourceId: result.invitationId,
      metadata: { patientId: result.patientId },
      severity: 'INFO',
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    res.status(201).json({ data: { activated: true, nextStep: 'Your portal account is ready. Sign in to continue.' } });
  } catch (error) {
    const code = (error as Error & { code?: string }).code;
    if (code === 'PATIENT_INVITATION_INVALID' || code === 'PATIENT_INVITATION_ALREADY_USED' || code === 'PATIENT_ACCOUNT_EXISTS') {
      res.status(code === 'PATIENT_ACCOUNT_EXISTS' ? 409 : 400).json({ error: { code, message: (error as Error).message } });
      return;
    }
    console.error('Patient portal activation failed:', error);
    res.status(500).json({ error: { code: 'PATIENT_ACTIVATION_FAILED', message: 'The patient portal account could not be activated.' } });
  }
});

patientPortalRouter.use(authenticateToken);
patientPortalRouter.use(requireStaffAccount);

/** Staff action: create a secure invitation for an existing, unlinked patient record. */
patientPortalRouter.post('/invitations', requirePermission(Permissions.PATIENT_UPDATE), originValidationMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const patientId = cleanText(req.body?.patientId, 64);
  const db = getDatabaseClient();
  const patientResult = await db.query<any>(
    'SELECT id, organization_id, user_id, first_name, last_name, email FROM patients WHERE id = $1 AND organization_id = $2 AND is_active = TRUE',
    [patientId, context.activeOrganization.id]
  );
  const patient = patientResult.rows[0];

  if (!patient) {
    res.status(404).json({ error: { code: 'PATIENT_NOT_FOUND', message: 'Patient record not found.' } });
    return;
  }
  if (patient.user_id) {
    res.status(409).json({ error: { code: 'PATIENT_PORTAL_ALREADY_LINKED', message: 'This patient already has a portal account.' } });
    return;
  }
  if (!emailPattern.test(String(patient.email || ''))) {
    res.status(400).json({ error: { code: 'PATIENT_EMAIL_REQUIRED', message: 'Add a valid patient email address before sending a portal invitation.' } });
    return;
  }

  const pending = await db.query(
    `SELECT id FROM patient_portal_invitations
     WHERE patient_id = $1 AND organization_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL`,
    [patient.id, context.activeOrganization.id]
  );
  if (pending.rows.length > 0) {
    res.status(409).json({ error: { code: 'PATIENT_INVITATION_PENDING', message: 'A patient portal invitation is already pending.' } });
    return;
  }

  const rawToken = crypto.randomBytes(32).toString('base64url');
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const invitationId = `pinv_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`;
  await db.query(
    `INSERT INTO patient_portal_invitations
      (id, organization_id, patient_id, invited_by_user_id, email, token_hash, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [invitationId, context.activeOrganization.id, patient.id, context.user.id, patient.email, tokenHash(rawToken), expiresAt, now]
  );

  const activationUrl = `${config.appUrl.replace(/\/$/, '')}/patient/activate?token=${encodeURIComponent(rawToken)}`;
  let delivery;
  try {
    delivery = await sendTransactionalEmail({
      to: patient.email,
      subject: 'Your Clinilync patient portal invitation',
      text: `Your clinic invited you to activate your Clinilync patient portal. Open this link within 48 hours: ${activationUrl}\n\nIf you did not expect this invitation, contact your clinic.`,
      html: `<p>Your clinic invited you to activate your Clinilync patient portal.</p><p><a href="${activationUrl}">Activate your patient portal</a></p><p>This link expires in 48 hours and can only be used once.</p>`
    });
  } catch {
    delivery = { accepted: false, provider: config.email.provider, reason: 'PROVIDER_REQUEST_FAILED' };
  }

  if (!delivery.accepted) {
    await db.query('UPDATE patient_portal_invitations SET revoked_at = $1 WHERE id = $2 AND accepted_at IS NULL', [new Date().toISOString(), invitationId]);
    await AuditService.logEvent({
      organizationId: context.activeOrganization.id,
      actorId: context.user.id,
      action: 'patient_portal.invitation_delivery_failed',
      resourceType: 'PatientPortalInvitation',
      resourceId: invitationId,
      metadata: { patientId: patient.id, provider: delivery.provider, reason: delivery.reason },
      severity: 'WARNING',
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    res.status(503).json({ error: { code: 'PATIENT_INVITATION_DELIVERY_UNAVAILABLE', message: 'The invitation was not sent because the configured email provider is unavailable.' } });
    return;
  }

  await AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    action: 'patient_portal.invitation_created',
    resourceType: 'PatientPortalInvitation',
    resourceId: invitationId,
    metadata: { patientId: patient.id, provider: delivery.provider },
    severity: 'INFO',
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });
  res.status(201).json({ data: { accepted: true, expiresAt, provider: delivery.provider } });
});
