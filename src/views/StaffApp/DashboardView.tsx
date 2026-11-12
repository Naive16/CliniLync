/**
 * CLINILYNC Staff Dashboard / Clinical Command Center (/app)
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../api/client.js';
import { Users, Calendar, Stethoscope, Receipt, Plus, Clock, CheckCircle2, AlertCircle, ArrowUpRight } from 'lucide-react';
import { Button, Card, EmptyState, LoadingState, PageHeader, StatusBadge } from '../../components/common/ui.js';

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
    <div className="cl-ui-page space-y-6">
      <PageHeader
        title="Clinical Command Center"
        subtitle={<><span>{activeOrganization?.name}</span><span aria-hidden="true"> · </span><span className="font-mono">{activeOrganization?.timezone}</span><span aria-hidden="true"> · </span><span>Signed in as {user?.firstName} {user?.lastName}</span></>}
        actions={<>
          {hasPermission('patient.create') && <Button variant="primary" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => onNavigate('/app/patients')}>Intake Patient</Button>}
          {hasPermission('clinical.create') && <Button variant="secondary" icon={<Stethoscope className="w-3.5 h-3.5" />} onClick={() => onNavigate('/app/clinical')}>Write Clinical Note</Button>}
        </>}
      />

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Registered Patients</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {loading ? '—' : patientCount}
          </div>
          <div className="text-[11px] text-teal-700">Organization Roster</div>
        </Card>

        <Card className="p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Today's Queue</span>
            <Calendar className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {loading ? '—' : appointments.length}
          </div>
          <div className="text-[11px] text-teal-700">Scheduled Consultations</div>
        </Card>

        <Card className="p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Checked In</span>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {loading ? '—' : appointments.filter(a => a.status === 'CHECKED_IN').length}
          </div>
          <div className="text-[11px] text-amber-700">Waiting for Triage / Doctor</div>
        </Card>

        <Card className="p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Active Currency</span>
            <Receipt className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono">
            {activeOrganization?.currency_code || 'GBP'}
          </div>
          <div className="text-[11px] text-slate-500">Jurisdiction Compliant</div>
        </Card>
      </div>

      {/* Main Queue Table */}
      <Card className="cl-ui-table-container">
        <div className="cl-ui-card-header flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Today's Appointment Schedule & Triage Queue</h2>
            <p className="text-xs text-slate-500">Patient → Check-in → Consultation → Sign-off</p>
          </div>
          <Button variant="link" icon={<ArrowUpRight className="w-3.5 h-3.5" />} onClick={() => onNavigate('/app/appointments')}>View Full Calendar</Button>
        </div>

        {loading ? (
          <LoadingState>Loading today’s appointment queue…</LoadingState>
        ) : appointments.length === 0 ? (
          <EmptyState title="No appointments scheduled" description="There are no appointments scheduled for this organization today." />
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
                        <StatusBadge tone={apt.status === 'CHECKED_IN' ? 'warning' : apt.status === 'COMPLETED' ? 'success' : apt.status === 'IN_CONSULTATION' ? 'info' : 'neutral'}>
                          {apt.status.replace(/_/g, ' ')}
                        </StatusBadge>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {apt.status === 'SCHEDULED' && hasPermission('appointment.check_in') && (
                          <Button
                            variant="quiet"
                            size="sm"
                            onClick={() => handleUpdateStatus(apt.id, 'CHECKED_IN')}
                          >
                            Check In
                          </Button>
                        )}
                        {apt.status === 'CHECKED_IN' && hasPermission('clinical.create') && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              onNavigate('/app/clinical');
                            }}
                          >
                            Start Consult
                          </Button>
                        )}
                        {apt.status === 'IN_CONSULTATION' && hasPermission('appointment.complete') && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleUpdateStatus(apt.id, 'COMPLETED')}
                          >
                            Complete
                          </Button>
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
      </Card>
    </div>
  );
};
