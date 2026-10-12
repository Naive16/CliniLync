/**
 * CLINILYNC Top Navigation Bar
 * 
 * Adheres to the 3-Zone Top Bar Contract:
 * [Brand Wordmark] — [4-6 Nav Links] — [Active Persona & Org Switcher]
 */

import React, { useState } from 'react';
import { useAuth, DEMO_PERSONAS, DemoPersonaKey } from '../../context/AuthContext.js';
import { ShieldCheck, Building2, UserCircle, LogOut, ChevronDown, Activity, RefreshCw } from 'lucide-react';

interface HeaderProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  onOpenSecurityModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({ currentPath, onNavigate, onOpenSecurityModal }) => {
  const { user, activeOrganization, roles, availableOrganizations, switchOrganization, switchDemoUser, logout } = useAuth();
  const [showPersonaMenu, setShowPersonaMenu] = useState(false);
  const [showOrgMenu, setShowOrgMenu] = useState(false);

  const primaryRole = roles[0]?.name || (user?.isSuperAdmin ? 'Super Admin' : 'Staff');

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-6 bg-white border-b border-slate-200">
      {/* Zone 1: Single text element wordmark */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => onNavigate('/')}
          className="flex items-center gap-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 rounded"
        >
          <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center text-white shadow-xs">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-bold tracking-tight text-slate-900 leading-tight">
              CLINILYNC
            </div>
            <div className="text-[10px] text-teal-700 font-medium tracking-wide">
              Connecting Healthcare · Simplifying Care
            </div>
          </div>
        </button>
      </div>

      {/* Zone 2: Clean text navigation links */}
      <nav className="hidden md:flex items-center gap-4 lg:gap-5 text-xs font-medium text-slate-600">
        <button
          onClick={() => onNavigate('/app/patients')}
          className={`transition-colors hover:text-slate-900 ${
            currentPath.startsWith('/app/patients') ? 'text-teal-700 font-bold' : ''
          }`}
        >
          Patients
        </button>
        <button
          onClick={() => onNavigate('/app/appointments')}
          className={`transition-colors hover:text-slate-900 ${
            currentPath.startsWith('/app/appointments') ? 'text-teal-700 font-bold' : ''
          }`}
        >
          Appointments
        </button>
        <button
          onClick={() => onNavigate('/app/encounters')}
          className={`transition-colors hover:text-slate-900 ${
            currentPath.startsWith('/app/encounters') ? 'text-teal-700 font-bold' : ''
          }`}
        >
          Encounters
        </button>
        <button
          onClick={() => onNavigate('/app/providers')}
          className={`transition-colors hover:text-slate-900 ${
            currentPath.startsWith('/app/providers') ? 'text-teal-700 font-bold' : ''
          }`}
        >
          Providers
        </button>
        <button
          onClick={() => onNavigate('/app/departments')}
          className={`transition-colors hover:text-slate-900 ${
            currentPath.startsWith('/app/departments') ? 'text-teal-700 font-bold' : ''
          }`}
        >
          Departments
        </button>
        <button
          onClick={() => onNavigate('/verification')}
          className={`transition-colors hover:text-slate-900 ${
            currentPath.startsWith('/verification') ? 'text-teal-700 font-bold' : ''
          }`}
        >
          Security & RBAC
        </button>
        <button
          onClick={() => onNavigate('/patient')}
          className={`transition-colors hover:text-slate-900 ${
            currentPath.startsWith('/patient') ? 'text-teal-700 font-bold' : ''
          }`}
        >
          Patient Portal
        </button>
      </nav>

      {/* Zone 3: 1-2 primary actions (Persona & Organization Switcher) */}
      <div className="flex items-center gap-3">
        {/* Organization Switcher Dropdown */}
        {activeOrganization && (
          <div className="relative">
            <button
              onClick={() => {
                setShowOrgMenu(!showOrgMenu);
                setShowPersonaMenu(false);
              }}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap"
            >
              <Building2 className="w-3.5 h-3.5 text-slate-500" />
              <span className="max-w-[130px] truncate">{activeOrganization.name}</span>
              <span className="text-slate-400 font-mono text-[10px]">({activeOrganization.currency_code})</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showOrgMenu && (
              <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-lg shadow-lg py-1.5 z-40">
                <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Select Organization (Tenant)
                </div>
                {availableOrganizations.map((org) => (
                  <button
                    key={org.id}
                    onClick={() => {
                      switchOrganization(org.id);
                      setShowOrgMenu(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 ${
                      org.id === activeOrganization.id ? 'bg-teal-50/70 font-semibold text-teal-900' : 'text-slate-700'
                    }`}
                  >
                    <span className="truncate">{org.name}</span>
                    <span className="text-[10px] text-slate-400 uppercase font-mono">{org.currency_code}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Persona Switcher Dropdown */}
        {user ? (
          <div className="relative">
            <button
              onClick={() => {
                setShowPersonaMenu(!showPersonaMenu);
                setShowOrgMenu(false);
              }}
              className="flex items-center gap-2 pl-2 pr-2.5 py-1 text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <div className="w-6 h-6 rounded-full bg-teal-100 text-teal-800 font-bold flex items-center justify-center text-[11px]">
                {user.firstName[0]}
              </div>
              <div className="text-left leading-tight hidden sm:block">
                <div className="font-semibold text-slate-900">{user.firstName} {user.lastName}</div>
                <div className="text-[10px] text-slate-500 font-normal">{primaryRole}</div>
              </div>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showPersonaMenu && (
              <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-lg shadow-lg py-2 z-40">
                <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Switch Active Role Persona (Testing)
                </div>
                {(Object.keys(DEMO_PERSONAS) as DemoPersonaKey[]).map((key) => {
                  const p = DEMO_PERSONAS[key];
                  const isCurrent = user.email === p.email;
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        switchDemoUser(key);
                        setShowPersonaMenu(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs flex flex-col hover:bg-slate-50 ${
                        isCurrent ? 'bg-teal-50/80 font-semibold text-teal-950' : 'text-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-900">{p.name}</span>
                        <span className="text-[10px] text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded font-mono">{p.role}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <span>{p.orgName}</span>
                        <span>·</span>
                        <span>{p.email}</span>
                      </div>
                    </button>
                  );
                })}
                <div className="border-t border-slate-100 my-1"></div>
                <button
                  onClick={() => {
                    logout();
                    onNavigate('/login');
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => onNavigate('/login')}
            className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors whitespace-nowrap"
          >
            Sign In
          </button>
        )}
      </div>
    </header>
  );
};
