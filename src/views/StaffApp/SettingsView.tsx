/**
 * CLINILYNC Organization Settings View (/app/settings)
 */

import React from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { Building2, Globe, Clock, ShieldCheck, Mail, Phone, MapPin } from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { activeOrganization } = useAuth();

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="pb-4 border-b border-slate-200">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Organization Profile & Governance</h1>
        <p className="text-xs text-slate-500">
          Global multi-tenant configuration for {activeOrganization?.name}
        </p>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 shadow-xs p-6 space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
          <div className="w-10 h-10 rounded-lg bg-teal-50 text-teal-800 flex items-center justify-center font-bold text-sm">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">{activeOrganization?.name}</h2>
            <div className="text-xs text-slate-500 font-mono">Tenant ID: {activeOrganization?.id}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="p-3 bg-slate-50 rounded border border-slate-100 space-y-1">
            <span className="text-slate-400 block">Currency & Accounting</span>
            <div className="font-semibold text-slate-900 font-mono text-sm">{activeOrganization?.currency_code}</div>
            <div className="text-[11px] text-slate-500">All invoices & payments denominated</div>
          </div>

          <div className="p-3 bg-slate-50 rounded border border-slate-100 space-y-1">
            <span className="text-slate-400 block">Timezone</span>
            <div className="font-semibold text-slate-900 font-mono text-sm">{activeOrganization?.timezone}</div>
            <div className="text-[11px] text-slate-500">Appointment scheduling base</div>
          </div>

          <div className="p-3 bg-slate-50 rounded border border-slate-100 space-y-1">
            <span className="text-slate-400 block">Regulatory Compliance</span>
            <div className="font-semibold text-slate-900">
              {activeOrganization?.country_code === 'GBR' ? 'NHS Data Security & Protection / GDPR' : 'HIPAA / HITECH'}
            </div>
            <div className="text-[11px] text-slate-500">ISO 27001 Certified Infrastructure</div>
          </div>

          <div className="p-3 bg-slate-50 rounded border border-slate-100 space-y-1">
            <span className="text-slate-400 block">Organization Status</span>
            <div className="font-semibold text-teal-700">Active Tenant</div>
            <div className="text-[11px] text-slate-500">Encrypted PHI Storage</div>
          </div>
        </div>
      </div>
    </div>
  );
};
