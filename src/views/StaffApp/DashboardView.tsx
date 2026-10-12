/**
 * CLINILYNC Staff Dashboard / Clinical Command Center (/app)
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../api/client.js';
import { Users, Calendar, Stethoscope, Receipt, Plus, Clock, CheckCircle2, AlertCircle, ArrowUpRight } from 'lucide-react';

interface DashboardViewProps {
  onNavigate: (path: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { user, activeOrganization, hasPermission } = useAuth();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [patientCount, setPatientCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    loadDashboardData();
  }, [activeOrganization?.id]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [aptRes, patRes] = await Promise.all([
        api.getAppointments(),
        api.getPatients()
      ]);
      setAppointments(aptRes.appointments || []);
      setPatientCount(patRes.total || 0);
    } catch (err) {
      console.error('Failed to load dashboard metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      await api.updateAppointmentStatus(id, newStatus);
      await loadDashboardData();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Top Banner / Welcome */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Clinical Command Center</h1>
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
            <span>{activeOrganization?.name}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{activeOrganization?.timezone}</span>
            <span aria-hidden="true">·</span>
            <span>Signed in as {user?.firstName} {user?.lastName}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasPermission('patient.create') && (
            <button
              onClick={() => onNavigate('/app/patients')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Intake Patient</span>
            </button>
          )}
          {hasPermission('clinical.create') && (
            <button
              onClick={() => onNavigate('/app/clinical')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-xs transition-colors"
            >
              <Stethoscope className="w-3.5 h-3.5 text-teal-600" />
              <span>Author SOAP Note</span>
            </button>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Registered Patients</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {loading ? '—' : patientCount}
          </div>
          <div className="text-[11px] text-teal-700">Organization Roster</div>
        </div>

        <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Today's Queue</span>
            <Calendar className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {loading ? '—' : appointments.length}
          </div>
          <div className="text-[11px] text-teal-700">Scheduled Consultations</div>
        </div>

        <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Checked In</span>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {loading ? '—' : appointments.filter(a => a.status === 'CHECKED_IN').length}
          </div>
          <div className="text-[11px] text-amber-700">Waiting for Triage / Doctor</div>
        </div>

        <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Active Currency</span>
            <Receipt className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono">
            {activeOrganization?.currency_code || 'GBP'}
          </div>
          <div className="text-[11px] text-slate-500">Jurisdiction Compliant</div>
        </div>
      </div>

      {/* Main Queue Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden space-y-0">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Today's Appointment Schedule & Triage Queue</h2>
            <p className="text-xs text-slate-500">Patient → Check-in → Consultation → Sign-off</p>
          </div>
          <button
            onClick={() => onNavigate('/app/appointments')}
            className="text-xs text-teal-700 hover:text-teal-900 font-medium flex items-center gap-1"
          >
            <span>View Full Calendar</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {appointments.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No appointments scheduled for this organization today.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Patient Details</th>
                  <th className="px-5 py-2.5 font-medium">Scheduled Time</th>
                  <th className="px-5 py-2.5 font-medium">Clinician</th>
                  <th className="px-5 py-2.5 font-medium">Reason for Visit</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium text-right">Workflow Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {appointments.map((apt) => {
                  const patientName = apt.patient ? `${apt.patient.first_name} ${apt.patient.last_name}` : 'Registered Patient';
                  const mrn = apt.patient?.mrn || 'MRN-Pending';
                  const timeFormatted = new Date(apt.scheduled_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                  return (
                    <tr key={apt.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3">
                        <div className="font-semibold text-slate-900">{patientName}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{mrn}</div>
                      </td>
                      <td className="px-5 py-3 font-mono tabular-nums text-slate-700">
                        {timeFormatted}
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        {apt.providerName}
                      </td>
                      <td className="px-5 py-3 text-slate-600 max-w-xs truncate">
                        {apt.reason_for_visit || 'Routine Consultation'}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs ${
                          apt.status === 'CHECKED_IN' ? 'text-amber-700 font-medium' :
                          apt.status === 'COMPLETED' ? 'text-emerald-700 font-medium' :
                          apt.status === 'IN_CONSULTATION' ? 'text-teal-700 font-medium' :
                          'text-slate-600'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            apt.status === 'CHECKED_IN' ? 'bg-amber-500' :
                            apt.status === 'COMPLETED' ? 'bg-emerald-500' :
                            apt.status === 'IN_CONSULTATION' ? 'bg-teal-600' :
                            'bg-slate-400'
                          }`} />
                          {apt.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {apt.status === 'SCHEDULED' && hasPermission('appointment.check_in') && (
                          <button
                            onClick={() => handleUpdateStatus(apt.id, 'CHECKED_IN')}
                            className="px-2.5 py-1 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded transition-colors"
                          >
                            Check In
                          </button>
                        )}
                        {apt.status === 'CHECKED_IN' && hasPermission('clinical.create') && (
                          <button
                            onClick={() => {
                              onNavigate('/app/clinical');
                            }}
                            className="px-2.5 py-1 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded transition-colors"
                          >
                            Start Consult
                          </button>
                        )}
                        {apt.status === 'IN_CONSULTATION' && hasPermission('appointment.complete') && (
                          <button
                            onClick={() => handleUpdateStatus(apt.id, 'COMPLETED')}
                            className="px-2.5 py-1 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded transition-colors"
                          >
                            Complete
                          </button>
                        )}
                        {apt.status === 'COMPLETED' && (
                          <span className="text-slate-400 text-xs">Finalized</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
