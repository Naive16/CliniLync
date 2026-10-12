/**
 * CLINILYNC Phase 5 Security, Membership & RBAC Verification Surface
 * 
 * Complies with Clinilync Phase 5 Specification:
 * - Minimal verification surface for the backend security architecture
 * - Real-time demonstration of authentication, organization isolation, RBAC gates, and audit logging
 * - Never trusts client state: all checks invoke authoritative /api/v1/* endpoints
 */

import React, { useState, useEffect } from 'react';
import { useAuth, DEMO_PERSONAS, DemoPersonaKey } from '../context/AuthContext.js';
import { api } from '../api/client.js';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Building2,
  User,
  Key,
  LogOut,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRightLeft,
  Search,
  FileText,
  Lock,
  Layers,
  Activity
} from 'lucide-react';

export const Phase5VerificationView: React.FC<{ onNavigate: (path: string) => void }> = ({ onNavigate }) => {
  const {
    user,
    activeOrganization,
    roles,
    permissions,
    availableOrganizations,
    logout,
    switchOrganization,
    switchDemoUser,
    isLoading
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'membership' | 'rbac' | 'diagnostic' | 'audit'>('diagnostic');

  // Diagnostic State
  const [testPermission, setTestPermission] = useState<string>('encounter.view');
  const [testOrgId, setTestOrgId] = useState<string>('');
  const [diagResult, setDiagResult] = useState<{
    tested: boolean;
    allowed: boolean;
    status: number;
    code?: string;
    message?: string;
    data?: Record<string, unknown>;
  } | null>(null);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);

  // Membership Probe State
  const [probeOrgId, setProbeOrgId] = useState<string>('org_metro_health');
  const [probeResult, setProbeResult] = useState<{
    tested: boolean;
    allowed: boolean;
    status: number;
    code?: string;
    message?: string;
    membership?: Record<string, unknown>;
  } | null>(null);
  const [isProbing, setIsProbing] = useState<boolean>(false);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<Record<string, unknown>[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [isLoadingAudit, setIsLoadingAudit] = useState<boolean>(false);

  // Sync test org default
  useEffect(() => {
    if (activeOrganization) {
      setTestOrgId(activeOrganization.id);
    }
  }, [activeOrganization]);

  // Load audit trail when switching to audit tab
  useEffect(() => {
    if (activeTab === 'audit') {
      fetchAuditTrail();
    }
  }, [activeTab, activeOrganization]);

  const fetchAuditTrail = async () => {
    setIsLoadingAudit(true);
    setAuditError(null);
    try {
      const res = await api.v1GetAuditTrail(25);
      setAuditLogs(res.auditLogs || []);
    } catch (err) {
      const error = err as Error & { code?: string; status?: number };
      setAuditError(error.message || 'Failed to retrieve audit trail');
      setAuditLogs([]);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  const handleEvaluatePermission = async () => {
    setIsEvaluating(true);
    setDiagResult(null);
    try {
      const res = await api.v1VerifyAccess(testPermission, testOrgId || activeOrganization?.id);
      if (res.allowed) {
        setDiagResult({
          tested: true,
          allowed: true,
          status: 200,
          data: res.data as Record<string, unknown>
        });
      } else {
        setDiagResult({
          tested: true,
          allowed: false,
          status: res.status,
          code: res.code,
          message: res.message
        });
      }
    } catch (err) {
      const error = err as Error & { code?: string; status?: number };
      setDiagResult({
        tested: true,
        allowed: false,
        status: error.status || 500,
        code: error.code || 'UNKNOWN_ERROR',
        message: error.message
      });
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleProbeMembership = async () => {
    setIsProbing(true);
    setProbeResult(null);
    try {
      const res = await api.v1GetMembership(probeOrgId);
      setProbeResult({
        tested: true,
        allowed: true,
        status: 200,
        membership: res.membership
      });
    } catch (err) {
      const error = err as Error & { code?: string; status?: number };
      setProbeResult({
        tested: true,
        allowed: false,
        status: error.status || 403,
        code: error.code || 'FORBIDDEN',
        message: error.message
      });
    } finally {
      setIsProbing(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    onNavigate('/login');
  };

  if (!user || !activeOrganization) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-slate-800">
        <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm max-w-md w-full text-center space-y-4">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
          <h2 className="text-lg font-bold">Unauthenticated Session</h2>
          <p className="text-sm text-slate-500">
            You must be authenticated to access the security verification workspace.
          </p>
          <button
            onClick={() => onNavigate('/login')}
            className="w-full py-2 px-4 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg text-sm transition-colors"
          >
            Go to Login Screen
          </button>
        </div>
      </div>
    );
  }

  const roleCode = roles[0]?.code || 'NO_ROLE';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900">
      {/* Top Bar */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center text-white shadow-xs">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-slate-900 tracking-tight">CLINILYNC</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 font-semibold uppercase tracking-wider">
                  Phase 5–9 Security & Clinical Decision Suite
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Centralized Authentication, Organization Isolation & Multi-Domain RBAC Engine
              </p>
            </div>
          </div>

          {/* User & Organization State pill */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-1.5 border border-slate-200 text-xs">
              <User className="w-4 h-4 text-slate-600" />
              <div>
                <span className="font-semibold text-slate-800">{user.firstName} {user.lastName}</span>
                {user.isSuperAdmin && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded bg-purple-100 text-purple-700 font-bold uppercase">
                    Platform Super Admin
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-1.5 border border-slate-200 text-xs">
              <Building2 className="w-4 h-4 text-teal-600" />
              <div>
                <span className="text-slate-500 mr-1">Org:</span>
                <span className="font-semibold text-slate-800">{activeOrganization.name}</span>
                <span className="ml-1.5 text-[10px] font-mono text-slate-400">({activeOrganization.id})</span>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-1.5 border border-slate-200 text-xs">
              <Key className="w-4 h-4 text-amber-600" />
              <div>
                <span className="text-slate-500 mr-1">Role:</span>
                <span className="font-semibold text-slate-800">{roleCode}</span>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors"
              title="Invalidates session and clears HttpOnly cookie"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto w-full px-6 py-6 flex-1 space-y-6">
        {/* Quick Persona Switcher Bar */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Fast Role Switcher (Pre-Seeded Personas)
              </h2>
              <p className="text-xs text-slate-500">
                Instantly switch identities to verify how RBAC boundaries and tenant isolation dynamically respond.
              </p>
            </div>
            <div className="text-[11px] font-mono text-slate-400">
              Session: HttpOnly Cookie + Bearer Sync
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {(Object.keys(DEMO_PERSONAS) as DemoPersonaKey[]).map((key) => {
              const p = DEMO_PERSONAS[key];
              const isCurrent = user.email.toLowerCase() === p.email.toLowerCase();
              return (
                <button
                  key={key}
                  onClick={() => switchDemoUser(key)}
                  disabled={isLoading}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    isCurrent
                      ? 'border-teal-600 bg-teal-50/70 ring-1 ring-teal-600'
                      : p.isExpectedToFail
                      ? 'border-rose-200 bg-rose-50/30 hover:border-rose-400'
                      : 'border-slate-200 bg-slate-50/50 hover:border-teal-400 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800 truncate">
                    <span>{p.name}</span>
                    {isCurrent && <span className="w-2 h-2 rounded-full bg-teal-600 shrink-0" />}
                  </div>
                  <div className="text-[11px] text-teal-700 font-medium truncate mt-0.5">{p.role}</div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">{p.orgName}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Verification Navigation Tabs */}
        <div className="flex border-b border-slate-200 gap-2">
          <button
            onClick={() => setActiveTab('diagnostic')}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-semibold transition-colors border-b-2 ${
              activeTab === 'diagnostic'
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Centralized Authorization Diagnostic</span>
          </button>

          <button
            onClick={() => setActiveTab('membership')}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-semibold transition-colors border-b-2 ${
              activeTab === 'membership'
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Organization Membership & Isolation</span>
          </button>

          <button
            onClick={() => setActiveTab('rbac')}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-semibold transition-colors border-b-2 ${
              activeTab === 'rbac'
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Roles & Permissions Registry ({permissions.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-semibold transition-colors border-b-2 ${
              activeTab === 'audit'
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Server Audit Trail</span>
          </button>
        </div>

        {/* TAB 1: Centralized Authorization Diagnostic */}
        {activeTab === 'diagnostic' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-5">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-teal-600" />
                  Evaluate Server-Side Authorization Policy
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Invokes the centralized <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-slate-800">AuthorizationService.authorize()</code> via protected endpoint <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-teal-700">POST /api/v1/diagnostic/verify-access</code>.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Target Organization ID
                  </label>
                  <select
                    value={testOrgId}
                    onChange={(e) => setTestOrgId(e.target.value)}
                    className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="org_st_jude">org_st_jude (St. Jude Global Health Center)</option>
                    <option value="org_metro_health">org_metro_health (Metro Health Specialty Institute)</option>
                    <option value="org_foreign_test">org_foreign_test (Foreign Unaffiliated Organization)</option>
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Testing access against an organization where you lack membership will trigger a strict 403 Forbidden.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Required Permission Code
                  </label>
                  <select
                    value={testPermission}
                    onChange={(e) => setTestPermission(e.target.value)}
                    className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
                  >
                    <option value="diagnosis.view">diagnosis.view (View Patient Diagnoses)</option>
                    <option value="diagnosis.record">diagnosis.record (Record Encounter Diagnoses)</option>
                    <option value="problem_list.view">problem_list.view (View Longitudinal Problems)</option>
                    <option value="problem_list.manage">problem_list.manage (Add & Resolve Patient Problems)</option>
                    <option value="care_plan.view">care_plan.view (View Patient Care Plans)</option>
                    <option value="care_plan.create">care_plan.create (Create Structured Care Plans)</option>
                    <option value="care_plan.complete">care_plan.complete (Complete Care Plans)</option>
                    <option value="follow_up.view">follow_up.view (View Follow-Up Instructions)</option>
                    <option value="follow_up.manage">follow_up.manage (Record Follow-Up Instructions)</option>
                    <option value="clinical_alert.view">clinical_alert.view (View CDS Alerts)</option>
                    <option value="clinical_alert.review">clinical_alert.review (Review & Acknowledge CDS Alerts)</option>
                    <option value="clinical_rule.manage">clinical_rule.manage (Manage Clinical Decision Support Rules)</option>
                    <option value="encounter.view">encounter.view (View Clinical Encounters)</option>
                    <option value="encounter.create">encounter.create (Create Healthcare Encounters)</option>
                    <option value="encounter.complete">encounter.complete (Discharge/Complete Encounters)</option>
                    <option value="clinical_note.view">clinical_note.view (Read Clinical SOAP Notes)</option>
                    <option value="clinical_note.create">clinical_note.create (Author Clinical Notes)</option>
                    <option value="clinical_note.sign">clinical_note.sign (Attest & Sign Clinical Notes)</option>
                    <option value="clinical_note.amend">clinical_note.amend (Publish Formal Note Amendments)</option>
                    <option value="clinical_observation.view">clinical_observation.view (Read Vitals & Observations)</option>
                    <option value="clinical_observation.record">clinical_observation.record (Record Vital Signs & Measurements)</option>
                    <option value="medical_record.view">medical_record.view (View Aggregate Longitudinal Patient Chart)</option>
                    <option value="appointment.view">appointment.view (View Appointment Rosters)</option>
                    <option value="appointment.create">appointment.create (Book Appointments)</option>
                    <option value="appointment.check_in">appointment.check_in (Patient Appointment Check-in)</option>
                    <option value="provider.view">provider.view (View Healthcare Providers)</option>
                    <option value="department.view">department.view (View Clinical Departments)</option>
                    <option value="prescription.create">prescription.create (Prescribe Medications)</option>
                    <option value="billing.view">billing.view (Access Financial Billing & Invoices)</option>
                    <option value="billing.refund">billing.refund (Issue Payment Refunds)</option>
                    <option value="audit.view">audit.view (Inspect System Security Audit Trail)</option>
                    <option value="user.create">user.create (Provision Staff Accounts)</option>
                    <option value="organization.update">organization.update (Mutate Organization Profile)</option>
                    <option value="patient.view">patient.view (Read Patient Demographics)</option>
                    <option value="patient.create">patient.create (Register Patient Intake)</option>
                  </select>
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleEvaluatePermission}
                    disabled={isEvaluating}
                    className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg text-xs transition-colors flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
                  >
                    {isEvaluating ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Evaluating Server Policy...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Evaluate Authorization (Live API)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Security Boundary Reference */}
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-2">
                <span className="font-semibold text-slate-700 block">Current Persona Context:</span>
                <ul className="space-y-1 text-slate-600">
                  <li>• Active Role: <strong className="text-slate-900">{roleCode}</strong></li>
                  <li>• Active Org: <strong className="text-slate-900">{activeOrganization.name}</strong></li>
                  <li>• Holds <strong className="text-slate-900">{permissions.length}</strong> permissions in active context.</li>
                </ul>
              </div>
            </div>

            {/* Diagnostic Result Column */}
            <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex flex-col">
              <h3 className="text-base font-bold text-slate-900 mb-1 flex items-center justify-between">
                <span>Evaluation Verdict</span>
                {diagResult && (
                  <span className={`text-xs px-2 py-0.5 rounded font-mono font-bold ${
                    diagResult.allowed ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    HTTP {diagResult.status}
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Authoritative response returned by the backend security layer.
              </p>

              {diagResult ? (
                <div className="flex-1 flex flex-col space-y-4">
                  <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                    diagResult.allowed
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50/70 border-rose-200 text-rose-900'
                  }`}>
                    {diagResult.allowed ? (
                      <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <h4 className="font-bold text-sm">
                        {diagResult.allowed ? 'AUTHORIZATION GRANTED' : 'AUTHORIZATION DENIED (403 FORBIDDEN)'}
                      </h4>
                      <p className="text-xs mt-1">
                        {diagResult.allowed
                          ? `Caller holds valid permission '${testPermission}' within organization '${testOrgId}'.`
                          : diagResult.message || 'Access blocked by centralized authorization policy.'}
                      </p>
                      {diagResult.code && (
                        <div className="mt-2 font-mono text-[11px] bg-white/70 px-2 py-1 rounded inline-block font-semibold">
                          Code: {diagResult.code}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 bg-slate-900 text-slate-200 rounded-lg p-4 font-mono text-[11px] overflow-auto space-y-1">
                    <div className="text-slate-400">// Live Server Response Payload:</div>
                    <pre>{JSON.stringify(diagResult, null, 2)}</pre>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border border-dashed border-slate-200 rounded-xl text-slate-400 space-y-2">
                  <Search className="w-8 h-8 text-slate-300" />
                  <p className="text-xs">No evaluation has been run yet.</p>
                  <p className="text-[11px] text-slate-400">
                    Click "Evaluate Authorization" to test server-side policy enforcement.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: Organization Membership & Isolation */}
        {activeTab === 'membership' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Active Memberships & Switcher */}
              <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-teal-600" />
                    Active Organization Context & Switcher
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    A user may belong to multiple healthcare organizations with distinct roles in each.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="text-xs font-semibold text-slate-700">
                    Accessible Organizations for {user.firstName}:
                  </div>

                  <div className="space-y-2">
                    {availableOrganizations.map((org) => {
                      const isCurrent = org.id === activeOrganization.id;
                      return (
                        <div
                          key={org.id}
                          className={`p-3 rounded-lg border flex items-center justify-between transition-colors ${
                            isCurrent
                              ? 'border-teal-600 bg-teal-50/50'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div>
                            <div className="font-semibold text-xs text-slate-900 flex items-center gap-2">
                              <span>{org.name}</span>
                              {isCurrent && (
                                <span className="px-1.5 py-0.5 text-[10px] rounded bg-teal-600 text-white font-bold">
                                  Active Context
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                              ID: {org.id} · Currency: {org.currency_code} · TZ: {org.timezone}
                            </div>
                          </div>

                          {!isCurrent && (
                            <button
                              onClick={() => switchOrganization(org.id)}
                              disabled={isLoading}
                              className="px-3 py-1.5 bg-white border border-slate-300 hover:border-teal-600 hover:bg-teal-50 text-xs font-semibold text-slate-700 rounded transition-colors flex items-center gap-1.5 disabled:opacity-50"
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5 text-teal-600" />
                              <span>Switch</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600">
                  <span className="font-semibold text-slate-700">Multi-Tenancy Guarantee:</span> Calling <code className="font-mono text-teal-700">POST /api/v1/auth/switch-org</code> validates user membership before altering the session token's active organization.
                </div>
              </div>

              {/* Cross-Tenant Membership Access Probe */}
              <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Lock className="w-5 h-5 text-amber-600" />
                    Probe Membership Endpoint (/organizations/:id/membership)
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Verifies that the backend rejects access when querying organizations where the user has no active membership.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Target Organization to Query
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={probeOrgId}
                        onChange={(e) => setProbeOrgId(e.target.value)}
                        className="flex-1 text-xs border border-slate-300 rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
                        placeholder="org_id"
                      />
                      <button
                        onClick={handleProbeMembership}
                        disabled={isProbing}
                        className="py-2 px-4 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-lg text-xs transition-colors disabled:opacity-50"
                      >
                        {isProbing ? 'Querying...' : 'Query API'}
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-2 text-[11px]">
                    <button
                      onClick={() => setProbeOrgId('org_st_jude')}
                      className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono"
                    >
                      org_st_jude
                    </button>
                    <button
                      onClick={() => setProbeOrgId('org_metro_health')}
                      className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono"
                    >
                      org_metro_health
                    </button>
                    <button
                      onClick={() => setProbeOrgId('org_unauthorized_999')}
                      className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono"
                    >
                      org_unauthorized_999
                    </button>
                  </div>

                  {probeResult && (
                    <div className={`p-4 rounded-xl border mt-3 space-y-2 ${
                      probeResult.allowed
                        ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                        : 'bg-rose-50/70 border-rose-200 text-rose-900'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs">
                          {probeResult.allowed ? 'VALID MEMBERSHIP CONFIRMED' : 'ACCESS FORBIDDEN (CROSS-TENANT PROBE BLOCKED)'}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white font-bold">
                          HTTP {probeResult.status}
                        </span>
                      </div>
                      <p className="text-xs">
                        {probeResult.allowed
                          ? `Caller holds authorized membership in '${probeOrgId}'. Role: ${(probeResult.membership?.role as Record<string, unknown>)?.name || 'Assigned'}.`
                          : probeResult.message || 'Access blocked.'}
                      </p>
                      {probeResult.code && (
                        <div className="font-mono text-[11px] text-rose-700 font-semibold">
                          Error Code: {probeResult.code}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Roles & Permissions Registry */}
        {activeTab === 'rbac' && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-teal-600" />
                  Active Permissions Registry ({permissions.length} Granted)
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Derived through: <span className="font-mono font-semibold text-slate-700">User → User Organization → Role → Role Permissions</span>
                </p>
              </div>

              <div className="flex items-center gap-2 bg-teal-50 px-3 py-1.5 rounded-lg border border-teal-200 text-xs">
                <span className="text-teal-700 font-medium">Assigned Role:</span>
                <span className="font-bold text-teal-900">{roleCode}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {permissions.map((perm) => {
                const category = perm.split('.')[0] || 'general';
                return (
                  <div
                    key={perm}
                    className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 flex items-start gap-2.5"
                  >
                    <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="font-mono text-xs font-semibold text-slate-800 truncate">
                        {perm}
                      </div>
                      <div className="text-[10px] uppercase font-bold text-slate-400 mt-0.5">
                        Domain: {category}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 4: Server Audit Trail */}
        {activeTab === 'audit' && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-teal-600" />
                  Server-Side Immutable Audit Trail
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Protected by <code className="font-mono text-teal-700">audit.view</code>. Tamper-evident logging of authentication, tenant switches, and authorization denials.
                </p>
              </div>

              <button
                onClick={fetchAuditTrail}
                disabled={isLoadingAudit}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAudit ? 'animate-spin' : ''}`} />
                <span>Refresh Audit Log</span>
              </button>
            </div>

            {auditError ? (
              <div className="p-6 rounded-xl border border-rose-200 bg-rose-50 text-rose-900 space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <ShieldAlert className="w-5 h-5 text-rose-600" />
                  <span>Access Denied (403 Forbidden)</span>
                </div>
                <p className="text-xs">
                  {auditError}
                </p>
                <p className="text-[11px] text-rose-700">
                  This proves that only authorized roles possessing <code className="font-mono font-bold">audit.view</code> (such as Super Admin, Organization Owner, or Org Admin) can inspect the immutable audit trail.
                </p>
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No audit events recorded yet for this organization.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border border-slate-200 rounded-lg">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Timestamp</th>
                      <th className="p-3">Action</th>
                      <th className="p-3">Actor</th>
                      <th className="p-3">Resource</th>
                      <th className="p-3">IP Address</th>
                      <th className="p-3">Severity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {auditLogs.map((entry, idx) => (
                      <tr key={(entry.id as string) || idx} className="hover:bg-slate-50/50">
                        <td className="p-3 text-slate-500 whitespace-nowrap">
                          {entry.created_at ? new Date(entry.created_at as string).toLocaleTimeString() : 'N/A'}
                        </td>
                        <td className="p-3 font-semibold text-slate-800">
                          {String(entry.action)}
                        </td>
                        <td className="p-3 text-slate-600 truncate max-w-[120px]">
                          {String(entry.actor_id)}
                        </td>
                        <td className="p-3 text-slate-600 truncate max-w-[150px]">
                          {String(entry.resource_type)}: {String(entry.resource_id || '-')}
                        </td>
                        <td className="p-3 text-slate-500">
                          {String(entry.ip_address)}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            entry.severity === 'CRITICAL'
                              ? 'bg-rose-100 text-rose-800'
                              : entry.severity === 'WARNING'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {String(entry.severity || 'INFO')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
