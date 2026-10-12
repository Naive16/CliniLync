/**
 * CLINILYNC Staff Sidebar Navigation
 */

import React from 'react';
import { LayoutDashboard, Users, Calendar, Stethoscope, Receipt, BarChart3, Settings, ShieldCheck, Pill } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';

interface SidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentPath, onNavigate }) => {
  const { hasPermission } = useAuth();

  const navItems = [
    { label: 'Overview', path: '/app', icon: LayoutDashboard, perm: 'patient.view' },
    { label: 'Patients', path: '/app/patients', icon: Users, perm: 'patient.view' },
    { label: 'Appointments', path: '/app/appointments', icon: Calendar, perm: 'appointment.view' },
    { label: 'Clinical EMR', path: '/app/clinical', icon: Stethoscope, perm: 'clinical.view' },
    { label: 'Prescriptions & e-Rx', path: '/app/prescriptions', icon: Pill, perm: 'prescription.view' },
    { label: 'Billing & Invoicing', path: '/app/billing', icon: Receipt, perm: 'billing.view' },
    { label: 'Analytics', path: '/app/analytics', icon: BarChart3, perm: 'report.view' },
    { label: 'Settings', path: '/app/settings', icon: Settings, perm: 'user.view' },
  ];

  return (
    <aside className="w-56 bg-white border-r border-slate-200 flex flex-col shrink-0 min-h-[calc(100vh-4rem)]">
      <div className="p-3 space-y-1">
        <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          Clinical Operations
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPath === item.path || (item.path !== '/app' && currentPath.startsWith(item.path));
          const allowed = hasPermission(item.perm);

          return (
            <button
              key={item.path}
              onClick={() => onNavigate(item.path)}
              disabled={!allowed}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg text-left transition-colors ${
                isActive
                  ? 'bg-teal-50 text-teal-800 font-semibold'
                  : allowed
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  : 'text-slate-300 cursor-not-allowed'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-teal-700' : allowed ? 'text-slate-400' : 'text-slate-300'}`} />
              <span className="truncate">{item.label}</span>
              {!allowed && <span className="ml-auto text-[9px] text-slate-400">Locked</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-auto p-3 border-t border-slate-100">
        <div className="p-2.5 rounded-lg bg-teal-50/70 border border-teal-200/50 text-[11px] space-y-1">
          <div className="font-semibold text-teal-900 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-700" />
            <span>Multi-Tenant Active</span>
          </div>
          <div className="text-teal-700 text-[10px] leading-tight">
            Encounters and PHI are restricted to your assigned organization.
          </div>
        </div>
      </div>
    </aside>
  );
};
