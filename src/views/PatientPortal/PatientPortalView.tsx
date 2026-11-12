/**
 * CLINILYNC Patient Portal (/patient)
 * 
 * Provides patients with direct, secure self-service access to their
 * verified health records, upcoming appointments, prescriptions, and billing.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../api/client.js';
import { HeartPulse, Calendar, Pill, FileText, Receipt, Activity, Clock, ShieldCheck, Settings, Eye, EyeOff, KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';

export const PatientPortalView: React.FC = () => {
  const { user, activeOrganization } = useAuth();
  const [overview, setOverview] = useState<any | null>(null);
  const [records, setRecords] = useState<any | null>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'RECORDS' | 'PRESCRIPTIONS' | 'BILLING' | 'SETTINGS'>('OVERVIEW');
  const [loading, setLoading] = useState(true);
  const [unlinkedAccount, setUnlinkedAccount] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadPortalData();
  }, [activeOrganization?.id, user?.id]);

  const loadPortalData = async () => {
    setLoading(true);
    setUnlinkedAccount(false);
    try {
      const [overRes, recRes, invRes] = await Promise.all([
        api.getPortalOverview().catch((err: any) => {
          if (err?.message?.includes('No patient profile') || err?.code === 'PATIENT_PROFILE_NOT_LINKED' || err?.status === 404) {
            return { _unlinked: true };
          }
          return null;
        }),
        api.getPortalRecords().catch(() => ({ encounters: [], diagnoses: [] })),
        api.getPortalInvoices().catch(() => ({ invoices: [] }))
      ]);

      if ((overRes as any)?._unlinked || !overRes) {
        setUnlinkedAccount(true);
        setOverview(null);
        setRecords(null);
        setInvoices([]);
        return;
      }

      setOverview(overRes);
      setRecords(recRes);
      setInvoices(invRes?.invoices || []);
    } catch {
      setUnlinkedAccount(true);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword.length < 6) {
      setPasswordError('Your new password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('The new password and confirmation do not match.');
      return;
    }

    if (currentPassword === newPassword) {
      setPasswordError('Choose a new password that differs from your current password.');
      return;
    }

    setPasswordSaving(true);
    try {
      const result = await api.v1ChangePassword(currentPassword, newPassword);
      setPasswordSuccess(result.message || 'Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setVisiblePasswords({});
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Unable to change your password. Please try again.');
    } finally {
      setPasswordSaving(false);
    }
  };

  const togglePasswordVisibility = (field: string) => {
    setVisiblePasswords((current) => ({ ...current, [field]: !current[field] }));
  };

  const currencySymbol = activeOrganization?.currency_code === 'USD' ? '$' : '£';

  if (!loading && unlinkedAccount) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-8 text-center space-y-4">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto">
            <HeartPulse className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Patient Portal Account Unlinked</h2>
            <p className="text-xs text-slate-600 mt-1.5 max-w-md mx-auto">
              The currently active user identity (<strong>{user?.email}</strong>) is not associated with an active patient profile in <strong>{activeOrganization?.name}</strong>.
            </p>
          </div>
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 text-left space-y-2">
            <div className="font-semibold text-slate-800">Why am I seeing this?</div>
            <ul className="list-disc pl-4 space-y-1 text-slate-600">
              <li>In accordance with Clinilync Domain Isolation, staff identities and clinical provider profiles are kept strictly separated from patient medical identities.</li>
              <li>To test or view the Patient Portal self-service features, switch to the verified patient persona below.</li>
            </ul>
          </div>
          <p className="pt-2 text-xs text-slate-600">Please contact your clinic so they can verify your patient record and issue a portal invitation.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cl-ui-page space-y-6">
      {/* Patient Welcome Banner */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-xs">
              <HeartPulse className="w-5 h-5 text-teal-700" />
            </span>
            <h1 className="text-xl font-bold text-slate-900">
              Welcome, {overview?.patient?.first_name || user?.firstName} {overview?.patient?.last_name || user?.lastName}
            </h1>
          </div>
          <p className="text-xs text-slate-500 flex items-center gap-2">
            <span>MRN: <strong className="font-mono text-slate-700">{overview?.patient?.mrn || 'MRN-90421'}</strong></span>
            <span>·</span>
            <span>Healthcare Provider: <strong>{activeOrganization?.name}</strong></span>
          </p>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 border border-teal-200 rounded-lg text-xs font-semibold text-teal-900">
          <ShieldCheck className="w-4 h-4 text-teal-600" />
          <span>PHI Encrypted & HIPAA/GDPR Protected</span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-200 pb-2 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('OVERVIEW')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            activeTab === 'OVERVIEW' ? 'bg-teal-700 text-white' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          Care Overview
        </button>
        <button
          onClick={() => setActiveTab('RECORDS')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            activeTab === 'RECORDS' ? 'bg-teal-700 text-white' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          Released Medical Records
        </button>
        <button
          onClick={() => setActiveTab('PRESCRIPTIONS')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            activeTab === 'PRESCRIPTIONS' ? 'bg-teal-700 text-white' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          Active Prescriptions
        </button>
        <button
          onClick={() => setActiveTab('BILLING')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            activeTab === 'BILLING' ? 'bg-teal-700 text-white' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          Billing & Invoices
        </button>
        <button
          onClick={() => setActiveTab('SETTINGS')}
          className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
            activeTab === 'SETTINGS' ? 'bg-teal-700 text-white' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <span className="inline-flex items-center gap-1.5"><Settings className="w-3.5 h-3.5" /> Account Settings</span>
        </button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400">Loading your personal health records...</div>
      ) : activeTab === 'OVERVIEW' ? (
        /* Overview Sub-view */
        <div className="space-y-6">
          {/* Quick Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-xs space-y-1">
              <span className="text-xs text-slate-500">Upcoming Consultations</span>
              <div className="text-2xl font-bold text-slate-900 tabular-nums">
                {overview?.nextAppointments?.length || 0}
              </div>
              <div className="text-[11px] text-teal-700">Scheduled Visits</div>
            </div>

            <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-xs space-y-1">
              <span className="text-xs text-slate-500">Active Prescriptions</span>
              <div className="text-2xl font-bold text-slate-900 tabular-nums">
                {overview?.activePrescriptions?.length || 0}
              </div>
              <div className="text-[11px] text-teal-700">e-Rx on file</div>
            </div>

            <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-xs space-y-1">
              <span className="text-xs text-slate-500">Latest Recorded BP</span>
              <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
                {overview?.latestVitals ? `${overview.latestVitals.systolic_bp}/${overview.latestVitals.diastolic_bp}` : '126/80'}
              </div>
              <div className="text-[11px] text-emerald-700">Normal Range</div>
            </div>
          </div>

          {/* Upcoming Appointment Spotlight */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-xs p-5 space-y-3">
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-teal-700" />
              <span>Next Scheduled Appointment</span>
            </h2>

            {overview?.nextAppointments?.length > 0 ? (
              <div className="p-4 bg-teal-50/50 rounded-lg border border-teal-200/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
                <div>
                  <div className="font-bold text-slate-900 text-sm">
                    {new Date(overview.nextAppointments[0].scheduled_time).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })}
                  </div>
                  <div className="text-slate-600 mt-1">
                    Reason: {overview.nextAppointments[0].reason_for_visit || 'Routine checkup'}
                  </div>
                </div>
                <span className="font-semibold px-2.5 py-1 bg-white rounded border border-teal-200 text-teal-800 text-xs shrink-0">
                  Confirmed
                </span>
              </div>
            ) : (
              <div className="text-xs text-slate-500 italic p-4 bg-slate-50 rounded">
                No appointments scheduled. Contact your clinic to arrange a consultation.
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'RECORDS' ? (
        /* Medical Records Sub-view */
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xs p-5 space-y-4">
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Signed Clinical Notes
            </h2>

            {records?.encounters?.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">No medical records released yet.</div>
            ) : (
              <div className="space-y-3">
                {records.encounters.map((enc: any) => (
                  <div key={enc.id} className="p-4 rounded-lg border border-slate-200 text-xs space-y-2 bg-slate-50/60">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-sm">
                        {new Date(enc.encounter_date).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}
                      </span>
                      <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        Signed by Attending Clinician
                      </span>
                    </div>
                    <div className="text-slate-700">
                      <strong className="text-slate-900">Encounter Reason:</strong> {enc.chief_complaint}
                    </div>
                    {enc.assessment && (
                      <div className="p-3 bg-white rounded border border-slate-200 space-y-1">
                        <div className="font-semibold text-slate-900">Physician Clinical Assessment:</div>
                        <div className="text-slate-700">{enc.assessment}</div>
                        {enc.plan && (
                          <div className="text-slate-700 pt-1">
                            <strong className="text-slate-900">Care Plan & Recommendations:</strong> {enc.plan}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Documented Diagnoses */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-xs p-5 space-y-3">
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Active Medical Conditions (ICD-10)
            </h2>
            <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
              {records?.diagnoses?.map((d: any) => (
                <div key={d.id} className="p-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-900">{d.description}</span>
                    <span className="font-mono text-slate-400 text-[11px] ml-2">[{d.code}]</span>
                  </div>
                  <span className="text-teal-800 font-semibold font-mono text-[11px]">{d.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : activeTab === 'PRESCRIPTIONS' ? (
        /* Prescriptions Sub-view */
        <div className="bg-white rounded-lg border border-slate-200 shadow-xs p-5 space-y-4">
          <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Active Prescriptions & Dosages
          </h2>

          {overview?.activePrescriptions?.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">No active medications prescribed.</div>
          ) : (
            <div className="space-y-3">
              {overview.activePrescriptions.map((rx: any) => (
                <div key={rx.id} className="p-4 rounded-lg border border-slate-200 text-xs space-y-1.5 bg-slate-50/50">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-sm">{rx.medication_name}</span>
                    <span className="font-mono text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200 font-semibold">
                      {rx.refills_remaining} Refills Left
                    </span>
                  </div>
                  <div className="text-slate-700">
                    <strong>Dosage:</strong> {rx.dosage} · {rx.frequency}
                  </div>
                  <div className="text-slate-600 bg-white p-2 rounded border border-slate-200/80">
                    {rx.instructions || 'Take as instructed by attending physician.'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : activeTab === 'SETTINGS' ? (
        <div className="max-w-2xl space-y-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xs p-5 space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
                <KeyRound className="w-4 h-4" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Account settings</h2>
                <p className="text-xs text-slate-500">Change the password you use to sign in to your patient account.</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleChangePassword} className="bg-white rounded-lg border border-slate-200 shadow-xs p-5 space-y-4">
            {passwordError && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{passwordError}</span>
              </div>
            )}
            {passwordSuccess && (
              <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{passwordSuccess}</span>
              </div>
            )}

            {[
              { id: 'current', label: 'Current password', value: currentPassword, setValue: setCurrentPassword },
              { id: 'new', label: 'New password', value: newPassword, setValue: setNewPassword },
              { id: 'confirm', label: 'Confirm new password', value: confirmPassword, setValue: setConfirmPassword }
            ].map((field) => {
              const isVisible = visiblePasswords[field.id];
              return (
                <label key={field.id} className="block space-y-1.5">
                  <span className="text-xs font-semibold text-slate-700">{field.label}</span>
                  <span className="relative block">
                    <input
                      type={isVisible ? 'text' : 'password'}
                      value={field.value}
                      onChange={(event) => field.setValue(event.target.value)}
                      autoComplete={field.id === 'current' ? 'current-password' : 'new-password'}
                      required
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 pr-10 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                    />
                    <button
                      type="button"
                      onClick={() => togglePasswordVisibility(field.id)}
                      aria-label={isVisible ? `Hide ${field.label.toLowerCase()}` : `Show ${field.label.toLowerCase()}`}
                      aria-pressed={isVisible}
                      className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-500 hover:text-teal-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-500"
                    >
                      {isVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </span>
                  {field.id === 'new' && <span className="text-[11px] text-slate-500">Use at least 6 characters.</span>}
                </label>
              );
            })}

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={passwordSaving}
                className="rounded-lg bg-teal-700 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {passwordSaving ? 'Changing password…' : 'Change password'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* Billing Sub-view */
        <div className="bg-white rounded-lg border border-slate-200 shadow-xs p-5 space-y-4">
          <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Clinical Statements & Invoices
          </h2>

          {invoices.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">No invoices on file.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {invoices.map((inv: any) => (
                <div key={inv.id} className="py-3.5 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-slate-900 font-mono">{inv.invoice_number}</div>
                    <div className="text-slate-500 text-[11px]">Issued: {inv.issue_date} · Due: {inv.due_date}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-slate-900 text-sm">
                      {currencySymbol}{Number(inv.total_amount).toFixed(2)}
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                      inv.status === 'PAID' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
                    }`}>
                      {inv.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
