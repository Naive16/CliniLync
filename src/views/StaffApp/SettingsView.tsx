/** CLINILYNC personal and organization settings. */

import React, { useEffect, useState } from 'react';
import { Building2, CreditCard, Eye, EyeOff, KeyRound, RefreshCw, Save, UserPlus, UserRound, UsersRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../api/client.js';
import { Alert, Button, Card, PageHeader } from '../../components/common/ui.js';

export const SettingsView: React.FC = () => {
  const { user, roles, activeOrganization, hasPermission, refreshSession } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const canManageOrganization = hasPermission('organization.view') || hasPermission('organization.update');
  const canEditOrganization = hasPermission('organization.update');
  const [organizationForm, setOrganizationForm] = useState({ countryCode: '', region: '', city: '', addressLine1: '', postalCode: '', currencyCode: '', timezone: '', phone: '', email: '' });
  const [organizationMessage, setOrganizationMessage] = useState<string | null>(null);
  const [organizationError, setOrganizationError] = useState<string | null>(null);
  const [organizationSaving, setOrganizationSaving] = useState(false);
  const canInvite = hasPermission('user.view') && hasPermission('user.create');
  const [invitations, setInvitations] = useState<any[]>([]);
  const [inviteForm, setInviteForm] = useState({ firstName: '', lastName: '', email: '', roleCode: 'DOCTOR' });
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const canViewSubscription = hasPermission('subscription.view');
  const canManageSubscription = hasPermission('subscription.manage');
  const [subscriptionPlans, setSubscriptionPlans] = useState<any[]>([]);
  const [currentSubscription, setCurrentSubscription] = useState<any | null>(null);
  const [currentPlan, setCurrentPlan] = useState<any | null>(null);
  const [staffCount, setStaffCount] = useState(0);
  const [recommendedPlanCode, setRecommendedPlanCode] = useState('');
  const [selectedPlanCode, setSelectedPlanCode] = useState('');
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [subscriptionAction, setSubscriptionAction] = useState(false);
  const [subscriptionMessage, setSubscriptionMessage] = useState<string | null>(null);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);

  const loadInvitations = async () => {
    if (!canInvite) return;
    try { const result = await api.v1GetInvitations(); setInvitations(result.invitations || []); }
    catch (error) { setInviteError((error as Error).message || 'Invitations could not be loaded.'); }
  };

  useEffect(() => { void loadInvitations(); }, [activeOrganization?.id, canInvite]);
  const loadSubscription = async () => {
    if (!canViewSubscription) return;
    setSubscriptionLoading(true); setSubscriptionError(null);
    try {
      const [plansResult, currentResult] = await Promise.all([api.v1GetSubscriptionPlans(), api.v1GetCurrentSubscription()]);
      setSubscriptionPlans(plansResult.plans || []);
      setStaffCount(Number(plansResult.staffCount || 0));
      setRecommendedPlanCode(plansResult.recommendedPlanCode || '');
      setSelectedPlanCode((currentResult.plan || {}).code || plansResult.recommendedPlanCode || plansResult.plans?.[0]?.code || '');
      setCurrentSubscription(currentResult.subscription || null);
      setCurrentPlan(currentResult.plan || null);
    } catch (error) { setSubscriptionError((error as Error).message || 'Subscription details could not be loaded.'); }
    finally { setSubscriptionLoading(false); }
  };

  useEffect(() => { void loadSubscription(); }, [activeOrganization?.id, canViewSubscription]);
  useEffect(() => {
    if (!activeOrganization) return;
    setOrganizationForm({
      countryCode: activeOrganization.country_code || '', region: activeOrganization.region || '', city: activeOrganization.city || '',
      addressLine1: activeOrganization.address_line1 || '', postalCode: activeOrganization.postal_code || '', currencyCode: activeOrganization.currency_code || '',
      timezone: activeOrganization.timezone || '', phone: activeOrganization.phone || '', email: activeOrganization.email || ''
    });
  }, [activeOrganization]);

  const saveOrganization = async (event: React.FormEvent) => {
    event.preventDefault(); setOrganizationSaving(true); setOrganizationError(null); setOrganizationMessage(null);
    try {
      await api.v1UpdateCurrentOrganization(organizationForm);
      await refreshSession();
      setOrganizationMessage('Organization settings saved.');
    } catch (error) { setOrganizationError((error as Error).message || 'Organization settings could not be saved.'); }
    finally { setOrganizationSaving(false); }
  };

  const createInvitation = async (event: React.FormEvent) => {
    event.preventDefault(); setInviteLoading(true); setInviteError(null); setInviteMessage(null);
    try {
      const result = await api.v1CreateInvitation(inviteForm);
      const tokenMessage = result.developmentToken ? ` Development invitation token: ${result.developmentToken}` : ' Email delivery is not configured in this environment.';
      setInviteMessage(`Invitation created for ${inviteForm.email}.${tokenMessage}`);
      setInviteForm({ firstName: '', lastName: '', email: '', roleCode: 'DOCTOR' });
      await loadInvitations();
    } catch (error) { setInviteError((error as Error).message || 'Invitation could not be created.'); }
    finally { setInviteLoading(false); }
  };

  const revokeInvitation = async (id: string) => {
    try { await api.v1RevokeInvitation(id); setInviteMessage('Invitation revoked.'); await loadInvitations(); }
    catch (error) { setInviteError((error as Error).message || 'Invitation could not be revoked.'); }
  };

  const resendInvitation = async (id: string) => {
    try {
      const result = await api.v1ResendInvitation(id);
      setInviteMessage(result.developmentToken ? `Invitation renewed. Development invitation token: ${result.developmentToken}` : 'Invitation renewed. Email delivery is not configured in this environment.');
      await loadInvitations();
    } catch (error) { setInviteError((error as Error).message || 'Invitation could not be renewed.'); }
  };

  const startTrial = async () => {
    setSubscriptionAction(true); setSubscriptionError(null); setSubscriptionMessage(null);
    try { await api.v1StartSubscriptionTrial(); setSubscriptionMessage('Your organization trial has started.'); await loadSubscription(); }
    catch (error) { setSubscriptionError((error as Error).message || 'The organization trial could not be started.'); }
    finally { setSubscriptionAction(false); }
  };

  const startCheckout = async () => {
    if (!selectedPlanCode) return;
    setSubscriptionAction(true); setSubscriptionError(null); setSubscriptionMessage(null);
    try {
      const result = await api.v1CreateSubscriptionCheckout(selectedPlanCode);
      if (result.checkoutUrl) window.location.assign(result.checkoutUrl);
    } catch (error) { setSubscriptionError((error as Error).message || 'Monthly checkout is not available.'); }
    finally { setSubscriptionAction(false); }
  };

  const cancelSubscription = async () => {
    if (!window.confirm('Cancel this organization subscription at the end of the current period?')) return;
    setSubscriptionAction(true); setSubscriptionError(null); setSubscriptionMessage(null);
    try { await api.v1CancelSubscription(); setSubscriptionMessage('The subscription will end at the close of the current period.'); await loadSubscription(); }
    catch (error) { setSubscriptionError((error as Error).message || 'The subscription could not be cancelled.'); }
    finally { setSubscriptionAction(false); }
  };

  const planStaffLabel = (plan: any) => {
    const min = Number(plan?.entitlements?.staff_min || 1);
    const max = plan?.entitlements?.staff_max == null ? null : Number(plan.entitlements.staff_max);
    return max ? `${min}–${max} staff` : `${min}+ staff`;
  };

  const planPrice = (plan: any) => new Intl.NumberFormat(undefined, { style: 'currency', currency: plan?.currency || 'GBP', maximumFractionDigits: 0 }).format(Number(plan?.amount_minor || 0) / 100);

  const handlePasswordSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordMessage('Enter your current password and choose a new password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage('The new passwords do not match.');
      return;
    }
    setPasswordMessage('Password changes are not available in this environment because the secure server endpoint is not implemented yet.');
  };

  return (
    <div className="cl-ui-page space-y-6">
      <PageHeader title="Settings" subtitle="Manage your account and workspace preferences." />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-6 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <div className="w-10 h-10 rounded-lg bg-teal-50 text-teal-800 flex items-center justify-center">
              <UserRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Your account</h2>
              <p className="text-xs text-slate-500">Only your account information is shown here.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 text-xs">
            <div className="p-3 bg-slate-50 rounded border border-slate-100">
              <span className="text-slate-500 block">Name</span>
              <strong className="block mt-1 text-sm text-slate-900">{user?.firstName} {user?.lastName}</strong>
            </div>
            <div className="p-3 bg-slate-50 rounded border border-slate-100">
              <span className="text-slate-500 block">Email</span>
              <strong className="block mt-1 text-sm text-slate-900 break-words">{user?.email}</strong>
            </div>
            <div className="p-3 bg-slate-50 rounded border border-slate-100">
              <span className="text-slate-500 block">Role</span>
              <strong className="block mt-1 text-sm text-slate-900">{roles.map((role) => role.name).join(', ') || 'Staff member'}</strong>
            </div>
            <div className="p-3 bg-slate-50 rounded border border-slate-100">
              <span className="text-slate-500 block">Organization</span>
              <strong className="block mt-1 text-sm text-slate-900">{activeOrganization?.name || 'Your organization'}</strong>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-4 space-y-2">
            <h3 className="text-sm font-bold text-slate-900">Workspace preferences</h3>
            <p className="text-xs text-slate-600">Your workspace uses {activeOrganization?.timezone || 'the organization timezone'} and {activeOrganization?.currency_code || 'the organization currency'}.</p>
            <p className="text-[11px] text-slate-500">Contact an administrator if these organization-wide settings need to change.</p>
          </div>
        </Card>

        <Card className="p-6 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <div className="w-10 h-10 rounded-lg bg-teal-50 text-teal-800 flex items-center justify-center">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Change password</h2>
              <p className="text-xs text-slate-500">Your password is never displayed or stored in this page.</p>
            </div>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            {[['Current password', currentPassword, setCurrentPassword], ['New password', newPassword, setNewPassword], ['Confirm new password', confirmPassword, setConfirmPassword]].map(([label, value, setter]) => (
              <label key={label as string} className="block text-xs font-semibold text-slate-700">
                <span className="block mb-1">{label as string}</span>
                <span className="relative block">
                  <input type={showPasswords ? 'text' : 'password'} value={value as string} onChange={(event) => (setter as React.Dispatch<React.SetStateAction<string>>)(event.target.value)} className="w-full pr-10" autoComplete={label === 'Current password' ? 'current-password' : 'new-password'} />
                  <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500" onClick={() => setShowPasswords((visible) => !visible)} aria-label={showPasswords ? 'Hide password' : 'Show password'}>
                    {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </span>
              </label>
            ))}
            <Button type="submit" variant="primary" size="md" icon={<KeyRound className="w-4 h-4" />}>Change password</Button>
            {passwordMessage && <Alert tone="warning">{passwordMessage}</Alert>}
          </form>
          <p className="text-[11px] text-slate-500">Forgot your password? The current deployment does not provide a secure reset endpoint yet. No reset link or token is generated here.</p>
        </Card>
      </div>

      {canViewSubscription && <Card className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-50 text-sky-800 flex items-center justify-center"><CreditCard className="w-5 h-5" /></div>
            <div><h2 className="text-base font-bold text-slate-900">Monthly subscription</h2><p className="text-xs text-slate-500">Pricing is based on active staff in {activeOrganization?.name || 'this organization'}.</p></div>
          </div>
          {currentSubscription && <span className="text-xs font-bold uppercase tracking-wide text-sky-800">{currentSubscription.status}</span>}
        </div>
        {subscriptionError && <Alert tone="danger">{subscriptionError}</Alert>}
        {subscriptionMessage && <Alert tone="success">{subscriptionMessage}</Alert>}
        {subscriptionLoading ? <p className="text-xs text-slate-500">Loading subscription options…</p> : <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-4"><span className="text-xs text-slate-500 flex items-center gap-1"><UsersRound className="w-3.5 h-3.5" />Active clinic staff</span><strong className="block mt-1 text-xl text-slate-900">{staffCount}</strong><span className="text-[11px] text-slate-500">Patients and platform administrators are not counted.</span></div>
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-4"><span className="text-xs text-slate-600">Recommended tier</span><strong className="block mt-1 text-sm text-slate-900">{subscriptionPlans.find((plan) => plan.code === recommendedPlanCode)?.name || 'Based on staff count'}</strong><span className="text-[11px] text-slate-600">{subscriptionPlans.find((plan) => plan.code === recommendedPlanCode) ? planStaffLabel(subscriptionPlans.find((plan) => plan.code === recommendedPlanCode)) : 'Seat-based monthly pricing'}</span></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {subscriptionPlans.map((plan) => {
              const selected = selectedPlanCode === plan.code;
              const recommended = recommendedPlanCode === plan.code;
              return <button type="button" key={plan.code} onClick={() => setSelectedPlanCode(plan.code)} className={`text-left rounded-lg border p-4 transition ${selected ? 'border-sky-500 ring-2 ring-sky-100' : 'border-slate-200 hover:border-sky-300'} ${recommended ? 'bg-sky-50/60' : 'bg-white'}`} aria-pressed={selected}>
                <span className="text-xs font-bold text-slate-900">{plan.name}</span><span className="block mt-2 text-lg font-bold text-slate-900">{planPrice(plan)}<small className="text-[11px] font-medium text-slate-500">/month</small></span><span className="block mt-1 text-[11px] text-slate-500">{planStaffLabel(plan)}</span>{recommended && <span className="inline-block mt-3 rounded-full bg-sky-100 px-2 py-1 text-[10px] font-bold text-sky-800">Recommended</span>}
              </button>;
            })}
          </div>
          {currentSubscription && currentPlan && <p className="text-xs text-slate-600">Current plan: <strong>{currentPlan.name}</strong> · {planStaffLabel(currentPlan)} · {planPrice(currentPlan)}/month{currentSubscription.cancel_at_period_end ? ' · Cancellation scheduled' : ''}</p>}
          {canManageSubscription && <div className="flex flex-wrap gap-3">
            {!currentSubscription && <Button type="button" variant="primary" size="md" disabled={subscriptionAction} onClick={() => void startTrial()}>{subscriptionAction ? 'Starting…' : 'Start 7-day trial'}</Button>}
            {!currentSubscription && <Button type="button" variant="secondary" size="md" disabled={subscriptionAction || !selectedPlanCode} onClick={() => void startCheckout()}>{subscriptionAction ? 'Opening checkout…' : 'Choose monthly plan'}</Button>}
            {currentSubscription && !currentSubscription.cancel_at_period_end && !['canceled', 'expired'].includes(currentSubscription.status) && <Button type="button" variant="danger" size="md" disabled={subscriptionAction} onClick={() => void cancelSubscription()}>Cancel at period end</Button>}
          </div>}
          {!canManageSubscription && <p className="text-xs text-slate-500">Only an organization owner or administrator can change the subscription.</p>}
        </>}
      </Card>}

      {canManageOrganization && <Card className="p-6 space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
          <div className="w-10 h-10 rounded-lg bg-teal-50 text-teal-800 flex items-center justify-center">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Organization settings</h2>
            <p className="text-xs text-slate-500">Only authorized organization administrators can manage these settings.</p>
          </div>
        </div>
        {organizationError && <Alert tone="danger">{organizationError}</Alert>}
        {organizationMessage && <Alert tone="success">{organizationMessage}</Alert>}
        {!canEditOrganization ? <div className="grid gap-4 sm:grid-cols-3 text-xs">
          <div className="p-3 bg-slate-50 rounded border border-slate-100"><span className="text-slate-500 block">Organization</span><strong className="block mt-1 text-sm text-slate-900">{activeOrganization?.name}</strong></div>
          <div className="p-3 bg-slate-50 rounded border border-slate-100"><span className="text-slate-500 block">Timezone</span><strong className="block mt-1 text-sm text-slate-900">{activeOrganization?.timezone}</strong></div>
          <div className="p-3 bg-slate-50 rounded border border-slate-100"><span className="text-slate-500 block">Currency</span><strong className="block mt-1 text-sm text-slate-900">{activeOrganization?.currency_code}</strong></div>
        </div> : <form onSubmit={saveOrganization} className="grid gap-4 sm:grid-cols-2 text-xs">
          <label className="font-semibold text-slate-700">Country<select required value={organizationForm.countryCode} onChange={(event) => setOrganizationForm({ ...organizationForm, countryCode: event.target.value })} className="mt-1 w-full"><option value="MWI">Malawi</option><option value="GBR">United Kingdom</option><option value="USA">United States</option><option value="ZAF">South Africa</option><option value="KEN">Kenya</option><option value="TZA">Tanzania</option><option value="BWA">Botswana</option><option value="NGA">Nigeria</option></select></label>
          <label className="font-semibold text-slate-700">Currency<select required value={organizationForm.currencyCode} onChange={(event) => setOrganizationForm({ ...organizationForm, currencyCode: event.target.value })} className="mt-1 w-full"><option value="MWK">MWK — Malawian kwacha</option><option value="GBP">GBP — Pound sterling</option><option value="USD">USD — US dollar</option><option value="EUR">EUR — Euro</option><option value="ZAR">ZAR — South African rand</option><option value="KES">KES — Kenyan shilling</option><option value="TZS">TZS — Tanzanian shilling</option><option value="BWP">BWP — Botswana pula</option><option value="NGN">NGN — Nigerian naira</option></select></label>
          <label className="font-semibold text-slate-700">Region or state<input value={organizationForm.region} onChange={(event) => setOrganizationForm({ ...organizationForm, region: event.target.value })} className="mt-1 w-full" /></label>
          <label className="font-semibold text-slate-700">City<input value={organizationForm.city} onChange={(event) => setOrganizationForm({ ...organizationForm, city: event.target.value })} className="mt-1 w-full" /></label>
          <label className="font-semibold text-slate-700 sm:col-span-2">Clinic address<input value={organizationForm.addressLine1} onChange={(event) => setOrganizationForm({ ...organizationForm, addressLine1: event.target.value })} className="mt-1 w-full" /></label>
          <label className="font-semibold text-slate-700">Postal code<input value={organizationForm.postalCode} onChange={(event) => setOrganizationForm({ ...organizationForm, postalCode: event.target.value })} className="mt-1 w-full" /></label>
          <label className="font-semibold text-slate-700">Timezone<input value={organizationForm.timezone} onChange={(event) => setOrganizationForm({ ...organizationForm, timezone: event.target.value })} className="mt-1 w-full" /></label>
          <label className="font-semibold text-slate-700">Clinic phone<input value={organizationForm.phone} onChange={(event) => setOrganizationForm({ ...organizationForm, phone: event.target.value })} className="mt-1 w-full" /></label>
          <label className="font-semibold text-slate-700">Clinic email<input type="email" value={organizationForm.email} onChange={(event) => setOrganizationForm({ ...organizationForm, email: event.target.value })} className="mt-1 w-full" /></label>
          <div className="sm:col-span-2"><Button type="submit" variant="primary" size="md" disabled={organizationSaving} icon={<Save className="w-4 h-4" />}>{organizationSaving ? 'Saving…' : 'Save organization settings'}</Button></div>
        </form>}
      </Card>}

      {canInvite && <Card className="p-6 space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
          <div className="w-10 h-10 rounded-lg bg-teal-50 text-teal-800 flex items-center justify-center"><UserPlus className="w-5 h-5" /></div>
          <div><h2 className="text-base font-bold text-slate-900">Invite employees</h2><p className="text-xs text-slate-500">Invite people to this organization with an existing Clinilync role.</p></div>
        </div>
        {inviteError && <Alert tone="danger">{inviteError}</Alert>}
        {inviteMessage && <Alert tone="success">{inviteMessage}</Alert>}
        <form onSubmit={createInvitation} className="grid gap-3 sm:grid-cols-4 items-end">
          <label className="text-xs font-semibold text-slate-700">First name<input required value={inviteForm.firstName} onChange={(e) => setInviteForm({ ...inviteForm, firstName: e.target.value })} className="mt-1 w-full" /></label>
          <label className="text-xs font-semibold text-slate-700">Last name<input required value={inviteForm.lastName} onChange={(e) => setInviteForm({ ...inviteForm, lastName: e.target.value })} className="mt-1 w-full" /></label>
          <label className="text-xs font-semibold text-slate-700">Work email<input required type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} className="mt-1 w-full" /></label>
          <label className="text-xs font-semibold text-slate-700">Role<select value={inviteForm.roleCode} onChange={(e) => setInviteForm({ ...inviteForm, roleCode: e.target.value })} className="mt-1 w-full"><option value="DOCTOR">Doctor</option><option value="NURSE">Nurse</option><option value="RECEPTIONIST">Receptionist</option><option value="BILLING_STAFF">Billing staff</option><option value="PHARMACIST">Pharmacist</option><option value="LAB_STAFF">Lab staff</option><option value="SUPPORT_STAFF">Support staff</option><option value="ORG_ADMIN">Organization administrator</option></select></label>
          <Button type="submit" variant="primary" size="md" disabled={inviteLoading} icon={<UserPlus className="w-4 h-4" />}>{inviteLoading ? 'Creating...' : 'Create invitation'}</Button>
        </form>
        <div className="space-y-2"><h3 className="text-sm font-bold text-slate-900">Invitation status</h3>{invitations.length === 0 ? <p className="text-xs text-slate-500">No invitations have been created.</p> : invitations.map((invitation) => { const status = invitation.accepted_at ? 'Accepted' : invitation.revoked_at ? 'Revoked' : new Date(invitation.expires_at).getTime() < Date.now() ? 'Expired' : 'Pending'; return <div key={invitation.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-slate-200 p-3 text-xs"><div><strong className="text-slate-900">{invitation.first_name} {invitation.last_name}</strong><span className="block text-slate-500">{invitation.email} · {invitation.role_name}</span></div><div className="flex items-center gap-2"><span className="text-slate-500">{status}</span>{status === 'Pending' && <><button type="button" className="text-teal-700 font-semibold" onClick={() => void resendInvitation(invitation.id)}><RefreshCw className="inline w-3 h-3 mr-1" />Renew</button><button type="button" className="text-rose-700 font-semibold" onClick={() => void revokeInvitation(invitation.id)}>Revoke</button></>}</div></div>; })}</div>
      </Card>}
    </div>
  );
};
