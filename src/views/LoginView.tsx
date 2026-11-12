/**
 * CLINILYNC sign-in
 * 
 * Features:
 * - Anti-enumeration authentication: Identical generic error handling
 * - Organization selection & multi-tenant credential verification
 */

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { Activity, Lock, Mail, ArrowRight, ShieldCheck, AlertCircle, Building2, X, Users, CalendarDays, FileText, HeartPulse, CheckCircle2, Eye, EyeOff } from 'lucide-react';

interface LoginViewProps {
  onNavigate: (path: string) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onNavigate }) => {
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState('dr.sarah@clinilync.com');
  const [password, setPassword] = useState('Password123!');
  const [showPassword, setShowPassword] = useState(false);
  const [organizationId, setOrganizationId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showForgotModal, setShowForgotModal] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password, organizationId || undefined);
      onNavigate('/app');
    } catch (err) {
      setError((err as Error).message || 'Invalid email or password.');
    }
  };

  return (
    <div className="clinilync-auth-page">
      <div className="clinilync-auth-card">
        <section className="clinilync-auth-form">
          <div className="cl-login-content">
            <div className="cl-login-brand-lockup">
              <div className="cl-login-brand-mark"><Activity size={24} /></div>
              <div>
                <div className="cl-login-brand-name">Clinilync</div>
                <div className="cl-login-brand-tagline">Connecting healthcare · simplifying care</div>
              </div>
            </div>

            <div className="cl-login-heading">
              <span className="cl-ui-eyebrow">Care team workspace</span>
              <h1>Welcome back</h1>
              <p>Sign in to continue managing your clinic securely.</p>
            </div>

            <div className="cl-login-form-card">
              {error && (
                <div className="cl-login-error" role="alert">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="cl-login-form-fields">
                <div className="cl-login-field">
                  <label htmlFor="login-email">Email address</label>
                  <div className="cl-login-input-wrap">
                    <Mail size={17} aria-hidden="true" />
                    <input
                      id="login-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="name@organization.com"
                    />
                  </div>
                </div>

                <div className="cl-login-field">
                  <div className="cl-login-label-row">
                    <label htmlFor="login-password">Password</label>
                    <button type="button" onClick={() => setShowForgotModal(true)} className="cl-login-forgot">
                      Forgot password?
                    </button>
                  </div>
                  <div className="cl-login-input-wrap">
                    <Lock size={17} aria-hidden="true" />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="Enter your password"
                    />
                    <button
                      type="button"
                      className="cl-login-password-toggle"
                      onClick={() => setShowPassword((visible) => !visible)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                    </button>
                  </div>
                </div>

                <div className="cl-login-field">
                  <label htmlFor="login-organization">Organization <span>(optional)</span></label>
                  <div className="cl-login-input-wrap">
                    <Building2 size={17} aria-hidden="true" />
                    <select id="login-organization" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
                      <option value="">Primary organization (default)</option>
                      <option value="org_st_jude">St. Jude Global Health Center</option>
                      <option value="org_metro_health">Metro Health Specialty Institute</option>
                    </select>
                  </div>
                </div>

                <button type="submit" disabled={isLoading} className="cl-ui-button cl-ui-button-primary cl-ui-button-md cl-login-submit">
                  <span>{isLoading ? 'Authenticating...' : 'Sign in'}</span>
                  <ArrowRight size={17} />
                </button>
              </form>
            </div>

            <div className="cl-login-register-option">
              <span>New to Clinilync?</span>
              <button type="button" className="cl-ui-button cl-ui-button-secondary cl-ui-button-sm" onClick={() => onNavigate('/register')}>
                Register your clinic
              </button>
            </div>

          </div>
        </section>

        <section className="clinilync-auth-intro" aria-label="Clinilync product preview">
          <div className="clinilync-auth-preview-copy">
            <div className="clinilync-auth-brand"><span className="clinilync-brand-mark"><Activity size={20} /></span><strong>Clinilync</strong></div>
            <span className="cl-login-preview-eyebrow">One connected care workspace</span>
            <h2>See your whole clinic, clearly.</h2>
            <p>Bring patients, appointments, and clinical records into one calm, secure view for your care team.</p>
          </div>

          <div className="cl-login-product-preview" aria-hidden="true">
            <div className="cl-login-preview-topbar">
              <div className="cl-login-preview-topbar-brand"><span className="cl-login-preview-dot" /> Clinilync</div>
              <div className="cl-login-preview-avatar">S</div>
            </div>
            <div className="cl-login-preview-body">
              <aside className="cl-login-preview-sidebar">
                <span className="is-active"><Activity size={12} /> Overview</span>
                <span><Users size={12} /> Patients</span>
                <span><CalendarDays size={12} /> Schedule</span>
                <span><FileText size={12} /> Records</span>
              </aside>
              <div className="cl-login-preview-main">
                <div className="cl-login-preview-heading"><div><span>Good morning, Sarah</span><strong>Clinic overview</strong></div><span className="cl-login-preview-date">Today</span></div>
                <div className="cl-login-preview-metrics">
                  <div><Users size={13} /><small>Patients</small><strong>1,248</strong><em>+8.2%</em></div>
                  <div><CalendarDays size={13} /><small>Appointments</small><strong>36</strong><em>Today</em></div>
                  <div><HeartPulse size={13} /><small>Care plans</small><strong>84</strong><em>Active</em></div>
                </div>
                <div className="cl-login-preview-panel">
                  <div className="cl-login-preview-panel-title"><strong>Today’s schedule</strong><span>View all</span></div>
                  <div className="cl-login-preview-row"><span className="cl-login-preview-patient">AM</span><div><strong>Amelia Mwale</strong><small>09:30 · Follow-up visit</small></div><CheckCircle2 size={14} /></div>
                  <div className="cl-login-preview-row"><span className="cl-login-preview-patient is-blue">JK</span><div><strong>James Kachingwe</strong><small>10:15 · Clinical review</small></div><span className="cl-login-preview-status">Upcoming</span></div>
                </div>
              </div>
            </div>
          </div>

          <div className="cl-login-preview-footer"><span>Built for modern care teams</span><span>Patients</span><span>Appointments</span><span>Clinical records</span></div>
        </section>
      </div>

      {/* The backend currently has no reset endpoint, so do not create a fake reset flow. */}
      {showForgotModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-teal-600" />
                Password reset
              </h3>
              <button
                onClick={() => setShowForgotModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-600 space-y-3">
              <p>Password reset is not available in this deployment yet. Please contact your administrator for help.</p>
              <p className="bg-slate-50 p-2.5 rounded border border-slate-200 text-slate-600">No reset link or token has been created.</p>
            </div>

            <button
              onClick={() => setShowForgotModal(false)}
              className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors"
            >
              Understood
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
