import React, { useMemo, useState } from 'react';
import { Activity, AlertCircle, CheckCircle2, Eye, EyeOff, HeartPulse, Lock, ArrowRight } from 'lucide-react';
import { api } from '../../api/client.js';

interface PatientActivationViewProps {
  onNavigate: (path: string) => void;
}

export const PatientActivationView: React.FC<PatientActivationViewProps> = ({ onNavigate }) => {
  const token = useMemo(() => new URLSearchParams(window.location.search).get('token') || '', []);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : 'This invitation link is missing its token.');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!token) {
      setError('This invitation link is missing its token.');
      return;
    }
    if (password.length < 6) {
      setError('Choose a password with at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await api.v1ActivatePatientPortal({ token, password });
      setSuccess(true);
    } catch (err) {
      setError((err as Error).message || 'This invitation could not be accepted.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="cl-patient-activation-page">
      <div className="cl-patient-activation-card">
        <div className="cl-patient-activation-brand"><span><HeartPulse size={20} /></span><strong>Clinilync Patient Portal</strong></div>
        {success ? (
          <div className="cl-patient-activation-success">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            <h1>Portal account created</h1>
            <p>Your secure patient portal account is ready. Sign in to continue.</p>
            <button type="button" onClick={() => onNavigate('/patient/login')} className="cl-ui-button cl-ui-button-primary cl-ui-button-md">Go to Patient Login <ArrowRight size={16} /></button>
          </div>
        ) : (
          <>
            <div className="cl-patient-activation-heading">
              <span className="cl-ui-eyebrow">Clinic invitation</span>
              <h1>Set up your patient portal</h1>
              <p>Create a password to securely access the information your clinic shares with you.</p>
            </div>
            {error && <div className="cl-login-error" role="alert"><AlertCircle size={16} /><span>{error}</span></div>}
            <form onSubmit={handleSubmit} className="cl-patient-activation-form">
              <label className="cl-login-field">
                <span>Password</span>
                <span className="cl-login-input-wrap"><Lock size={17} /><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} autoComplete="new-password" required placeholder="At least 6 characters" /><button type="button" className="cl-login-password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span>
              </label>
              <label className="cl-login-field">
                <span>Confirm password</span>
                <span className="cl-login-input-wrap"><Lock size={17} /><input type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={6} autoComplete="new-password" required placeholder="Repeat your password" /><button type="button" className="cl-login-password-toggle" onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}>{showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span>
              </label>
              <p className="cl-patient-activation-helper">This invitation expires after 48 hours and can only be used once.</p>
              <button type="submit" disabled={submitting || !token} className="cl-ui-button cl-ui-button-primary cl-ui-button-md cl-login-submit">{submitting ? 'Creating account…' : 'Create portal account'} <ArrowRight size={16} /></button>
            </form>
            <button type="button" className="cl-patient-activation-link" onClick={() => onNavigate('/patient/login')}>Already activated? Sign in</button>
          </>
        )}
      </div>
    </div>
  );
};
