import { Router, Response, Request } from 'express';
import crypto from 'node:crypto';
import { getDatabaseClient } from '../../../database/db.js';
import { authenticateToken, AuthenticatedRequest, requireStaffAccount } from '../../middleware/auth.js';
import { requireAnyPermission, requirePermission } from '../../middleware/require-permission.js';
import { originValidationMiddleware } from '../../middleware/csrf.js';
import { authRateLimiter } from '../../middleware/rate-limiter.js';
import { AuditService } from '../../security/audit.js';
import { hashPassword } from '../../security/password.js';
import { Permissions, SystemRoles } from '../../security/permissions.js';
import { config } from '../../config/index.js';
import { SUPPORTED_COUNTRY_CODES, SUPPORTED_CURRENCY_CODES } from '../../config/organization-settings.js';
import { deliverStagingVerificationLink, sendTransactionalEmail } from '../../services/email.service.js';
import { createOnboardingToken, getOnboardingState, hashOnboardingToken, isValidTimeZone, markOnboardingStep, OnboardingStatus, OnboardingStep, validateActivation } from '../../services/onboarding.service.js';

export const v1OnboardingRouter = Router();

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const supportedInvitationRoles = new Set<string>([
  SystemRoles.ORG_ADMIN,
  SystemRoles.DEPARTMENT_ADMIN,
  SystemRoles.CLINICAL_DIRECTOR,
  SystemRoles.DOCTOR,
  SystemRoles.NURSE,
  SystemRoles.THERAPIST,
  SystemRoles.RECEPTIONIST,
  SystemRoles.BILLING_STAFF,
  SystemRoles.LAB_STAFF,
  SystemRoles.PHARMACIST,
  SystemRoles.SUPPORT_STAFF
]);

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'clinic';
}

function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function validationError(res: Response, message: string): void {
  res.status(400).json({ error: { code: 'VALIDATION_FAILED', message } });
}

/** Public clinic registration. The initial role is always the organization-scoped ORG_OWNER. */
v1OnboardingRouter.post('/register', authRateLimiter, originValidationMiddleware, async (req: Request, res: Response): Promise<void> => {
  const clinicName = cleanText(req.body.clinicName, 255);
  const legalName = cleanText(req.body.legalName, 255) || clinicName;
  const firstName = cleanText(req.body.adminFirstName, 100);
  const lastName = cleanText(req.body.adminLastName, 100);
  const email = cleanText(req.body.adminEmail, 255).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const countryCode = cleanText(req.body.countryCode, 3).toUpperCase() || 'GBR';
  const currencyCode = cleanText(req.body.currencyCode, 3).toUpperCase() || 'GBP';
  const defaultTimeZones: Record<string, string> = {
    MWI: 'Africa/Blantyre',
    USA: 'America/New_York',
    GBR: 'Europe/London',
    ZAF: 'Africa/Johannesburg',
    KEN: 'Africa/Nairobi',
    TZA: 'Africa/Dar_es_Salaam',
    BWA: 'Africa/Gaborone',
    NGA: 'Africa/Lagos',
    CAN: 'America/Toronto',
    AUS: 'Australia/Sydney',
    CHE: 'Europe/Zurich',
    IND: 'Asia/Kolkata',
  };
  const timezone = cleanText(req.body.timezone, 80) || defaultTimeZones[countryCode] || 'UTC';
  const region = cleanText(req.body.region, 100);
  const city = cleanText(req.body.city, 100);
  const addressLine1 = cleanText(req.body.addressLine1, 255);
  const postalCode = cleanText(req.body.postalCode, 32);
  const phone = cleanText(req.body.phone, 32);

  if (clinicName.length < 2 || firstName.length < 2 || lastName.length < 2 || !emailPattern.test(email)) {
    validationError(res, 'Enter a clinic name, administrator name, and valid work email.');
    return;
  }
  if (password.length < 6) {
    validationError(res, 'Choose a password with at least 6 characters.');
    return;
  }
  if (!SUPPORTED_COUNTRY_CODES.includes(countryCode as typeof SUPPORTED_COUNTRY_CODES[number])) {
    validationError(res, 'Select a supported country.');
    return;
  }
  if (!SUPPORTED_CURRENCY_CODES.includes(currencyCode as typeof SUPPORTED_CURRENCY_CODES[number])) {
    validationError(res, 'Select a supported ISO currency code.');
    return;
  }
  if (!isValidTimeZone(timezone)) {
    validationError(res, 'Select a valid time zone.');
    return;
  }

  const db = getDatabaseClient();
  try {
    const result = await db.transaction(async (tx) => {
      const existingUser = await tx.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existingUser.rows.length > 0) {
        const error = new Error('An account with this work email already exists.');
        (error as Error & { code?: string }).code = 'DUPLICATE_EMAIL';
        throw error;
      }

      const ownerRole = await tx.query<{ id: string }>('SELECT id FROM roles WHERE code = $1', [SystemRoles.ORG_OWNER]);
      if (ownerRole.rows.length === 0) {
        const error = new Error('Organization owner role is not configured. Apply the standard seed or role setup first.');
        (error as Error & { code?: string }).code = 'ROLE_NOT_CONFIGURED';
        throw error;
      }

      const baseSlug = slugify(clinicName);
      let slug = baseSlug;
      const duplicateSlug = await tx.query('SELECT id FROM organizations WHERE slug = $1', [slug]);
      if (duplicateSlug.rows.length > 0) slug = `${baseSlug}-${crypto.randomBytes(3).toString('hex')}`;

      const organizationId = `org_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`;
      const userId = `usr_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`;
      const now = new Date().toISOString();
      const passwordRecord = hashPassword(password);
      const verificationToken = createOnboardingToken();

      await tx.query(
        `INSERT INTO organizations
          (id, name, legal_name, slug, country_code, region, city, address_line1, postal_code, phone, currency_code, timezone, is_active, onboarding_status, onboarding_step, onboarding_started_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
        [organizationId, clinicName, legalName, slug, countryCode, region || null, city || null, addressLine1 || null, postalCode || null, phone || null, currencyCode, timezone, true, OnboardingStatus.PENDING_EMAIL_VERIFICATION, 2, now, now, now]
      );
      await tx.query(
        `INSERT INTO users
          (id, email, password_hash, salt, first_name, last_name, is_super_admin, status, email_verified_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [userId, email, passwordRecord.hash, passwordRecord.salt, firstName, lastName, false, 'ACTIVE', null, now, now]
      );
      await tx.query(
        `INSERT INTO user_organizations
          (id, user_id, organization_id, role_id, is_primary, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [`uo_${userId}_${organizationId}`, userId, organizationId, ownerRole.rows[0].id, true, 'ACTIVE', now]
      );
      await tx.query('UPDATE organizations SET onboarding_admin_user_id = $1 WHERE id = $2', [userId, organizationId]);
      await tx.query(
        `INSERT INTO organization_email_verifications
          (id, organization_id, user_id, token_hash, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [`verify_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`, organizationId, userId, hashOnboardingToken(verificationToken), new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), now]
      );
      await markOnboardingStep(tx, organizationId, OnboardingStep.REGISTER, userId, { clinicName });

      return { organizationId, userId, slug, verificationToken };
    });

    const verificationUrl = `${config.appUrl.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(result.verificationToken)}`;
    let delivery: { accepted: boolean; provider: string; reason?: string };
    try {
      delivery = deliverStagingVerificationLink(email, verificationUrl) ?? await sendTransactionalEmail({
        to: email,
        subject: 'Verify your Clinilync clinic administrator email',
        text: `Verify your Clinilync administrator email by opening this link: ${verificationUrl}\n\nThis link expires in 24 hours and can only be used once.`,
        html: `<p>Verify your Clinilync administrator email to continue setting up your clinic.</p><p><a href="${verificationUrl}">Verify email address</a></p><p>This link expires in 24 hours and can only be used once.</p>`,
      });
    } catch {
      delivery = { accepted: false, provider: config.email.provider, reason: 'PROVIDER_REQUEST_FAILED' };
    }

    await AuditService.logEvent({
      organizationId: result.organizationId,
      actorId: result.userId,
      action: 'organization.registered',
      resourceType: 'Organization',
      resourceId: result.organizationId,
      metadata: { administratorEmail: email },
      severity: 'INFO',
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(201).json({
      data: {
        organization: { id: result.organizationId, name: clinicName, slug: result.slug },
        administrator: { email, firstName, lastName },
        emailVerificationRequired: true,
        deliveryAccepted: delivery.accepted,
        deliveryProvider: delivery.provider,
        nextStep: delivery.accepted
          ? 'Check the administrator email address and verify it before continuing setup.'
          : 'Your progress is saved, but email delivery failed or is not configured. Sign in to retry sending the verification email.',
        message: delivery.accepted
          ? 'Verification email accepted by the configured email provider.'
          : 'Clinic registration is saved. The dashboard remains locked until the administrator email is verified.'
      }
    });
  } catch (error) {
    const code = (error as Error & { code?: string }).code;
    if (code === 'DUPLICATE_EMAIL') {
      res.status(409).json({ error: { code, message: (error as Error).message } });
      return;
    }
    if (code === 'ROLE_NOT_CONFIGURED') {
      res.status(503).json({ error: { code, message: (error as Error).message } });
      return;
    }
    console.error('Clinic registration failed:', error);
    res.status(500).json({ error: { code: 'REGISTRATION_FAILED', message: 'Clinic registration could not be completed.' } });
  }
});

/** Public, single-use administrator email verification. */
v1OnboardingRouter.post('/verify-email', authRateLimiter, originValidationMiddleware, async (req: Request, res: Response): Promise<void> => {
  const token = cleanText(req.body?.token, 256);
  if (!token) {
    validationError(res, 'This verification link is missing its token.');
    return;
  }
  const db = getDatabaseClient();
  try {
    const result = await db.transaction(async (tx) => {
      const verification = await tx.query<any>(
        'SELECT * FROM organization_email_verifications WHERE token_hash = $1 AND used_at IS NULL',
        [hashOnboardingToken(token)],
      );
      const row = verification.rows[0];
      if (!row || new Date(String(row.expires_at)).getTime() <= Date.now()) {
        const error = new Error('This verification link is invalid or has expired.');
        (error as Error & { code?: string }).code = 'VERIFICATION_INVALID';
        throw error;
      }
      const now = new Date().toISOString();
      const consumed = await tx.query(
        'UPDATE organization_email_verifications SET used_at = $1 WHERE id = $2 AND used_at IS NULL',
        [now, row.id],
      );
      if (consumed.rowCount === 0) {
        const error = new Error('This verification link has already been used.');
        (error as Error & { code?: string }).code = 'VERIFICATION_USED';
        throw error;
      }
      await tx.query('UPDATE users SET email_verified_at = $1, updated_at = $2 WHERE id = $3', [now, now, row.user_id]);
      await tx.query(
        `UPDATE organizations SET onboarding_status = $1, onboarding_step = $2, updated_at = $3
         WHERE id = $4 AND onboarding_admin_user_id = $5`,
        [OnboardingStatus.EMAIL_VERIFIED, 3, now, row.organization_id, row.user_id],
      );
      await markOnboardingStep(tx, row.organization_id, OnboardingStep.VERIFY_EMAIL, row.user_id);
      return { organizationId: row.organization_id, userId: row.user_id };
    });
    await AuditService.logEvent({
      organizationId: result.organizationId,
      actorId: result.userId,
      action: 'organization.email_verified',
      resourceType: 'Organization',
      resourceId: result.organizationId,
      metadata: {},
      severity: 'INFO',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.json({ data: { verified: true, nextStep: 'Sign in to continue setting up your clinic.' } });
  } catch (error) {
    const code = (error as Error & { code?: string }).code;
    if (code === 'VERIFICATION_INVALID' || code === 'VERIFICATION_USED') {
      res.status(400).json({ error: { code, message: (error as Error).message } });
      return;
    }
    res.status(500).json({ error: { code: 'VERIFICATION_FAILED', message: 'Email verification could not be completed.' } });
  }
});

/** Public single-use invitation acceptance. It creates the employee account atomically. */
v1OnboardingRouter.post('/invitations/accept', authRateLimiter, originValidationMiddleware, async (req: Request, res: Response): Promise<void> => {
  const token = cleanText(req.body.token, 256);
  const firstName = cleanText(req.body.firstName, 100);
  const lastName = cleanText(req.body.lastName, 100);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!token || firstName.length < 2 || lastName.length < 2 || password.length < 6) {
    validationError(res, 'Provide the invitation token, your name, and a password with at least 6 characters.');
    return;
  }

  const db = getDatabaseClient();
  try {
    const result = await db.transaction(async (tx) => {
      const inviteResult = await tx.query<any>(
        `SELECT * FROM organization_invitations
         WHERE token_hash = $1 AND accepted_at IS NULL AND revoked_at IS NULL`,
        [tokenHash(token)]
      );
      const invitation = inviteResult.rows[0];
      if (!invitation || new Date(String(invitation.expires_at)).getTime() <= Date.now()) {
        const error = new Error('This invitation is invalid or has expired.');
        (error as Error & { code?: string }).code = 'INVITATION_INVALID';
        throw error;
      }

      const existingUser = await tx.query('SELECT id FROM users WHERE email = $1', [invitation.email]);
      if (existingUser.rows.length > 0) {
        const error = new Error('An account already exists for this invitation email.');
        (error as Error & { code?: string }).code = 'DUPLICATE_EMAIL';
        throw error;
      }

      const userId = `usr_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`;
      const now = new Date().toISOString();
      const passwordRecord = hashPassword(password);
      await tx.query(
        `INSERT INTO users
          (id, email, password_hash, salt, first_name, last_name, is_super_admin, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [userId, invitation.email, passwordRecord.hash, passwordRecord.salt, firstName, lastName, false, 'ACTIVE', now, now]
      );
      await tx.query(
        `INSERT INTO user_organizations
          (id, user_id, organization_id, role_id, is_primary, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [`uo_${userId}_${invitation.organization_id}`, userId, invitation.organization_id, invitation.role_id, true, 'ACTIVE', now]
      );
      if (invitation.department_id) {
        await tx.query(
          `INSERT INTO department_memberships
            (id, organization_id, department_id, user_id, membership_role, status, assigned_by_user_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [`dm_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`, invitation.organization_id, invitation.department_id, userId, 'STAFF', 'ACTIVE', invitation.invited_by_user_id, now, now]
        );
      }
      await tx.query(
        `UPDATE organization_invitations SET accepted_at = $1 WHERE id = $2 AND accepted_at IS NULL`,
        [now, invitation.id]
      );
      return { userId, organizationId: invitation.organization_id, invitationId: invitation.id, email: invitation.email };
    });

    await AuditService.logEvent({
      organizationId: result.organizationId,
      actorId: result.userId,
      action: 'organization.invitation_accepted',
      resourceType: 'Invitation',
      resourceId: result.invitationId,
      metadata: { email: result.email },
      severity: 'INFO',
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    res.status(201).json({ data: { success: true, email: result.email, nextStep: 'Account created. Sign in to continue.' } });
  } catch (error) {
    const code = (error as Error & { code?: string }).code;
    if (code === 'INVITATION_INVALID' || code === 'DUPLICATE_EMAIL') {
      res.status(code === 'INVITATION_INVALID' ? 400 : 409).json({ error: { code, message: (error as Error).message } });
      return;
    }
    console.error('Invitation acceptance failed:', error);
    res.status(500).json({ error: { code: 'INVITATION_ACCEPT_FAILED', message: 'The invitation could not be accepted.' } });
  }
});

v1OnboardingRouter.use(authenticateToken);
v1OnboardingRouter.use(requireStaffAccount);

function isOnboardingAdministrator(req: AuthenticatedRequest): boolean {
  const context = req.securityContext!;
  return context.activeOrganization.onboarding_admin_user_id === context.user.id
    || context.roles.some((role) => role.code === SystemRoles.ORG_OWNER);
}

function onboardingAdministratorOnly(req: AuthenticatedRequest, res: Response): boolean {
  if (!isOnboardingAdministrator(req)) {
    res.status(403).json({ error: { code: 'ONBOARDING_ADMIN_REQUIRED', message: 'Only the clinic administrator can complete onboarding.' } });
    return false;
  }
  return true;
}

v1OnboardingRouter.get('/state', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const state = await getOnboardingState(context.activeOrganization.id, context.user.id);
  if (!state) {
    res.status(404).json({ error: { code: 'ORGANIZATION_NOT_FOUND', message: 'Organization onboarding state was not found.' } });
    return;
  }
  res.json({ data: state });
});

v1OnboardingRouter.post('/email-verification/resend', authRateLimiter, originValidationMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  if (!onboardingAdministratorOnly(req, res)) return;
  const db = getDatabaseClient();
  const user = await db.query<any>('SELECT id, email, email_verified_at FROM users WHERE id = $1', [context.user.id]);
  if (!user.rows[0] || user.rows[0].email_verified_at) {
    res.status(400).json({ error: { code: 'EMAIL_ALREADY_VERIFIED', message: 'This administrator email is already verified.' } });
    return;
  }
  const rawToken = createOnboardingToken();
  const now = new Date().toISOString();
  await db.transaction(async (tx) => {
    await tx.query('UPDATE organization_email_verifications SET used_at = $1 WHERE organization_id = $2 AND user_id = $3 AND used_at IS NULL', [now, context.activeOrganization.id, context.user.id]);
    await tx.query(
      `INSERT INTO organization_email_verifications
        (id, organization_id, user_id, token_hash, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [`verify_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`, context.activeOrganization.id, context.user.id, hashOnboardingToken(rawToken), new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), now],
    );
  });
  const verificationUrl = `${config.appUrl.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(rawToken)}`;
  let delivery: { accepted: boolean; provider: string; reason?: string };
  try {
    delivery = deliverStagingVerificationLink(user.rows[0].email, verificationUrl) ?? await sendTransactionalEmail({
      to: user.rows[0].email,
      subject: 'Verify your Clinilync clinic administrator email',
      text: `Verify your Clinilync administrator email by opening this link: ${verificationUrl}\n\nThis link expires in 24 hours and can only be used once.`,
      html: `<p>Verify your Clinilync administrator email to continue setting up your clinic.</p><p><a href="${verificationUrl}">Verify email address</a></p><p>This link expires in 24 hours and can only be used once.</p>`,
    });
  } catch {
    delivery = { accepted: false, provider: config.email.provider, reason: 'PROVIDER_REQUEST_FAILED' };
  }
  res.status(delivery.accepted ? 200 : 503).json({
    data: {
      accepted: delivery.accepted,
      provider: delivery.provider,
      message: delivery.accepted ? 'A new verification email was accepted for delivery.' : 'Progress is saved, but email delivery could not be confirmed. Check provider configuration and retry.',
    },
  });
});

/** Create a department during clinic onboarding without opening the clinical workspace. */
v1OnboardingRouter.post('/departments', requirePermission(Permissions.ORGANIZATION_UPDATE), originValidationMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!onboardingAdministratorOnly(req, res)) return;
  const context = req.securityContext!;
  const name = cleanText(req.body?.name, 120);
  const code = cleanText(req.body?.code, 24).toUpperCase();
  if (name.length < 2 || !/^[A-Z0-9_]+$/.test(code)) {
    validationError(res, 'Enter a department name and a valid department code.');
    return;
  }

  const db = getDatabaseClient();
  const duplicate = await db.query(
    'SELECT id FROM departments WHERE organization_id = $1 AND code = $2',
    [context.activeOrganization.id, code],
  );
  if (duplicate.rows.length > 0) {
    res.status(409).json({ error: { code: 'DUPLICATE_CODE', message: `Department code ${code} already exists in this clinic.` } });
    return;
  }

  const id = `dept_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`;
  const now = new Date().toISOString();
  const department = {
    id,
    organization_id: context.activeOrganization.id,
    name,
    code,
    description: null,
    parent_department_id: null,
    head_provider_id: null,
    email: null,
    phone: null,
    is_active: true,
    created_at: now,
    updated_at: now,
  };

  await db.transaction(async (tx) => {
    await tx.query(
      `INSERT INTO departments
        (id, organization_id, name, code, description, parent_department_id, head_provider_id, email, phone, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NULL, NULL, NULL, NULL, NULL, TRUE, $5, $5)`,
      [id, context.activeOrganization.id, name, code, now],
    );
    await markOnboardingStep(tx, context.activeOrganization.id, OnboardingStep.DEPARTMENTS, context.user.id);
    await tx.query(
      'UPDATE organizations SET onboarding_status = $1, onboarding_step = $2, updated_at = $3 WHERE id = $4',
      [OnboardingStatus.SETUP_IN_PROGRESS, 5, now, context.activeOrganization.id],
    );
  });

  await AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: context.roles.map((role) => role.code).join(','),
    action: 'department.created_during_onboarding',
    resourceType: 'Department',
    resourceId: id,
    metadata: { name, code },
    severity: 'INFO',
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.status(201).json({ data: { department }, meta: { message: 'Department saved during clinic onboarding.' } });
});

v1OnboardingRouter.patch('/profile', requirePermission(Permissions.ORGANIZATION_UPDATE), originValidationMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!onboardingAdministratorOnly(req, res)) return;
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const body = req.body || {};
  const countryCode = cleanText(body.countryCode, 3).toUpperCase();
  const currencyCode = cleanText(body.currencyCode, 3).toUpperCase();
  const timezone = cleanText(body.timezone, 80);
  const city = cleanText(body.city, 100);
  if (!SUPPORTED_COUNTRY_CODES.includes(countryCode as typeof SUPPORTED_COUNTRY_CODES[number]) || !SUPPORTED_CURRENCY_CODES.includes(currencyCode as typeof SUPPORTED_CURRENCY_CODES[number]) || !isValidTimeZone(timezone) || !city) {
    validationError(res, 'Enter a valid country, city, currency, and time zone before continuing.');
    return;
  }
  const now = new Date().toISOString();
  await db.query(
    `UPDATE organizations SET country_code = $1, region = $2, city = $3, address_line1 = $4, postal_code = $5,
      currency_code = $6, timezone = $7, phone = $8, updated_at = $9,
      onboarding_status = $10, onboarding_step = $11
     WHERE id = $12`,
    [countryCode, cleanText(body.region, 100) || null, city, cleanText(body.addressLine1, 255) || null, cleanText(body.postalCode, 32) || null, currencyCode, timezone, cleanText(body.phone, 32) || null, now, OnboardingStatus.SETUP_IN_PROGRESS, 4, context.activeOrganization.id],
  );
  await markOnboardingStep(db, context.activeOrganization.id, OnboardingStep.PROFILE, context.user.id);
  res.json({ data: { saved: true, message: 'Clinic profile saved.' } });
});

v1OnboardingRouter.post('/steps/:stepKey/complete', requirePermission(Permissions.ORGANIZATION_UPDATE), originValidationMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!onboardingAdministratorOnly(req, res)) return;
  const context = req.securityContext!;
  const allowed = new Set<string>([OnboardingStep.DEPARTMENTS, OnboardingStep.DEPARTMENT_ADMINISTRATORS, OnboardingStep.STAFF_INVITATIONS, OnboardingStep.REVIEW]);
  if (!allowed.has(req.params.stepKey)) {
    res.status(400).json({ error: { code: 'INVALID_ONBOARDING_STEP', message: 'That setup step cannot be completed directly.' } });
    return;
  }
  await markOnboardingStep(getDatabaseClient(), context.activeOrganization.id, req.params.stepKey, context.user.id);
  const nextStep = req.params.stepKey === OnboardingStep.STAFF_INVITATIONS ? 7 : Number(context.activeOrganization.onboarding_step || 3);
  await getDatabaseClient().query('UPDATE organizations SET onboarding_step = $1, updated_at = $2 WHERE id = $3', [nextStep, new Date().toISOString(), context.activeOrganization.id]);
  res.json({ data: { saved: true } });
});

v1OnboardingRouter.post('/activate', requirePermission(Permissions.ORGANIZATION_UPDATE), originValidationMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!onboardingAdministratorOnly(req, res)) return;
  const context = req.securityContext!;
  const validation = await validateActivation(context.activeOrganization.id);
  if (!validation.ok) {
    res.status(422).json({ error: { code: 'ONBOARDING_INCOMPLETE', message: 'Complete the remaining setup steps before activating the clinic.', missingSteps: validation.missingSteps } });
    return;
  }
  const db = getDatabaseClient();
  const now = new Date().toISOString();
  await db.transaction(async (tx) => {
    await tx.query('UPDATE organizations SET onboarding_status = $1, onboarding_step = $2, activated_at = $3, updated_at = $4 WHERE id = $5 AND onboarding_status <> $1', [OnboardingStatus.ACTIVE, 7, now, now, context.activeOrganization.id]);
    await markOnboardingStep(tx, context.activeOrganization.id, OnboardingStep.REVIEW, context.user.id);
  });
  await AuditService.logEvent({ organizationId: context.activeOrganization.id, actorId: context.user.id, actorRole: context.roles.map((role) => role.code).join(','), action: 'organization.activated', resourceType: 'Organization', resourceId: context.activeOrganization.id, metadata: {}, severity: 'INFO', ipAddress: req.ip, userAgent: req.get('user-agent') });
  res.json({ data: { active: true, message: 'Clinic activated. Your workspace is ready.' } });
});

v1OnboardingRouter.get('/invitations', requirePermission(Permissions.USER_VIEW), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const invitations = await db.query<any>(
    `SELECT * FROM organization_invitations WHERE organization_id = $1 ORDER BY created_at DESC`,
    [context.activeOrganization.id]
  );
  const enriched = await Promise.all(invitations.rows.map(async (invitation) => {
    const role = await db.query<{ name: string; code: string }>('SELECT name, code FROM roles WHERE id = $1', [invitation.role_id]);
    return { ...invitation, role_name: role.rows[0]?.name || invitation.role_id, role_code: role.rows[0]?.code || '' , token_hash: undefined };
  }));
  res.json({ data: { invitations: enriched } });
});

v1OnboardingRouter.post('/invitations', requireAnyPermission([Permissions.USER_CREATE, Permissions.DEPARTMENT_STAFF_INVITE]), originValidationMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const email = cleanText(req.body.email, 255).toLowerCase();
  const firstName = cleanText(req.body.firstName, 100);
  const lastName = cleanText(req.body.lastName, 100);
  const roleCode = cleanText(req.body.roleCode, 64).toUpperCase();
  const departmentId = cleanText(req.body.departmentId, 64) || null;
  if (!emailPattern.test(email) || firstName.length < 2 || lastName.length < 2 || !supportedInvitationRoles.has(roleCode)) {
    validationError(res, 'Enter a valid work email, name, and supported role.');
    return;
  }
  const db = getDatabaseClient();
  const isOrgUserManager = context.permissions.includes(Permissions.USER_CREATE);
  if (roleCode === SystemRoles.DEPARTMENT_ADMIN && !isOrgUserManager) {
    res.status(403).json({ error: { code: 'DEPARTMENT_ADMIN_ASSIGNMENT_FORBIDDEN', message: 'Only the clinic administrator may appoint a department administrator.' } });
    return;
  }
  if (!isOrgUserManager && !departmentId) {
    res.status(400).json({ error: { code: 'DEPARTMENT_REQUIRED', message: 'Department staff invitations must be linked to a department.' } });
    return;
  }
  if (departmentId) {
    const departmentResult = await db.query<any>('SELECT id, administrator_user_id FROM departments WHERE id = $1 AND organization_id = $2 AND is_active = TRUE', [departmentId, context.activeOrganization.id]);
    if (!departmentResult.rows[0]) {
      res.status(400).json({ error: { code: 'INVALID_DEPARTMENT', message: 'Department not found in the active organization.' } });
      return;
    }
    if (!isOrgUserManager && departmentResult.rows[0].administrator_user_id !== context.user.id) {
      res.status(403).json({ error: { code: 'FORBIDDEN_DEPARTMENT', message: 'Only the department administrator or organization administrator may invite staff.' } });
      return;
    }
  }
  const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    res.status(409).json({ error: { code: 'ACCOUNT_EXISTS', message: 'An account already exists for this email.' } });
    return;
  }
  const roleResult = await db.query<{ id: string; name: string; code: string }>('SELECT id, name, code FROM roles WHERE code = $1', [roleCode]);
  if (roleResult.rows.length === 0) {
    res.status(400).json({ error: { code: 'ROLE_NOT_CONFIGURED', message: 'That role is not configured.' } });
    return;
  }
  const activeDuplicate = await db.query(
    `SELECT id FROM organization_invitations
     WHERE organization_id = $1 AND email = $2 AND accepted_at IS NULL AND revoked_at IS NULL`,
    [context.activeOrganization.id, email]
  );
  if (activeDuplicate.rows.length > 0) {
    res.status(409).json({ error: { code: 'INVITATION_EXISTS', message: 'An active invitation already exists for this email.' } });
    return;
  }

  const id = `invite_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`;
  const rawToken = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await db.query(
    `INSERT INTO organization_invitations
      (id, organization_id, invited_by_user_id, email, first_name, last_name, role_id, department_id, token_hash, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [id, context.activeOrganization.id, context.user.id, email, firstName, lastName, roleResult.rows[0].id, departmentId, tokenHash(rawToken), expiresAt, now.toISOString()]
  );
  await AuditService.logEvent({
    organizationId: context.activeOrganization.id,
    actorId: context.user.id,
    actorRole: context.roles[0]?.code,
    action: 'organization.invitation_created',
    resourceType: 'Invitation',
    resourceId: id,
    metadata: { email, roleCode, departmentId, expiresAt },
    severity: 'INFO',
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  const invitationUrl = `${config.appUrl.replace(/\/$/, '')}/invite?token=${encodeURIComponent(rawToken)}`;
  let delivery: { accepted: boolean; provider: string; reason?: string };
  try {
    delivery = await sendTransactionalEmail({
      to: email,
      subject: 'You have been invited to Clinilync',
      text: `You have been invited to join ${context.activeOrganization.name}. Set up your account here: ${invitationUrl}`,
      html: `<p>You have been invited to join ${context.activeOrganization.name}.</p><p><a href="${invitationUrl}">Set up your Clinilync account</a></p>`,
    });
  } catch {
    delivery = { accepted: false, provider: config.email.provider, reason: 'PROVIDER_REQUEST_FAILED' };
  }

  res.status(delivery.accepted ? 201 : 503).json({
    data: {
      invitation: { id, email, firstName, lastName, roleCode, expiresAt, status: 'PENDING' },
      delivery: delivery.accepted ? 'accepted' : 'failed',
      provider: delivery.provider,
      message: delivery.accepted ? 'Invitation email accepted for delivery.' : 'Invitation saved, but email delivery could not be confirmed. Retry after provider configuration is fixed.'
    }
  });
});

v1OnboardingRouter.post('/invitations/:invitationId/revoke', requirePermission(Permissions.USER_UPDATE), originValidationMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const result = await db.query(
    `UPDATE organization_invitations SET revoked_at = $1
     WHERE id = $2 AND organization_id = $3 AND accepted_at IS NULL AND revoked_at IS NULL`,
    [new Date().toISOString(), req.params.invitationId, context.activeOrganization.id]
  );
  if (result.rowCount === 0) {
    res.status(404).json({ error: { code: 'INVITATION_NOT_FOUND', message: 'Invitation not found or no longer pending.' } });
    return;
  }
  res.json({ data: { success: true } });
});

v1OnboardingRouter.post('/invitations/:invitationId/resend', requirePermission(Permissions.USER_CREATE), originValidationMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const context = req.securityContext!;
  const db = getDatabaseClient();
  const current = await db.query<any>(
    `SELECT * FROM organization_invitations WHERE id = $1 AND organization_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL`,
    [req.params.invitationId, context.activeOrganization.id]
  );
  if (current.rows.length === 0) {
    res.status(404).json({ error: { code: 'INVITATION_NOT_FOUND', message: 'Invitation not found or no longer pending.' } });
    return;
  }
  const rawToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await db.query(
    `UPDATE organization_invitations SET token_hash = $1, expires_at = $2 WHERE id = $3 AND organization_id = $4`,
    [tokenHash(rawToken), expiresAt, req.params.invitationId, context.activeOrganization.id]
  );
  const invitationUrl = `${config.appUrl.replace(/\/$/, '')}/invite?token=${encodeURIComponent(rawToken)}`;
  let delivery: { accepted: boolean; provider: string };
  try {
    const sent = await sendTransactionalEmail({
      to: current.rows[0].email,
      subject: 'Your Clinilync invitation has been renewed',
      text: `Continue your Clinilync account setup here: ${invitationUrl}`,
      html: `<p>Your Clinilync invitation has been renewed.</p><p><a href="${invitationUrl}">Continue account setup</a></p>`,
    });
    delivery = { accepted: sent.accepted, provider: sent.provider };
  } catch {
    delivery = { accepted: false, provider: config.email.provider };
  }
  res.status(delivery.accepted ? 200 : 503).json({ data: { success: delivery.accepted, expiresAt, delivery: delivery.accepted ? 'accepted' : 'failed', provider: delivery.provider, message: delivery.accepted ? 'Invitation email accepted for delivery.' : 'Invitation token renewed, but delivery could not be confirmed.' } });
});
