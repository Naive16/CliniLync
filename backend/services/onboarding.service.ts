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

export async function getOnboardingState(organizationId: string, userId?: string) {
  const db = getDatabaseClient();
  const orgResult = await db.query<Organization>('SELECT * FROM organizations WHERE id = $1', [organizationId]);
  const organization = orgResult.rows[0];
  if (!organization) return null;
  const stepResult = await db.query<any>('SELECT step_key, completed_at, metadata FROM organization_onboarding_steps WHERE organization_id = $1', [organizationId]);
  const completed = new Set(stepResult.rows.filter((row) => row.completed_at).map((row) => String(row.step_key)));
  const departments = await db.query<any>('SELECT * FROM departments WHERE organization_id = $1 AND is_active = TRUE ORDER BY name ASC', [organizationId]);
  const rawInvitations = await db.query<any>(
    'SELECT * FROM organization_invitations WHERE organization_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL ORDER BY created_at DESC',
    [organizationId],
  );
  const invitations = { rows: await Promise.all(rawInvitations.rows.map(async (invitation) => {
    const role = await db.query<any>('SELECT code, name FROM roles WHERE id = $1', [invitation.role_id]);
    return { ...invitation, role_code: role.rows[0]?.code || '', role_name: role.rows[0]?.name || '' };
  })) };
  const memberships = await db.query<any>('SELECT * FROM user_organizations WHERE organization_id = $1 AND status = $2', [organizationId, 'ACTIVE']);
  const organizationUsers = { rows: [] as any[] };
  for (const membership of memberships.rows) {
    const userResult = await db.query<any>('SELECT id, email, first_name, last_name, status, is_super_admin FROM users WHERE id = $1', [membership.user_id]);
    const role = await db.query<any>('SELECT code, name FROM roles WHERE id = $1', [membership.role_id]);
    const user = userResult.rows[0];
    if (user && user.status === 'ACTIVE' && !user.is_super_admin && role.rows[0]?.code !== 'PATIENT') {
      organizationUsers.rows.push({ ...user, role_code: role.rows[0]?.code || '', role_name: role.rows[0]?.name || '' });
    }
  }
  organizationUsers.rows.sort((a, b) => String(a.last_name).localeCompare(String(b.last_name)) || String(a.first_name).localeCompare(String(b.first_name)));
  const verified = userId
    ? (await db.query<{ email_verified_at: string | null }>('SELECT email_verified_at FROM users WHERE id = $1', [userId])).rows[0]?.email_verified_at != null
    : false;
  const pendingDepartmentAdminIds = new Set(invitations.rows
    .filter((row) => row.role_code === 'DEPARTMENT_ADMIN' && new Date(String(row.expires_at)).getTime() > Date.now() && row.department_id)
    .map((row) => String(row.department_id)));
  const missing: string[] = [];
  if (!verified) missing.push(OnboardingStep.VERIFY_EMAIL);
  if (!completed.has(OnboardingStep.PROFILE) || !organization.country_code || !organization.city || !organization.currency_code || !organization.timezone) missing.push(OnboardingStep.PROFILE);
  if (!completed.has(OnboardingStep.DEPARTMENTS) || departments.rows.length === 0) missing.push(OnboardingStep.DEPARTMENTS);
  if (departments.rows.some((department) => !department.administrator_user_id && !pendingDepartmentAdminIds.has(String(department.id)))) missing.push(OnboardingStep.DEPARTMENT_ADMINISTRATORS);
  if (!completed.has(OnboardingStep.STAFF_INVITATIONS)) missing.push(OnboardingStep.STAFF_INVITATIONS);
  if (!organization.onboarding_admin_user_id) missing.push(OnboardingStep.REGISTER);
  return {
    status: organization.onboarding_status || OnboardingStatus.ACTIVE,
    currentStep: Number(organization.onboarding_step || 7),
    completedSteps: STEP_ORDER.filter((step) => completed.has(step)),
    missingSteps: [...new Set(missing)],
    emailVerified: verified,
    organization,
    departments: departments.rows,
    pendingInvitations: invitations.rows,
    organizationUsers: organizationUsers.rows,
  };
}

export async function validateActivation(organizationId: string) {
  const state = await getOnboardingState(organizationId);
  if (!state) return { ok: false as const, missingSteps: ['organization'] as string[], state: null };
  const db = getDatabaseClient();
  const admin = { rows: [] as any[] };
  if (state.organization.onboarding_admin_user_id) {
    const userResult = await db.query<any>('SELECT id, email_verified_at FROM users WHERE id = $1', [state.organization.onboarding_admin_user_id]);
    const membership = await db.query<any>('SELECT role_id, status FROM user_organizations WHERE user_id = $1 AND organization_id = $2', [state.organization.onboarding_admin_user_id, organizationId]);
    const role = membership.rows[0] ? await db.query<any>('SELECT code FROM roles WHERE id = $1', [membership.rows[0].role_id]) : { rows: [] };
    if (userResult.rows[0] && membership.rows[0]) admin.rows.push({ ...userResult.rows[0], status: membership.rows[0].status, role_code: role.rows[0]?.code });
  }
  const missing = [...state.missingSteps];
  if (!admin.rows[0] || admin.rows[0].status !== 'ACTIVE' || admin.rows[0].role_code !== 'ORG_OWNER') missing.push('administrator_membership');
  if (!admin.rows[0]?.email_verified_at) missing.push(OnboardingStep.VERIFY_EMAIL);
  return { ok: missing.length === 0, missingSteps: [...new Set(missing)], state };
}
