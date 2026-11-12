import React, { useState } from 'react';
import { Activity, AlertCircle, ArrowRight, Eye, EyeOff, HeartPulse, Lock, Mail, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';

interface PatientLoginViewProps {
  onNavigate: (path: string) => void;
}

export const PatientLoginView: React.FC<PatientLoginViewProps> = ({ onNavigate }) => {
  const { patientLogin, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRecovery, setShowRecovery] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      await patientLogin(email, password);
      onNavigate('/patient');
    } catch (err) {
      setError((err as Error).message || 'We could not sign you in. Check your email and password.');
    }
  };

  return (
    <div className="cl-patient-login-page">
      <div className="cl-patient-login-card">
        <section className="cl-patient-login-form" aria-labelledby="patient-login-title">
          <div className="cl-patient-login-content">
            <button type="button" className="cl-patient-login-back" onClick={() => onNavigate('/login')}>
              <ArrowRight className="rotate-180" size={15} aria-hidden="true" />
              Staff Login
            </button>

            <div className="cl-patient-login-brand">
              <span className="cl-patient-login-brand-mark"><HeartPulse size={21} /></span>
              <span>Clinilync Patient Portal</span>
            </div>

            <div className="cl-patient-login-heading">
              <span className="cl-ui-eyebrow">Your care, connected</span>
              <h1 id="patient-login-title">Welcome back</h1>
              <p>Sign in to view your appointments, records, prescriptions, and care information.</p>
            </div>

            <div className="cl-patient-login-panel">
              {error && (
                <div className="cl-login-error" role="alert">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="cl-login-form-fields">
                <div className="cl-login-field">
                  <label htmlFor="patient-login-email">Email address</label>
                  <div className="cl-login-input-wrap">
                    <Mail size={17} aria-hidden="true" />
                    <input
                      id="patient-login-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      autoComplete="email"
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                </div>

                <div className="cl-login-field">
                  <div className="cl-login-label-row">
                    <label htmlFor="patient-login-password">Password</label>
                    <button type="button" onClick={() => setShowRecovery(true)} className="cl-login-forgot">
                      Need help signing in?
                    </button>
                  </div>
                  <div className="cl-login-input-wrap">
                    <Lock size={17} aria-hidden="true" />
                    <input
                      id="patient-login-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      required
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

                <button type="submit" disabled={isLoading} className="cl-ui-button cl-ui-button-primary cl-ui-button-md cl-login-submit">
                  <span>{isLoading ? 'Signing in…' : 'Sign in to Patient Portal'}</span>
                  <ArrowRight size={17} />
                </button>
              </form>
            </div>

            <p className="cl-patient-login-invitation">
              Patient access is created by your clinic. If you have not received an invitation, contact your clinic directly.
            </p>
            <p className="cl-login-footer-note"><ShieldCheck size={14} /> Your health information is protected</p>
          </div>
        </section>

        <section className="cl-patient-login-intro" aria-label="Patient portal information">
          <div>
            <div className="cl-patient-login-intro-brand"><span><Activity size={18} /></span><strong>Clinilync</strong></div>
            <span className="cl-login-preview-eyebrow">Patient Portal</span>
            <h2>Stay close to your care.</h2>
            <p>See the information your care team has released to you in one simple, secure place.</p>
          </div>
          <div className="cl-patient-login-benefits">
            <div><HeartPulse size={17} /><span>Track your care journey</span></div>
            <div><ShieldCheck size={17} /><span>Access protected health records</span></div>
            <div><Activity size={17} /><span>Keep appointments and prescriptions in view</span></div>
          </div>
        </section>
      </div>

      {showRecovery && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4" role="dialog" aria-modal="true" aria-labelledby="patient-recovery-title">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 id="patient-recovery-title" className="font-bold text-sm text-slate-900">Need help signing in?</h2>
              <button type="button" onClick={() => setShowRecovery(false)} className="text-slate-400 hover:text-slate-600" aria-label="Close help dialog">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs leading-5 text-slate-600">Patient password recovery is managed by your clinic. Please contact the clinic that invited you to the portal so they can help you securely.</p>
            <button type="button" onClick={() => setShowRecovery(false)} className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
