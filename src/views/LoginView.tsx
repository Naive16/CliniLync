/**
 * Clinilync staff sign-in.
 * Keeps authentication behaviour focused on the credentials required to sign in.
 */
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { Activity, ArrowRight, AlertCircle, Eye, EyeOff, Lock, Mail, X, ShieldCheck } from 'lucide-react';

interface LoginViewProps {
  onNavigate: (path: string) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onNavigate }) => {
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForgotModal, setShowForgotModal] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
      onNavigate('/app');
    } catch (err) {
      setError((err as Error).message || 'Invalid email or password.');
    }
  };

  return (
    <main className="clinilync-auth-page cl-login-page-clean">
      <section className="clinilync-auth-card cl-login-card-clean" aria-labelledby="login-title">
        <div className="clinilync-auth-form cl-login-form-clean">
          <div className="cl-login-content">
            <button type="button" className="cl-login-brand-lockup cl-login-brand-button" onClick={() => onNavigate('/')} aria-label="Go to Clinilync home">
              <span className="cl-login-brand-mark"><Activity size={22} /></span>
              <span className="cl-login-brand-name">Clinilync</span>
            </button>

            <header className="cl-login-heading">
              <h1 id="login-title">Welcome back</h1>
              <p>Sign in to your care team workspace.</p>
            </header>

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
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@clinic.com"
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
                    autoComplete="current-password"
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

              <button type="submit" disabled={isLoading} className="cl-ui-button cl-ui-button-primary cl-ui-button-md cl-login-submit">
                <span>{isLoading ? 'Signing in…' : 'Sign in'}</span>
                <ArrowRight size={17} />
              </button>
            </form>

            <div className="cl-login-register-option cl-login-register-clean">
              <span>New to Clinilync?</span>
              <button type="button" onClick={() => onNavigate('/register')}>Register your clinic</button>
            </div>
          </div>
        </div>
      </section>

      {showForgotModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-teal-600" />
                Password reset
              </h3>
              <button type="button" onClick={() => setShowForgotModal(false)} className="text-slate-400 hover:text-slate-600" aria-label="Close password reset information">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-xs text-slate-600 space-y-3">
              <p>Password reset is not available in this deployment yet. Please contact your administrator for help.</p>
              <p className="bg-slate-50 p-2.5 rounded border border-slate-200 text-slate-600">No reset link or token has been created.</p>
            </div>
            <button type="button" onClick={() => setShowForgotModal(false)} className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors">
              Understood
            </button>
          </div>
        </div>
      )}
    </main>
  );
};
