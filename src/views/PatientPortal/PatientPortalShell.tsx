import React from 'react';
import { HeartPulse, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { PatientPortalView } from './PatientPortalView.js';

interface PatientPortalShellProps {
  onNavigate: (path: string) => void;
}

export const PatientPortalShell: React.FC<PatientPortalShellProps> = ({ onNavigate }) => {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    onNavigate('/patient/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-800">
              <HeartPulse className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-slate-900">Clinilync Patient Portal</div>
              <div className="flex items-center gap-1 text-[11px] text-slate-500"><ShieldCheck className="h-3.5 w-3.5 text-teal-700" />Secure access to your care</div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden text-xs text-slate-600 sm:inline">{user?.firstName} {user?.lastName}</span>
            <button type="button" onClick={() => void handleLogout()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-900">
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main>
        <PatientPortalView />
      </main>
    </div>
  );
};
