/**
 * Authentication smoke test against a running Clinilync API.
 *
 * This intentionally uses the documented synthetic seed account and the real
 * HTTP routes. It never prints credentials, tokens, cookies, or PHI.
 */

type JsonBody = {
  data?: {
    token?: string;
    user?: { email?: string };
    activeOrganization?: { id?: string };
  };
  error?: { code?: string; message?: string };
};

const baseUrl = (process.env.AUTH_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const seededEmail = 'dr.sarah@clinilync.com';
const seededPassword = 'Password123!';

async function readJson(response: Response): Promise<JsonBody> {
  return (await response.json().catch(() => ({}))) as JsonBody;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function getSessionCookie(response: Response): string {
  const raw = response.headers.get('set-cookie');
  assert(raw, 'Login did not return a session cookie.');
  const cookie = raw.split(';')[0];
  assert(cookie.startsWith('clinilync_session='), 'Login returned an unexpected session cookie.');
  return cookie;
}

async function postLogin(email: string, password: string, organizationId?: string) {
  return fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, organizationId })
  });
}

async function postPatientLogin(email: string, password: string) {
  return fetch(`${baseUrl}/api/v1/auth/patient-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
}

const validLogin = await postLogin(seededEmail, seededPassword);
const validBody = await readJson(validLogin);
assert(validLogin.status === 200, `Valid seeded login failed with HTTP ${validLogin.status}.`);
assert(validBody.data?.token, 'Valid seeded login did not return an API token.');
assert(validBody.data?.user?.email === seededEmail, 'Valid seeded login returned the wrong user.');
assert(validBody.data?.activeOrganization?.id === 'org_st_jude', 'Valid seeded login selected the wrong organization.');

const sessionCookie = getSessionCookie(validLogin);
const protectedResponse = await fetch(`${baseUrl}/api/v1/me`, {
  headers: { Cookie: sessionCookie }
});
const protectedBody = await readJson(protectedResponse);
assert(protectedResponse.status === 200, `Cookie session could not access /api/v1/me (HTTP ${protectedResponse.status}).`);
assert(protectedBody.data?.user?.email === seededEmail, 'Cookie session returned the wrong authenticated user.');

const wrongPassword = await postLogin(seededEmail, 'Definitely-not-the-seeded-password');
const wrongPasswordBody = await readJson(wrongPassword);
const unknownAccount = await postLogin('missing.account@clinilync.com', seededPassword);
const unknownAccountBody = await readJson(unknownAccount);
assert(wrongPassword.status === 401 && unknownAccount.status === 401, 'Invalid credentials did not receive HTTP 401.');
assert(wrongPasswordBody.error?.code === 'INVALID_CREDENTIALS', 'Wrong password returned the wrong error code.');
assert(unknownAccountBody.error?.code === wrongPasswordBody.error?.code, 'Credential failures are not anti-enumeration consistent.');
assert(unknownAccountBody.error?.message === wrongPasswordBody.error?.message, 'Credential failure messages differ by account existence.');

const staffOnPatientLogin = await postPatientLogin(seededEmail, seededPassword);
assert(staffOnPatientLogin.status === 403, `Staff credentials were accepted by patient login (HTTP ${staffOnPatientLogin.status}).`);

const patientOnStaffLogin = await postLogin('patient.david@clinilync.com', seededPassword);
assert(patientOnStaffLogin.status === 403, `Patient credentials were accepted by staff login (HTTP ${patientOnStaffLogin.status}).`);

const patientLogin = await postPatientLogin('patient.david@clinilync.com', seededPassword);
assert(patientLogin.status === 200, `Valid patient portal login failed with HTTP ${patientLogin.status}.`);
const patientSessionCookie = getSessionCookie(patientLogin);
const patientPortal = await fetch(`${baseUrl}/api/portal/my-overview`, { headers: { Cookie: patientSessionCookie } });
assert(patientPortal.status === 200, `Patient session could not access its portal overview (HTTP ${patientPortal.status}).`);
const patientStaffApi = await fetch(`${baseUrl}/api/v1/patients`, { headers: { Cookie: patientSessionCookie } });
assert(patientStaffApi.status === 403, `Patient session reached a staff API (HTTP ${patientStaffApi.status}).`);
const staffPatientPortal = await fetch(`${baseUrl}/api/portal/my-overview`, { headers: { Cookie: sessionCookie } });
assert(staffPatientPortal.status === 403, `Staff session reached the patient portal API (HTTP ${staffPatientPortal.status}).`);

const revokedMembership = await postLogin('revoked.staff@clinilync.com', seededPassword, 'org_st_jude');
const revokedBody = await readJson(revokedMembership);
assert(revokedMembership.status === 403, `Revoked membership returned HTTP ${revokedMembership.status}.`);
assert(revokedBody.error?.code === 'FORBIDDEN_MEMBERSHIP_INACTIVE', 'Revoked membership was not rejected by the login route.');

const logout = await fetch(`${baseUrl}/api/v1/auth/logout`, {
  method: 'POST',
  headers: { Cookie: sessionCookie }
});
assert(logout.status === 200, `Logout failed with HTTP ${logout.status}.`);

const afterLogout = await fetch(`${baseUrl}/api/v1/me`, {
  headers: { Cookie: sessionCookie }
});
assert(afterLogout.status === 401, `Protected access remained available after logout (HTTP ${afterLogout.status}).`);

console.log(`[Auth HTTP] Passed: seeded login, cookie session, protected access, anti-enumeration failures, revoked membership rejection, and logout (${baseUrl}).`);
