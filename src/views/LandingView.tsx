/**
 * CLINILYNC Platform Landing View
 */

import React from 'react';
import { Activity, ShieldCheck, HeartPulse, Stethoscope, FileText, CreditCard, ArrowRight, CheckCircle2, Globe2 } from 'lucide-react';

interface LandingViewProps {
  onNavigate: (path: string) => void;
}

export const LandingView: React.FC<LandingViewProps> = ({ onNavigate }) => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-white border-b border-slate-200 py-16 sm:py-24">
        <div className="max-w-5xl mx-auto px-6 text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 border border-teal-200/80 text-teal-800 text-xs font-semibold tracking-wide">
            <Globe2 className="w-3.5 h-3.5 text-teal-600" />
            Global Healthcare Technology Platform · Phase 1 Technical Foundation
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight max-w-3xl mx-auto leading-tight">
            Connecting Healthcare. <br />
            <span className="text-teal-700">Simplifying Care.</span>
          </h1>

          <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            One unified, secure ecosystem connecting healthcare organizations, clinicians,
            administrative teams, and patients across the full continuum of care.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <button
              onClick={() => onNavigate('/app')}
              className="px-6 py-3 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-xs transition-colors flex items-center gap-2"
            >
              <span>Launch Staff Platform</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => onNavigate('/patient')}
              className="px-6 py-3 text-sm font-semibold text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors flex items-center gap-2"
            >
              <HeartPulse className="w-4 h-4 text-teal-600" />
              <span>Enter Patient Portal</span>
            </button>
            <button
              onClick={() => onNavigate('/admin')}
              className="px-6 py-3 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-2"
            >
              <ShieldCheck className="w-4 h-4 text-slate-600" />
              <span>Admin & Audit Console</span>
            </button>
          </div>
        </div>
      </section>

      {/* Continuum of Care Chain */}
      <section className="py-16 bg-slate-50 border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-slate-900">The Unified Healthcare Journey</h2>
            <p className="text-sm text-slate-600">
              Zero isolated silos. Every step of the clinical workflow is connected through a single relational domain model.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-xs space-y-2">
              <div className="w-8 h-8 rounded bg-teal-50 text-teal-700 flex items-center justify-center font-bold text-xs">
                01
              </div>
              <h3 className="font-semibold text-slate-900 text-sm">Intake & Scheduling</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Patient intake, centralized MRN assignment, and flexible appointment queues with live check-in tracking.
              </p>
            </div>

            <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-xs space-y-2">
              <div className="w-8 h-8 rounded bg-teal-50 text-teal-700 flex items-center justify-center font-bold text-xs">
                02
              </div>
              <h3 className="font-semibold text-slate-900 text-sm">Lightweight EMR</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Structured clinical notes, vital sign tracking, ICD-10 diagnostic coding, and clinician sign-off workflow.
              </p>
            </div>

            <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-xs space-y-2">
              <div className="w-8 h-8 rounded bg-teal-50 text-teal-700 flex items-center justify-center font-bold text-xs">
                03
              </div>
              <h3 className="font-semibold text-slate-900 text-sm">e-Rx & Diagnostics</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Electronic prescription generation, dosage schedules, laboratory requisitions, and abnormal result flagging.
              </p>
            </div>

            <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-xs space-y-2">
              <div className="w-8 h-8 rounded bg-teal-50 text-teal-700 flex items-center justify-center font-bold text-xs">
                04
              </div>
              <h3 className="font-semibold text-slate-900 text-sm">Billing & Portal</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Itemized invoice generation, payment receipting, and unified patient portal access under the same primary domain.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Architectural Rigor Banner */}
      <section className="py-12 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="bg-slate-900 text-white rounded-xl p-8 sm:p-10 space-y-6 shadow-sm">
            <div className="space-y-2">
              <span className="text-teal-400 text-xs font-semibold tracking-wider uppercase">
                Enterprise Engineering Highlights
              </span>
              <h3 className="text-xl sm:text-2xl font-bold">
                Built as a Scalable Global Healthcare Operating System
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-xs text-slate-300">
              <div className="space-y-1.5">
                <div className="text-white font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-teal-400" />
                  Multi-Organization Isolation
                </div>
                <p>
                  Every tenant owns its data. Server-side isolation blocks cross-tenant leakage with high-severity audit alerts.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="text-white font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-teal-400" />
                  Granular RBAC & RLAC Gates
                </div>
                <p>
                  Each person sees only the work their role allows.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="text-white font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-teal-400" />
                  Immutable Audit Logging
                </div>
                <p>
                  Append-only audit trail capturing actor, IP address, action, and sanitized metadata for full regulatory compliance.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 py-6 bg-white text-center text-xs text-slate-500">
        CLINILYNC · Connecting Healthcare. Simplifying Care. · Global Multi-Tenant Architecture
      </footer>
    </div>
  );
};
