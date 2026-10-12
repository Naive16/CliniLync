/**
 * CLINILYNC Sign-In & Authentication Verification Portal
 * 
 * Features:
 * - Anti-enumeration authentication: Identical generic error handling
 * - Organization selection & multi-tenant credential verification
 * - Quick-switch role presets covering clinical, administrative, billing, and revoked test cases
 * - Password reset and email verification architectural foundations
 */

import React, { useState } from 'react';
import { useAuth, DEMO_PERSONAS, DemoPersonaKey } from '../context/AuthContext.js';
import { Activity, Lock, Mail, ArrowRight, ShieldCheck, AlertCircle, Building2, HelpCircle, X } from 'lucide-react';

interface LoginViewProps {
  onNavigate: (path: string) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onNavigate }) => {
  const { login, switchDemoUser, isLoading } = useAuth();
  const [email, setEmail] = useState('dr.sarah@clinilync.com');
  const [password, setPassword] = useState('Password123!');
  const [organizationId, setOrganizationId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showForgotModal, setShowForgotModal] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password, organizationId || undefined);
      onNavigate('/verification');
    } catch (err) {
      setError((err as Error).message || 'Invalid email or password.');
    }
  };

  const handleSelectDemo = async (key: DemoPersonaKey) => {
    setError(null);
    try {
      await switchDemoUser(key);
      onNavigate('/verification');
    } catch (err) {
      setError((err as Error).message || 'Failed to authenticate persona');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-slate-900">
      <div className="max-w-md w-full space-y-6">
        {/* Brand Lockup */}
        <div className="text-center space-y-2">
          <div className="inline-flex w-12 h-12 rounded-xl bg-teal-600 items-center justify-center text-white shadow-xs">
            <Activity className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">CLINILYNC</h1>
          <p className="text-xs text-teal-700 font-semibold tracking-wide">
            Connecting Healthcare · Simplifying Care
          </p>
        </div>

        {/* Login Form Box */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Sign in to your organization</h2>
              <p className="text-xs text-slate-500">Phase 5 Secure Authentication & RBAC Slice</p>
            </div>
            <span className="text-[10px] bg-teal-50 text-teal-800 font-bold px-2 py-0.5 rounded border border-teal-200">
              v1 API
            </span>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Email Address</label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 pl-9 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent"
                  placeholder="name@organization.com"
                />
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-700">Password</label>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  className="text-[11px] text-teal-700 hover:text-teal-800 font-medium"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 pl-9 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent font-mono"
                  placeholder="••••••••••••"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Target Organization (Optional)
              </label>
              <div className="relative">
                <select
                  value={organizationId}
                  onChange={(e) => setOrganizationId(e.target.value)}
                  className="w-full px-3 py-2 pl-9 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent bg-white"
                >
                  <option value="">Primary User Organization (Default)</option>
                  <option value="org_st_jude">St. Jude Global Health Center (org_st_jude)</option>
                  <option value="org_metro_health">Metro Health Specialty Institute (org_metro_health)</option>
                </select>
                <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
            >
              <span>{isLoading ? 'Authenticating...' : 'Sign In'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Quick Demo Personas Selector */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              <span>Quick Role Demo Switcher</span>
              <span className="font-mono text-teal-700">Pre-Seeded Accounts</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => handleSelectDemo('superadmin')}
                className="p-2 text-left rounded border border-purple-200 bg-purple-50/40 hover:border-purple-400 hover:bg-purple-50 transition-colors"
              >
                <div className="font-semibold text-purple-950 truncate">Alexander Vance</div>
                <div className="text-[10px] text-purple-700 font-bold">Platform Super Admin</div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectDemo('owner_olivia')}
                className="p-2 text-left rounded border border-slate-200 hover:border-teal-400 hover:bg-teal-50/50 transition-colors"
              >
                <div className="font-semibold text-slate-800 truncate">Olivia Sterling</div>
                <div className="text-[10px] text-slate-500">Org Owner · St. Jude</div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectDemo('dr_sarah')}
                className="p-2 text-left rounded border border-slate-200 hover:border-teal-400 hover:bg-teal-50/50 transition-colors"
              >
                <div className="font-semibold text-slate-800 truncate">Dr. Sarah Chen</div>
                <div className="text-[10px] text-teal-700 font-semibold">Doctor (Multi-Org)</div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectDemo('nurse_marcus')}
                className="p-2 text-left rounded border border-slate-200 hover:border-teal-400 hover:bg-teal-50/50 transition-colors"
              >
                <div className="font-semibold text-slate-800 truncate">Marcus Vance</div>
                <div className="text-[10px] text-slate-500">Nurse · St. Jude</div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectDemo('reception_elena')}
                className="p-2 text-left rounded border border-slate-200 hover:border-teal-400 hover:bg-teal-50/50 transition-colors"
              >
                <div className="font-semibold text-slate-800 truncate">Elena Ramos</div>
                <div className="text-[10px] text-slate-500">Reception · St. Jude</div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectDemo('billing_james')}
                className="p-2 text-left rounded border border-slate-200 hover:border-teal-400 hover:bg-teal-50/50 transition-colors"
              >
                <div className="font-semibold text-slate-800 truncate">James Thornton</div>
                <div className="text-[10px] text-slate-500">Billing · St. Jude</div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectDemo('dr_robert')}
                className="p-2 text-left rounded border border-amber-200 bg-amber-50/30 hover:border-amber-400 hover:bg-amber-50/60 transition-colors"
              >
                <div className="font-semibold text-slate-800 truncate">Dr. Robert Thorne</div>
                <div className="text-[10px] text-amber-700">Doctor · Metro Health</div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectDemo('revoked_staff')}
                className="p-2 text-left rounded border border-rose-200 bg-rose-50/30 hover:border-rose-400 hover:bg-rose-50/60 transition-colors"
              >
                <div className="font-semibold text-rose-900 truncate">Arthur Pendelton</div>
                <div className="text-[10px] text-rose-600 font-bold">Revoked (Tests 403)</div>
              </button>
            </div>
          </div>
        </div>

        <div className="text-center text-xs text-slate-400 space-y-1">
          <div>CLINILYNC · PBKDF2 Password Hashing · HttpOnly Cookie Sessions</div>
          <div>Multi-Tenant Relational Isolation · Strict Server-Side RBAC</div>
        </div>
      </div>

      {/* Forgot Password / Architecture Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-teal-600" />
                Password Reset & Security Policy
              </h3>
              <button
                onClick={() => setShowForgotModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-600 space-y-3">
              <p>
                In accordance with HIPAA/GDPR standards and Clinilync security architecture:
              </p>
              <ul className="list-disc pl-4 space-y-1.5 text-slate-700">
                <li>
                  <strong>Anti-Enumeration:</strong> Password reset requests never indicate whether an email address is registered.
                </li>
                <li>
                  <strong>Cryptographic Tokens:</strong> Reset links use single-use, high-entropy tokens with strict 15-minute expiration.
                </li>
                <li>
                  <strong>Audit Logged:</strong> All password reset requests and changes are permanently recorded in the immutable audit log.
                </li>
              </ul>
              <p className="bg-slate-50 p-2.5 rounded border border-slate-200 font-mono text-[11px] text-slate-600">
                Default pre-seeded password for all test accounts is: <span className="font-bold text-slate-900">Password123!</span>
              </p>
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
