import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  UserRound,
} from 'lucide-react';
import { api } from '../api/client.js';

interface ClinicOnboardingViewProps { onNavigate: (path: string) => void; }

const OnboardingIntro: React.FC<{ invitation?: boolean }> = ({ invitation = false }) => (
  <section className="cl-onboarding-intro" aria-labelledby="onboarding-intro-title">
    <div className="cl-onboarding-brand">
      <span className="clinilync-brand-mark" aria-hidden="true"><Activity size={20} /></span>
      <strong>Clinilync</strong>
    </div>

    <div className="cl-onboarding-intro-copy">
      <p className="cl-onboarding-eyebrow">{invitation ? 'Team access' : 'Clinic onboarding'}</p>
      <h1 id="onboarding-intro-title">
        {invitation ? 'Join your clinic workspace' : 'Create your clinic workspace'}
      </h1>
      <p>
        {invitation
          ? 'Create your own secure password to access the organization you were invited to join.'
          : 'Register your organization and set up its first authorized administrator in a few clear steps.'}
      </p>

      <ul className="cl-onboarding-benefits">
        {!invitation && <li><Check size={16} aria-hidden="true" /><span>Your administrator account is scoped to this clinic.</span></li>}
        <li><Check size={16} aria-hidden="true" /><span>Employee invitations and roles stay under clinic control.</span></li>
        <li><Check size={16} aria-hidden="true" /><span>Patient records and portal access are managed separately after setup.</span></li>
      </ul>
    </div>

    <p className="cl-onboarding-intro-note">
      {invitation
        ? 'Never share your password with clinic staff. Use your own secure sign-in and contact your administrator if you need account help.'
        : 'No patient information is collected during clinic registration.'}
    </p>
  </section>
);

const OnboardingShell: React.FC<{ children: React.ReactNode; invitation?: boolean }> = ({ children, invitation }) => (
  <div className="cl-onboarding-page">
    <div className="cl-onboarding-shell">
      <OnboardingIntro invitation={invitation} />
      <section className="cl-onboarding-main">{children}</section>
    </div>
  </div>
);

const Field: React.FC<{
  label: string;
  children: React.ReactNode;
  helper?: React.ReactNode;
  helperId?: string;
  className?: string;
  inputId: string;
}> = ({ label, children, helper, helperId, className = '', inputId }) => (
  <div className={`cl-onboarding-field ${className}`.trim()}>
    <label className="cl-onboarding-label" htmlFor={inputId}>{label}</label>
    {children}
    {helper && <span id={helperId} className="cl-onboarding-helper">{helper}</span>}
  </div>
);

const IconInput: React.FC<{
  icon: React.ReactNode;
  inputId?: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
  ariaDescribedBy?: string;
  showPassword?: boolean;
  onTogglePassword?: () => void;
}> = ({
  icon,
  inputId,
  type = 'text',
  value,
  onChange,
  placeholder,
  required = true,
  minLength,
  autoComplete,
  ariaDescribedBy,
  showPassword,
  onTogglePassword,
}) => (
  <span className="cl-onboarding-input-wrap">
    <span className="cl-onboarding-input-icon" aria-hidden="true">{icon}</span>
    <input
      id={inputId}
      required={required}
      minLength={minLength}
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      autoComplete={autoComplete}
      aria-describedby={ariaDescribedBy}
      className="cl-onboarding-input cl-onboarding-input-with-icon"
    />
    {onTogglePassword && (
      <button
        type="button"
        className="cl-onboarding-password-toggle"
        onClick={onTogglePassword}
        aria-label={showPassword ? 'Hide password' : 'Show password'}
      >
        {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
      </button>
    )}
  </span>
);

export const ClinicOnboardingView: React.FC<ClinicOnboardingViewProps> = ({ onNavigate }) => {
  const [form, setForm] = useState({ clinicName: '', countryCode: 'MWI', region: '', city: '', addressLine1: '', postalCode: '', phone: '', currencyCode: 'MWK', adminFirstName: '', adminLastName: '', adminEmail: '', password: '', confirmPassword: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [result, setResult] = useState<{ organization: { name: string }; administrator: { email: string }; nextStep: string } | null>(null);

  const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (form.password !== form.confirmPassword) { setError('The passwords do not match.'); return; }
    setSubmitting(true);
    try {
      const response = await api.v1RegisterClinic(form);
      setResult(response);
    } catch (err) {
      setError((err as Error).message || 'Clinic registration could not be completed.');
    } finally { setSubmitting(false); }
  };

  return (
    <OnboardingShell>
      <div className="cl-onboarding-form-header">
        <p className="cl-onboarding-eyebrow">Set up access</p>
        <h2>Register your clinic</h2>
        <p>The first administrator is assigned the clinic’s organization-scoped Super Admin/owner role by the server.</p>
      </div>

      {result ? (
        <div className="cl-onboarding-result" role="status" aria-live="polite">
          <div className="cl-onboarding-result-icon" aria-hidden="true"><CheckCircle2 size={22} /></div>
          <div>
            <h3>Registration started</h3>
            <p>{result.organization.name} has been registered. The administrator account is {result.administrator.email}.</p>
            <p className="muted-text">The workspace remains locked until the administrator verifies their email and completes setup.</p>
            <p>{result.nextStep}</p>
          </div>
          <button type="button" className="cl-ui-button cl-ui-button-primary cl-ui-button-md" onClick={() => onNavigate('/login')}>
            Continue to sign in <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="cl-onboarding-form">
          {error && <div className="cl-onboarding-error" role="alert">{error}</div>}

          <div className="cl-onboarding-fields">
            <Field label="Clinic or organization name" inputId="clinic-name" className="cl-onboarding-field-full">
              <IconInput inputId="clinic-name" icon={<Building2 size={16} />} value={form.clinicName} onChange={(value) => update('clinicName', value)} placeholder="e.g. Riverside Family Clinic" autoComplete="organization" />
            </Field>

            <Field label="Country" inputId="clinic-country">
              <select id="clinic-country" className="cl-onboarding-input" value={form.countryCode} onChange={(event) => update('countryCode', event.target.value)}>
                <option value="MWI">Malawi</option><option value="GBR">United Kingdom</option><option value="USA">United States</option><option value="ZAF">South Africa</option><option value="KEN">Kenya</option><option value="TZA">Tanzania</option><option value="BWA">Botswana</option><option value="NGA">Nigeria</option>
              </select>
            </Field>
            <Field label="Currency" inputId="clinic-currency" helper="Used for new invoices. Existing invoices keep their saved currency.">
              <select id="clinic-currency" className="cl-onboarding-input" value={form.currencyCode} onChange={(event) => update('currencyCode', event.target.value)}>
                <option value="MWK">MWK — Malawian kwacha</option><option value="GBP">GBP — Pound sterling</option><option value="USD">USD — US dollar</option><option value="EUR">EUR — Euro</option><option value="ZAR">ZAR — South African rand</option><option value="KES">KES — Kenyan shilling</option><option value="TZS">TZS — Tanzanian shilling</option><option value="BWP">BWP — Botswana pula</option><option value="NGN">NGN — Nigerian naira</option>
              </select>
            </Field>
            <Field label="Region or state" inputId="clinic-region">
              <input id="clinic-region" className="cl-onboarding-input" value={form.region} onChange={(event) => update('region', event.target.value)} placeholder="e.g. Central Region" autoComplete="address-level1" />
            </Field>
            <Field label="City" inputId="clinic-city">
              <input id="clinic-city" className="cl-onboarding-input" value={form.city} onChange={(event) => update('city', event.target.value)} placeholder="e.g. Lilongwe" autoComplete="address-level2" />
            </Field>
            <Field label="Clinic address" inputId="clinic-address">
              <input id="clinic-address" className="cl-onboarding-input" value={form.addressLine1} onChange={(event) => update('addressLine1', event.target.value)} placeholder="Street address" autoComplete="street-address" />
            </Field>
            <Field label="Postal code" inputId="clinic-postal">
              <input id="clinic-postal" className="cl-onboarding-input" value={form.postalCode} onChange={(event) => update('postalCode', event.target.value)} placeholder="Postal code" autoComplete="postal-code" />
            </Field>

            <Field label="Administrator first name" inputId="administrator-first-name">
              <IconInput inputId="administrator-first-name" icon={<UserRound size={16} />} value={form.adminFirstName} onChange={(value) => update('adminFirstName', value)} autoComplete="given-name" />
            </Field>
            <Field label="Administrator last name" inputId="administrator-last-name">
              <IconInput inputId="administrator-last-name" icon={<UserRound size={16} />} value={form.adminLastName} onChange={(value) => update('adminLastName', value)} autoComplete="family-name" />
            </Field>

            <Field label="Administrator work email" inputId="administrator-email" className="cl-onboarding-field-full">
              <IconInput inputId="administrator-email" icon={<Mail size={16} />} type="email" value={form.adminEmail} onChange={(value) => update('adminEmail', value)} placeholder="admin@yourclinic.org" autoComplete="email" />
            </Field>

            <Field label="Password" inputId="clinic-password" helperId="clinic-password-help" helper="Use at least 6 characters.">
              <IconInput inputId="clinic-password" icon={<Lock size={16} />} type={showPassword ? 'text' : 'password'} value={form.password} onChange={(value) => update('password', value)} minLength={6} autoComplete="new-password" ariaDescribedBy="clinic-password-help" showPassword={showPassword} onTogglePassword={() => setShowPassword((visible) => !visible)} />
            </Field>
            <Field label="Confirm password" inputId="clinic-confirm-password">
              <IconInput inputId="clinic-confirm-password" icon={<Lock size={16} />} type={showConfirmPassword ? 'text' : 'password'} value={form.confirmPassword} onChange={(value) => update('confirmPassword', value)} minLength={6} autoComplete="new-password" showPassword={showConfirmPassword} onTogglePassword={() => setShowConfirmPassword((visible) => !visible)} />
            </Field>
          </div>

          <button type="submit" disabled={submitting} className="cl-ui-button cl-ui-button-primary cl-ui-button-lg cl-onboarding-submit">
            {submitting ? 'Creating workspace…' : 'Create clinic workspace'} <ArrowRight size={16} aria-hidden="true" />
          </button>
          <p className="cl-onboarding-signin">Already have an account? <button type="button" onClick={() => onNavigate('/login')}>Sign in</button></p>
        </form>
      )}
    </OnboardingShell>
  );
};

export const InvitationAcceptView: React.FC<ClinicOnboardingViewProps> = ({ onNavigate }) => {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [form, setForm] = useState({ firstName: '', lastName: '', password: '', confirmPassword: '' });
  const [error, setError] = useState<string | null>(token ? null : 'This invitation link is missing its token.');
  const [complete, setComplete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(null);
    if (form.password !== form.confirmPassword) { setError('The passwords do not match.'); return; }
    setSubmitting(true);
    try { await api.v1AcceptInvitation({ token, firstName: form.firstName, lastName: form.lastName, password: form.password }); setComplete(true); }
    catch (err) { setError((err as Error).message || 'This invitation could not be accepted.'); }
    finally { setSubmitting(false); }
  };

  return (
    <OnboardingShell invitation>
      {complete ? (
        <div className="cl-onboarding-result" role="status" aria-live="polite">
          <div className="cl-onboarding-result-icon" aria-hidden="true"><CheckCircle2 size={22} /></div>
          <div><h2>Account created</h2><p>Your invitation has been accepted. Sign in to continue.</p></div>
          <button type="button" className="cl-ui-button cl-ui-button-primary cl-ui-button-md" onClick={() => onNavigate('/login')}>
            Go to sign in <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <>
          <div className="cl-onboarding-form-header">
            <p className="cl-onboarding-eyebrow">Secure account setup</p>
            <h2>Accept your invitation</h2>
            <p>Use your invitation to create a personal account. Your clinic administrator controls your assigned role.</p>
          </div>
          <form onSubmit={submit} className="cl-onboarding-form">
            {error && <div className="cl-onboarding-error" role="alert">{error}</div>}
            <div className="cl-onboarding-fields">
              <Field label="First name" inputId="invitation-first-name">
                <IconInput inputId="invitation-first-name" icon={<UserRound size={16} />} value={form.firstName} onChange={(value) => update('firstName', value)} autoComplete="given-name" />
              </Field>
              <Field label="Last name" inputId="invitation-last-name">
                <IconInput inputId="invitation-last-name" icon={<UserRound size={16} />} value={form.lastName} onChange={(value) => update('lastName', value)} autoComplete="family-name" />
              </Field>
              <Field label="Password" inputId="invitation-password" className="cl-onboarding-field-full" helperId="invitation-password-help" helper="Use at least 6 characters.">
                <IconInput inputId="invitation-password" icon={<Lock size={16} />} type={showPassword ? 'text' : 'password'} value={form.password} onChange={(value) => update('password', value)} minLength={6} autoComplete="new-password" showPassword={showPassword} onTogglePassword={() => setShowPassword((visible) => !visible)} />
              </Field>
              <Field label="Confirm password" inputId="invitation-confirm-password" className="cl-onboarding-field-full">
                <IconInput inputId="invitation-confirm-password" icon={<Lock size={16} />} type={showConfirmPassword ? 'text' : 'password'} value={form.confirmPassword} onChange={(value) => update('confirmPassword', value)} minLength={6} autoComplete="new-password" showPassword={showConfirmPassword} onTogglePassword={() => setShowConfirmPassword((visible) => !visible)} />
              </Field>
            </div>
            <button type="submit" disabled={submitting || !token} className="cl-ui-button cl-ui-button-primary cl-ui-button-lg cl-onboarding-submit">
              {submitting ? 'Creating account…' : 'Accept invitation'} <ArrowRight size={16} aria-hidden="true" />
            </button>
            <p className="cl-onboarding-signin">Already have an account? <button type="button" onClick={() => onNavigate('/login')}>Sign in</button></p>
          </form>
        </>
      )}
    </OnboardingShell>
  );
};

interface ClinicSetupViewProps extends ClinicOnboardingViewProps { onActivated: () => Promise<void>; }

const setupSteps = [
  'Register clinic', 'Verify email', 'Clinic profile', 'Departments',
  'Department administrators', 'Staff invitations', 'Review and activate',
];
const departmentSuggestions = ['Reception and Front Desk', 'Nursing', 'Clinical Services', 'Laboratory', 'Pharmacy', 'Billing and Finance', 'Administration', 'Records Management', 'Radiology and Imaging'];

export const VerifyEmailView: React.FC<ClinicOnboardingViewProps> = ({ onNavigate }) => {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Checking your verification link…');
  useEffect(() => {
    if (!token) { setState('error'); setMessage('This verification link is missing its token.'); return; }
    api.v1VerifyEmail(token)
      .then((result) => { setState('success'); setMessage(result.nextStep); })
      .catch((error) => { setState('error'); setMessage((error as Error).message || 'This verification link is invalid or has expired.'); });
  }, [token]);
  return (
    <OnboardingShell>
      <div className="cl-onboarding-form-header">
        <p className="cl-onboarding-eyebrow">Email verification</p>
        <h2>{state === 'success' ? 'Email verified' : state === 'loading' ? 'Verifying your email' : 'Verification needs attention'}</h2>
        <p>{message}</p>
      </div>
      <div className={`cl-onboarding-result ${state === 'error' ? 'cl-onboarding-error' : ''}`} role={state === 'error' ? 'alert' : 'status'}>
        {state === 'success' ? 'Your email is verified. Sign in to continue the clinic setup.' : state === 'loading' ? 'Please wait while we securely check the link.' : 'Request a new verification email after signing in. Your registration progress is still saved.'}
      </div>
      <button type="button" className="cl-ui-button cl-ui-button-primary cl-ui-button-md" onClick={() => onNavigate('/login')}>Continue to sign in <ArrowRight size={16} aria-hidden="true" /></button>
    </OnboardingShell>
  );
};

export const ClinicSetupView: React.FC<ClinicSetupViewProps> = ({ onNavigate, onActivated }) => {
  const [setup, setSetup] = useState<any>(null);
  const [activeStep, setActiveStep] = useState(2);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [profile, setProfile] = useState<Record<string, string>>({ countryCode: '', region: '', city: '', addressLine1: '', postalCode: '', currencyCode: '', timezone: '', phone: '' });
  const [customDepartment, setCustomDepartment] = useState('');
  const [inviteByDepartment, setInviteByDepartment] = useState<Record<string, { firstName: string; lastName: string; email: string }>>({});
  const [staffInvite, setStaffInvite] = useState({ firstName: '', lastName: '', email: '', roleCode: 'RECEPTIONIST' });

  const refresh = async () => {
    setLoading(true);
    try {
      const next = await api.v1GetOnboardingState();
      setSetup(next);
      const org = next.organization || {};
      setProfile({ countryCode: org.country_code || 'MWI', region: org.region || '', city: org.city || '', addressLine1: org.address_line1 || '', postalCode: org.postal_code || '', currencyCode: org.currency_code || 'MWK', timezone: org.timezone || 'Africa/Blantyre', phone: org.phone || '' });
      const missing = next.missingSteps || [];
      setActiveStep(missing.includes('verify_email') ? 2 : missing.includes('profile') ? 3 : missing.includes('departments') ? 4 : missing.includes('department_administrators') ? 5 : missing.includes('staff_invitations') ? 6 : 7);
    } catch (err) { setError((err as Error).message || 'Clinic setup could not be loaded.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);

  const run = async (action: () => Promise<void>, success?: string) => {
    setError(null); setMessage(null); setSaving(true);
    try { await action(); if (success) setMessage(success); await refresh(); }
    catch (err) { setError((err as Error).message || 'The change could not be saved.'); }
    finally { setSaving(false); }
  };

  if (loading && !setup) return <OnboardingShell><p className="cl-onboarding-loading">Loading your clinic setup…</p></OnboardingShell>;
  if (!setup) return <OnboardingShell><div className="cl-onboarding-error" role="alert">{error || 'Clinic setup is unavailable.'}</div></OnboardingShell>;
  const pendingAdmins = new Set((setup.pendingInvitations || [])
    .filter((item: any) => item.role_code === 'DEPARTMENT_ADMIN'
      && item.department_id
      && new Date(String(item.expires_at)).getTime() > Date.now())
    .map((item: any) => String(item.department_id)));
  const eligibleUsers = setup.organizationUsers || [];

  const createDepartment = (name: string) => run(async () => {
    const code = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || `DEPT_${Date.now()}`;
    await api.v1CreateOnboardingDepartment({ name, code });
  }, 'Department saved.');
  const saveProfile = () => run(async () => {
    await api.v1SaveOnboardingProfile(profile);
  }, 'Clinic profile saved.');
  const activate = () => run(async () => {
    await api.v1CompleteOnboardingStep('review');
    await api.v1ActivateOnboarding();
    await onActivated();
  }, 'Clinic activated.');

  return (
    <OnboardingShell>
      <div className="cl-onboarding-form-header">
        <p className="cl-onboarding-eyebrow">Clinic setup</p>
        <h2>Complete your clinic workspace</h2>
        <p>Save each step as you go. You can return later, and the workspace stays locked until setup is complete.</p>
      </div>
      <ol className="cl-onboarding-steps" aria-label="Clinic setup progress">
        {setupSteps.map((label, index) => <li key={label} className={index + 1 === activeStep ? 'is-current' : (setup.completedSteps || []).length > index ? 'is-complete' : ''}><span>{index + 1}</span>{label}</li>)}
      </ol>
      {error && <div className="cl-onboarding-error" role="alert">{error}</div>}
      {message && <div className="cl-onboarding-success" role="status">{message}</div>}

      {activeStep === 2 && (
        <section className="cl-onboarding-step-panel">
          <h3>Verify the administrator email</h3>
          <p>{setup.emailVerified ? 'The administrator email is verified.' : 'Open the verification link sent to the administrator email before continuing.'}</p>
          {!setup.emailVerified && <button type="button" disabled={saving} className="cl-ui-button cl-ui-button-secondary cl-ui-button-md" onClick={() => run(async () => { const result = await api.v1ResendVerification(); if (!result.accepted) throw new Error(result.message); }, 'Verification email accepted for delivery.')}>Send verification email again</button>}
          {setup.emailVerified && <button type="button" className="cl-ui-button cl-ui-button-primary cl-ui-button-md" onClick={() => setActiveStep(3)}>Continue <ArrowRight size={16} aria-hidden="true" /></button>}
        </section>
      )}

      {activeStep === 3 && (
        <section className="cl-onboarding-step-panel">
          <h3>Tell us about the clinic</h3>
          <div className="cl-onboarding-fields">
            <Field label="Country" inputId="setup-country"><select id="setup-country" className="cl-onboarding-input" value={profile.countryCode} onChange={(e) => setProfile({ ...profile, countryCode: e.target.value })}><option value="MWI">Malawi</option><option value="GBR">United Kingdom</option><option value="USA">United States</option><option value="ZAF">South Africa</option><option value="KEN">Kenya</option><option value="TZA">Tanzania</option><option value="BWA">Botswana</option><option value="NGA">Nigeria</option><option value="CAN">Canada</option><option value="AUS">Australia</option><option value="IND">India</option></select></Field>
            <Field label="Preferred billing currency" inputId="setup-currency"><select id="setup-currency" className="cl-onboarding-input" value={profile.currencyCode} onChange={(e) => setProfile({ ...profile, currencyCode: e.target.value })}><option value="MWK">MWK — Malawian kwacha</option><option value="GBP">GBP — Pound sterling</option><option value="USD">USD — US dollar</option><option value="EUR">EUR — Euro</option><option value="ZAR">ZAR — South African rand</option><option value="KES">KES — Kenyan shilling</option><option value="TZS">TZS — Tanzanian shilling</option><option value="BWP">BWP — Botswana pula</option><option value="NGN">NGN — Nigerian naira</option><option value="CAD">CAD — Canadian dollar</option><option value="AUD">AUD — Australian dollar</option><option value="CHF">CHF — Swiss franc</option><option value="INR">INR — Indian rupee</option></select></Field>
            <Field label="Region, state, or district" inputId="setup-region"><input id="setup-region" className="cl-onboarding-input" value={profile.region} onChange={(e) => setProfile({ ...profile, region: e.target.value })} /></Field>
            <Field label="City or locality" inputId="setup-city"><input id="setup-city" className="cl-onboarding-input" required value={profile.city} onChange={(e) => setProfile({ ...profile, city: e.target.value })} /></Field>
            <Field label="Street address" inputId="setup-address"><input id="setup-address" className="cl-onboarding-input" value={profile.addressLine1} onChange={(e) => setProfile({ ...profile, addressLine1: e.target.value })} /></Field>
            <Field label="Time zone" inputId="setup-timezone"><input id="setup-timezone" className="cl-onboarding-input" required value={profile.timezone} onChange={(e) => setProfile({ ...profile, timezone: e.target.value })} placeholder="e.g. Africa/Blantyre" /></Field>
          </div>
          <button type="button" disabled={saving} className="cl-ui-button cl-ui-button-primary cl-ui-button-md" onClick={saveProfile}>Save and continue <ArrowRight size={16} aria-hidden="true" /></button>
        </section>
      )}

      {activeStep === 4 && (
        <section className="cl-onboarding-step-panel"><h3>Choose your departments</h3><p>Select the areas your clinic actually uses. At least one is required.</p><div className="cl-onboarding-suggestion-grid">{departmentSuggestions.map((name) => <button type="button" key={name} disabled={saving || (setup.departments || []).some((d: any) => d.name === name)} className="cl-ui-button cl-ui-button-secondary cl-ui-button-sm" onClick={() => void createDepartment(name)}>{(setup.departments || []).some((d: any) => d.name === name) ? 'Added: ' : '+ '}{name}</button>)}</div><div className="cl-onboarding-inline-form"><input className="cl-onboarding-input" value={customDepartment} onChange={(e) => setCustomDepartment(e.target.value)} placeholder="Custom department name" /><button type="button" disabled={saving || customDepartment.trim().length < 2} className="cl-ui-button cl-ui-button-primary cl-ui-button-md" onClick={() => { const name = customDepartment.trim(); setCustomDepartment(''); void createDepartment(name); }}>Add department</button></div><ul className="cl-onboarding-record-list">{(setup.departments || []).map((d: any) => <li key={d.id}><strong>{d.name}</strong><span>{d.code}</span></li>)}</ul>{(setup.departments || []).length > 0 && <button type="button" className="cl-ui-button cl-ui-button-primary cl-ui-button-md" onClick={() => setActiveStep(5)}>Continue <ArrowRight size={16} aria-hidden="true" /></button>}</section>
      )}

      {activeStep === 5 && (
        <section className="cl-onboarding-step-panel"><h3>Assign department administrators</h3><p>You can assign administrators now, or manage departments yourself and add administrators later.</p>{(setup.departments || []).map((department: any) => { const invite = inviteByDepartment[department.id] || { firstName: '', lastName: '', email: '' }; return <div className="cl-onboarding-department-row" key={department.id}><div><strong>{department.name}</strong><span>{department.administrator_user_id ? 'Administrator assigned' : pendingAdmins.has(department.id) ? 'Invitation pending' : 'Needs an administrator'}</span></div><select className="cl-onboarding-input" value={department.administrator_user_id || ''} onChange={(e) => void run(async () => { if (!e.target.value) return; await api.v1AssignDepartmentAdministrator(department.id, e.target.value); }, 'Department administrator assigned.')}><option value="">Select an existing employee</option>{eligibleUsers.map((user: any) => <option key={user.id} value={user.id}>{user.first_name} {user.last_name} — {user.role_name}</option>)}</select>{!department.administrator_user_id && !pendingAdmins.has(department.id) && <div className="cl-onboarding-inline-form"><input className="cl-onboarding-input" placeholder="First name" value={invite.firstName} onChange={(e) => setInviteByDepartment({ ...inviteByDepartment, [department.id]: { ...invite, firstName: e.target.value } })} /><input className="cl-onboarding-input" placeholder="Last name" value={invite.lastName} onChange={(e) => setInviteByDepartment({ ...inviteByDepartment, [department.id]: { ...invite, lastName: e.target.value } })} /><input className="cl-onboarding-input" placeholder="Work email" value={invite.email} onChange={(e) => setInviteByDepartment({ ...inviteByDepartment, [department.id]: { ...invite, email: e.target.value } })} /><button type="button" disabled={saving} className="cl-ui-button cl-ui-button-secondary cl-ui-button-md" onClick={() => void run(async () => { await api.v1CreateInvitation({ ...invite, roleCode: 'DEPARTMENT_ADMIN', departmentId: department.id }); }, 'Administrator invitation saved.')}>Invite</button></div>}</div>; })}<button type="button" className="cl-ui-button cl-ui-button-primary cl-ui-button-md" onClick={() => void run(async () => { await api.v1CompleteOnboardingStep('department_administrators'); setActiveStep(6); }, 'Assignments saved.')}>Continue <ArrowRight size={16} aria-hidden="true" /></button></section>
      )}

      {activeStep === 6 && (
        <section className="cl-onboarding-step-panel"><h3>Invite clinic staff</h3><p>Invitations can remain pending while the clinic activates. No invitation grants access until it is accepted.</p><div className="cl-onboarding-fields"><Field label="First name" inputId="staff-first"><input id="staff-first" className="cl-onboarding-input" value={staffInvite.firstName} onChange={(e) => setStaffInvite({ ...staffInvite, firstName: e.target.value })} /></Field><Field label="Last name" inputId="staff-last"><input id="staff-last" className="cl-onboarding-input" value={staffInvite.lastName} onChange={(e) => setStaffInvite({ ...staffInvite, lastName: e.target.value })} /></Field><Field label="Work email" inputId="staff-email"><input id="staff-email" className="cl-onboarding-input" type="email" value={staffInvite.email} onChange={(e) => setStaffInvite({ ...staffInvite, email: e.target.value })} /></Field><Field label="Role" inputId="staff-role"><select id="staff-role" className="cl-onboarding-input" value={staffInvite.roleCode} onChange={(e) => setStaffInvite({ ...staffInvite, roleCode: e.target.value })}><option value="RECEPTIONIST">Receptionist</option><option value="NURSE">Nurse</option><option value="DOCTOR">Doctor</option><option value="BILLING_STAFF">Billing staff</option><option value="LAB_STAFF">Laboratory staff</option></select></Field></div><button type="button" disabled={saving} className="cl-ui-button cl-ui-button-secondary cl-ui-button-md" onClick={() => void run(async () => { await api.v1CreateInvitation(staffInvite); setStaffInvite({ firstName: '', lastName: '', email: '', roleCode: 'RECEPTIONIST' }); }, 'Staff invitation saved.')}>Send invitation</button><button type="button" className="cl-ui-button cl-ui-button-primary cl-ui-button-md" onClick={() => void run(async () => { await api.v1CompleteOnboardingStep('staff_invitations'); setActiveStep(7); }, 'Staff setup complete.')}>Continue to review <ArrowRight size={16} aria-hidden="true" /></button></section>
      )}

      {activeStep === 7 && (
        <section className="cl-onboarding-step-panel"><h3>Review and activate</h3><p>Review the checklist. Activation will unlock the normal clinic workspace.</p><ul className="cl-onboarding-checklist"><li className={setup.emailVerified ? 'is-complete' : ''}>Administrator email verified</li><li className={(setup.organization?.city && setup.organization?.timezone) ? 'is-complete' : ''}>Clinic profile and regional settings saved</li><li className={(setup.departments || []).length > 0 ? 'is-complete' : ''}>At least one department created</li><li className={(setup.completedSteps || []).includes('department_administrators') || (setup.departments || []).every((d: any) => d.administrator_user_id || pendingAdmins.has(d.id)) ? 'is-complete' : ''}>Department administrators assigned or deferred</li><li className={(setup.completedSteps || []).includes('staff_invitations') ? 'is-complete' : ''}>Staff setup reviewed</li></ul><button type="button" disabled={saving || (setup.missingSteps || []).length > 0} className="cl-ui-button cl-ui-button-primary cl-ui-button-lg" onClick={() => void activate()}>Activate clinic workspace <ArrowRight size={16} aria-hidden="true" /></button>{(setup.missingSteps || []).length > 0 && <p className="cl-onboarding-helper">Complete the remaining setup items before activation.</p>}</section>
      )}
      <p className="cl-onboarding-signin"><button type="button" onClick={() => onNavigate('/login')}>Return to sign in</button></p>
    </OnboardingShell>
  );
};
