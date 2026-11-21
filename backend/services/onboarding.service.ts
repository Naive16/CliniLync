import crypto from 'node:crypto';
import { IDatabaseClient, getDatabaseClient } from '../../database/db.js';
import { Organization } from '../types/domain.js';

export const OnboardingStatus = {
  PENDING_EMAIL_VERIFICATION: 'PENDING_EMAIL_VERIFICATION',
  EMAIL_VERIFIED: 'EMAIL_VERIFIED',
  SETUP_IN_PROGRESS: 'SETUP_IN_PROGRESS',
  ACTIVE: 'ACTIVE',
} as const;

export const OnboardingStep = {
  REGISTER: 'register',
  VERIFY_EMAIL: 'verify_email',
  PROFILE: 'profile',
  DEPARTMENTS: 'departments',
  DEPARTMENT_ADMINISTRATORS: 'department_administrators',
  STAFF_INVITATIONS: 'staff_invitations',
  REVIEW: 'review',
} as const;

export const STEP_ORDER = [
  OnboardingStep.REGISTER,
  OnboardingStep.VERIFY_EMAIL,
  OnboardingStep.PROFILE,
  OnboardingStep.DEPARTMENTS,
  OnboardingStep.DEPARTMENT_ADMINISTRATORS,
  OnboardingStep.STAFF_INVITATIONS,
  OnboardingStep.REVIEW,
] as const;

export function hashOnboardingToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createOnboardingToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export async function markOnboardingStep(
  db: IDatabaseClient,
  organizationId: string,
  stepKey: string,
  userId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await db.query<{ id: string }>(
    'SELECT id FROM organization_onboarding_steps WHERE organization_id = $1 AND step_key = $2',
    [organizationId, stepKey],
  );
  if (existing.rows.length > 0) {
    await db.query(
      'UPDATE organization_onboarding_steps SET completed_at = $1, completed_by_user_id = $2, metadata = $3, updated_at = $4 WHERE id = $5',
      [now, userId, metadata ? JSON.stringify(metadata) : null, now, existing.rows[0].id],
    );
  } else {
    await db.query(
      `INSERT INTO organization_onboarding_steps
        (id, organization_id, step_key, completed_at, completed_by_user_id, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [`onb_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`, organizationId, stepKey, now, userId, metadata ? JSON.stringify(metadata) : null, now, now],
    );
  }
}

export async function getOnboardingState(organizationId: string, userId?: string, includeOrganizationUsers = true) {
  const db = getDatabaseClient();

  // Load the complete onboarding snapshot in one PostgreSQL round trip.
  // Cloudflare uses one request-scoped pg.Client, so Promise.all on separate
  // queries still queues network round trips on that same connection.
  const snapshotResult = await db.query<any>(
    `SELECT
       o.*,
       COALESCE((
         SELECT u.email_verified_at IS NOT NULL
         FROM users u
         WHERE u.id = COALESCE(o.onboarding_admin_user_id, $2)
       ), FALSE) AS onboarding_email_verified,
       COALESCE((
         SELECT json_agg(s)
         FROM (
           SELECT step_key, completed_at, metadata
           FROM organization_onboarding_steps
           WHERE organization_id = o.id
         ) s
       ), '[]'::json) AS onboarding_steps,
       COALESCE((
         SELECT json_agg(d ORDER BY d.name)
         FROM (
           SELECT id, name, code, administrator_user_id
           FROM departments
           WHERE organization_id = o.id AND is_active = TRUE
         ) d
       ), '[]'::json) AS onboarding_departments,
       COALESCE((
         SELECT json_agg(i ORDER BY i.created_at DESC)
         FROM (
           SELECT invitation.id, invitation.department_id, invitation.expires_at,
                  r.code AS role_code, r.name AS role_name, invitation.created_at
           FROM organization_invitations invitation
           JOIN roles r ON r.id = invitation.role_id
           WHERE invitation.organization_id = o.id
             AND invitation.accepted_at IS NULL
             AND invitation.revoked_at IS NULL
             AND invitation.department_id IS NOT NULL
             AND invitation.expires_at > NOW()
             AND r.code = $3
         ) i
       ), '[]'::json) AS onboarding_pending_department_admins
     FROM organizations o
     WHERE o.id = $1`,
    [organizationId, userId || null, 'DEPARTMENT_ADMIN'],
  );
  const snapshot = snapshotResult.rows[0];
  if (!snapshot) return null;

  const completed = new Set<string>(
    (snapshot.onboarding_steps || [])
      .filter((row: any) => row.completed_at)
      .map((row: any) => String(row.step_key)),
  );
  const departments = snapshot.onboarding_departments || [];
  const pendingInvitations = snapshot.onboarding_pending_department_admins || [];
  const verified = Boolean(snapshot.onboarding_email_verified);

  const pendingDepartmentAdminIds = new Set(
    pendingInvitations
      .filter((row: any) => row.department_id)
      .map((row: any) => String(row.department_id)),
  );

  const missing: string[] = [];
  if (!verified) missing.push(OnboardingStep.VERIFY_EMAIL);
  if (!completed.has(OnboardingStep.PROFILE)
    || !snapshot.country_code
    || !snapshot.city
    || !snapshot.currency_code
    || !snapshot.timezone) {
    missing.push(OnboardingStep.PROFILE);
  }
  if (!completed.has(OnboardingStep.DEPARTMENTS) || departments.length === 0) {
    missing.push(OnboardingStep.DEPARTMENTS);
  }
  if (!completed.has(OnboardingStep.DEPARTMENT_ADMINISTRATORS)
    && departments.some((department: any) =>
      !department.administrator_user_id && !pendingDepartmentAdminIds.has(String(department.id)))) {
    missing.push(OnboardingStep.DEPARTMENT_ADMINISTRATORS);
  }
  if (!completed.has(OnboardingStep.STAFF_INVITATIONS)) {
    missing.push(OnboardingStep.STAFF_INVITATIONS);
  }
  if (!snapshot.onboarding_admin_user_id) missing.push(OnboardingStep.REGISTER);

  // Staff directory data is only needed when the administrator is actually
  // on the department-administrator step. Avoid loading it on every visit.
  let organizationUsers: any[] = [];
  if (includeOrganizationUsers && missing.includes(OnboardingStep.DEPARTMENT_ADMINISTRATORS)) {
    const usersResult = await db.query<any>(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.status, u.is_super_admin,
              r.code AS role_code, r.name AS role_name
       FROM user_organizations m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN roles r ON r.id = m.role_id
       WHERE m.organization_id = $1 AND m.status = $2
         AND u.status = $3 AND u.is_super_admin = FALSE
         AND (r.code IS NULL OR r.code <> $4)
       ORDER BY u.last_name ASC, u.first_name ASC`,
      [organizationId, 'ACTIVE', 'ACTIVE', 'PATIENT'],
    );
    organizationUsers = usersResult.rows;
  }

  return {
    status: snapshot.onboarding_status || OnboardingStatus.ACTIVE,
    currentStep: Number(snapshot.onboarding_step || 7),
    completedSteps: STEP_ORDER.filter((step) => completed.has(step)),
    missingSteps: [...new Set(missing)],
    emailVerified: verified,
    organization: snapshot,
    departments,
    pendingInvitations,
    organizationUsers,
  };
}

export async function validateActivation(organizationId: string) {
  // Activation does not need the employee picker list, so omit that optional
  // query and fetch the administrator/membership/role in one joined lookup.
  const state = await getOnboardingState(organizationId, undefined, false);
  if (!state) return { ok: false as const, missingSteps: ['organization'] as string[], state: null };

  const db = getDatabaseClient();
  const adminUserId = state.organization.onboarding_admin_user_id;
  const adminResult = adminUserId
    ? await db.query<any>(
        `SELECT u.id, u.email_verified_at, m.status, r.code AS role_code
         FROM users u
         JOIN user_organizations m
           ON m.user_id = u.id AND m.organization_id = $2
         LEFT JOIN roles r ON r.id = m.role_id
         WHERE u.id = $1
         LIMIT 1`,
        [adminUserId, organizationId],
      )
    : { rows: [] as any[] };

  const admin = adminResult.rows[0];
  const missing = [...state.missingSteps];
  if (!admin || admin.status !== 'ACTIVE' || admin.role_code !== 'ORG_OWNER') {
    missing.push('administrator_membership');
  }
  if (!admin?.email_verified_at) missing.push(OnboardingStep.VERIFY_EMAIL);
  return { ok: missing.length === 0, missingSteps: [...new Set(missing)], state };
}
