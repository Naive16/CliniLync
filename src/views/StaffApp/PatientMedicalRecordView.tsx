/**
 * CLINILYNC Patient Medical Record View (/app/patients/:patientId/medical-record)
 * 
 * Aggregated longitudinal clinical documentation:
 * - Patient identity summary & allergies banner
 * - Chronological encounter history
 * - Clinician-authored clinical notes (Draft, Signed, Amended)
 * - Recorded physiological observations & vital signs
 * - Strict RBAC permission enforcement (medical_record.view)
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../api/client.js';
import {
  FileText,
  HeartPulse,
  Calendar,
  User,
  Clock,
  ShieldCheck,
  AlertTriangle,
  ArrowLeft,
  Plus,
  ChevronRight,
  Activity,
  CheckCircle2,
  Lock,
  Stethoscope,
  Info,
  ClipboardList,
  AlertCircle,
  Pill
} from 'lucide-react';

interface PatientMedicalRecordViewProps {
  patientId: string;
  onNavigate: (path: string) => void;
}

export const PatientMedicalRecordView: React.FC<PatientMedicalRecordViewProps> = ({ patientId, onNavigate }) => {
  const { user, activeOrganization, hasPermission } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recordData, setRecordData] = useState<{
    patient: any;
    encounters: any[];
    notes: any[];
    observations: any[];
  } | null>(null);

  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'ENCOUNTERS' | 'NOTES' | 'OBSERVATIONS'>('OVERVIEW');
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);

  useEffect(() => {
    loadMedicalRecord();
  }, [patientId, activeOrganization?.id]);

  const loadMedicalRecord = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.v1GetPatientMedicalRecord(patientId);
      setRecordData(res);
      if (res.notes?.length > 0) {
        setExpandedNoteId(res.notes[0].id);
      }
    } catch (err: any) {
      if (err?.status === 403 || err?.code === 'FORBIDDEN') {
        setError('Access Denied: Your account role does not have permission to view confidential clinical medical records (medical_record.view required).');
      } else if (err?.status === 404) {
        setError('Patient record not found in the active organization.');
      } else {
        setError(err?.message || 'Failed to load patient medical record.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 max-w-6xl mx-auto">
        <div className="flex items-center justify-center p-12 bg-white rounded-xl border border-slate-200">
          <div className="flex items-center gap-3 text-slate-600 text-sm">
            <div className="w-5 h-5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
            <span>Retrieving patient medical record and encounter documentation...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !recordData) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-4">
        <button
          onClick={() => onNavigate(`/app/patients/${patientId}`)}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Patient Profile</span>
        </button>

        <div className="p-8 bg-white border border-rose-200 rounded-xl shadow-xs text-center space-y-4">
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900">Clinical Record Access Restricted</h2>
            <p className="text-xs text-slate-600 max-w-md mx-auto">{error}</p>
          </div>
          <div className="pt-2">
            <button
              onClick={() => onNavigate('/app/patients')}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
            >
              Return to Patient Directory
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { patient, encounters, notes, observations } = recordData;

  // Extract latest vital signs
  const latestVitalsByType: Record<string, any> = {};
  for (const obs of observations) {
    if (!latestVitalsByType[obs.observation_type]) {
      latestVitalsByType[obs.observation_type] = obs;
    }
  }

  return (
    <div className="cl-ui-page space-y-6">
      {/* Navigation & Patient Identity Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <button
            onClick={() => onNavigate(`/app/patients/${patient.id}`)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Patient Demographics</span>
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-teal-100 text-teal-800 font-bold flex items-center justify-center text-sm">
              {patient.first_name[0]}{patient.last_name[0]}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">
                  {patient.first_name} {patient.last_name}
                </h1>
                <span className="font-mono text-xs px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 rounded font-medium">
                  {patient.mrn}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${
                  patient.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                }`}>
                  {patient.status}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                DOB: {patient.date_of_birth} • Gender: {patient.gender} • Blood Group: {patient.blood_group || 'Not recorded'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {hasPermission('problem_list.view') && (
            <button
              onClick={() => onNavigate(`/app/patients/${patient.id}/problems`)}
              className="px-3 py-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <AlertCircle className="w-3.5 h-3.5 text-amber-700" />
              <span>Problem List</span>
            </button>
          )}

          {hasPermission('care_plan.view') && (
            <button
              onClick={() => onNavigate(`/app/patients/${patient.id}/care-plans`)}
              className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-900 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <ClipboardList className="w-3.5 h-3.5 text-indigo-700" />
              <span>Care Plans</span>
            </button>
          )}

          <button
            onClick={() => onNavigate(`/app/patients/${patient.id}/medications`)}
            className="px-3 py-2 bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-900 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Pill className="w-3.5 h-3.5 text-teal-700" />
            <span>Medications & e-Rx</span>
          </button>

          <button
            onClick={() => onNavigate(`/app/encounters/new?patientId=${patient.id}`)}
            className="px-3.5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Clinical Encounter</span>
          </button>
        </div>
      </div>

      {/* Allergies & Safety Banner */}
      {patient.allergies_summary && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2.5 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <div>
            <span className="font-bold">Verified Allergies / Alerts: </span>
            <span>{patient.allergies_summary}</span>
          </div>
        </div>
      )}

      {/* Primary Navigation Tabs */}
      <div className="border-b border-slate-200 flex gap-4">
        {[
          { id: 'OVERVIEW', label: 'Clinical Overview', count: undefined },
          { id: 'ENCOUNTERS', label: 'Encounters Timeline', count: encounters.length },
          { id: 'NOTES', label: 'Clinical Notes', count: notes.length },
          { id: 'OBSERVATIONS', label: 'Vitals & Observations', count: observations.length }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`pb-3 text-xs font-semibold transition-colors border-b-2 flex items-center gap-1.5 ${
              activeTab === t.id
                ? 'border-teal-700 text-teal-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>{t.label}</span>
            {t.count !== undefined && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                activeTab === t.id ? 'bg-teal-100 text-teal-800 font-bold' : 'bg-slate-100 text-slate-600'
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'OVERVIEW' && (
        <div className="space-y-6">
          {/* Key Observations Cards */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Latest Physiological Indicators</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs">
                <div className="text-[11px] font-semibold text-slate-500">Blood Pressure</div>
                <div className="text-base font-bold text-slate-900 mt-1">
                  {latestVitalsByType['BLOOD_PRESSURE_SYSTOLIC'] && latestVitalsByType['BLOOD_PRESSURE_DIASTOLIC']
                    ? `${latestVitalsByType['BLOOD_PRESSURE_SYSTOLIC'].numeric_value}/${latestVitalsByType['BLOOD_PRESSURE_DIASTOLIC'].numeric_value} mmHg`
                    : '—'}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {latestVitalsByType['BLOOD_PRESSURE_SYSTOLIC'] ? new Date(latestVitalsByType['BLOOD_PRESSURE_SYSTOLIC'].measured_at).toLocaleDateString() : 'No record'}
                </div>
              </div>

              <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs">
                <div className="text-[11px] font-semibold text-slate-500">Heart Rate</div>
                <div className="text-base font-bold text-slate-900 mt-1">
                  {latestVitalsByType['HEART_RATE'] ? `${latestVitalsByType['HEART_RATE'].numeric_value} bpm` : '—'}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {latestVitalsByType['HEART_RATE'] ? new Date(latestVitalsByType['HEART_RATE'].measured_at).toLocaleDateString() : 'No record'}
                </div>
              </div>

              <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs">
                <div className="text-[11px] font-semibold text-slate-500">O2 Saturation</div>
                <div className="text-base font-bold text-slate-900 mt-1">
                  {latestVitalsByType['OXYGEN_SATURATION'] ? `${latestVitalsByType['OXYGEN_SATURATION'].numeric_value} %` : '—'}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {latestVitalsByType['OXYGEN_SATURATION'] ? new Date(latestVitalsByType['OXYGEN_SATURATION'].measured_at).toLocaleDateString() : 'No record'}
                </div>
              </div>

              <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs">
                <div className="text-[11px] font-semibold text-slate-500">Body Temp</div>
                <div className="text-base font-bold text-slate-900 mt-1">
                  {latestVitalsByType['BODY_TEMPERATURE'] ? `${latestVitalsByType['BODY_TEMPERATURE'].numeric_value} °C` : '—'}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {latestVitalsByType['BODY_TEMPERATURE'] ? new Date(latestVitalsByType['BODY_TEMPERATURE'].measured_at).toLocaleDateString() : 'No record'}
                </div>
              </div>

              <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs">
                <div className="text-[11px] font-semibold text-slate-500">Weight & BMI</div>
                <div className="text-base font-bold text-slate-900 mt-1">
                  {latestVitalsByType['WEIGHT'] ? `${latestVitalsByType['WEIGHT'].numeric_value} kg` : '—'}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {latestVitalsByType['BMI'] ? `BMI: ${latestVitalsByType['BMI'].numeric_value}` : 'BMI: —'}
                </div>
              </div>

              <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs">
                <div className="text-[11px] font-semibold text-slate-500">Respiratory Rate</div>
                <div className="text-base font-bold text-slate-900 mt-1">
                  {latestVitalsByType['RESPIRATORY_RATE'] ? `${latestVitalsByType['RESPIRATORY_RATE'].numeric_value} /min` : '—'}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {latestVitalsByType['RESPIRATORY_RATE'] ? new Date(latestVitalsByType['RESPIRATORY_RATE'].measured_at).toLocaleDateString() : 'No record'}
                </div>
              </div>
            </div>
          </div>

          {/* Recent Encounters & Active Notes Split */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Encounters */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-teal-700" />
                  <span>Recent Encounters</span>
                </h3>
                <button
                  onClick={() => setActiveTab('ENCOUNTERS')}
                  className="text-xs font-semibold text-teal-700 hover:text-teal-900"
                >
                  View All ({encounters.length})
                </button>
              </div>

              {encounters.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No clinical encounters recorded yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {encounters.slice(0, 3).map((enc) => (
                    <div
                      key={enc.id}
                      onClick={() => onNavigate(`/app/encounters/${enc.id}`)}
                      className="py-3 flex items-center justify-between hover:bg-slate-50 px-2 rounded-lg cursor-pointer transition-colors"
                    >
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          {enc.reason_for_visit || 'Routine Clinical Interaction'}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                          <span>{new Date(enc.created_at).toLocaleDateString()}</span>
                          <span>•</span>
                          <span className="font-mono">{enc.encounter_type}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                          enc.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          enc.status === 'IN_PROGRESS' ? 'bg-blue-50 text-blue-700 border border-blue-200 animate-pulse' :
                          enc.status === 'CANCELLED' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                          'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {enc.status}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Latest Clinical Note Preview */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-4 h-4 text-teal-700" />
                  <span>Latest Clinical Note</span>
                </h3>
                <button
                  onClick={() => setActiveTab('NOTES')}
                  className="text-xs font-semibold text-teal-700 hover:text-teal-900"
                >
                  View All ({notes.length})
                </button>
              </div>

              {notes.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No clinical notes documented yet.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-900">
                      {notes[0].note_type}
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                      notes[0].status === 'SIGNED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      notes[0].status === 'AMENDED' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                      'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {notes[0].status} (v{notes[0].version})
                    </span>
                  </div>

                  {notes[0].chief_complaint && (
                    <div className="text-xs text-slate-700">
                      <span className="font-semibold text-slate-900">Chief Complaint: </span>
                      {notes[0].chief_complaint}
                    </div>
                  )}

                  {notes[0].assessment && (
                    <div className="text-xs text-slate-700 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="font-semibold text-slate-900 mb-0.5">Assessment:</div>
                      <p className="line-clamp-2 text-slate-600">{notes[0].assessment}</p>
                    </div>
                  )}

                  <div className="pt-1 flex items-center justify-between text-[11px] text-slate-400">
                    <span>Authored: {new Date(notes[0].created_at).toLocaleDateString()}</span>
                    {notes[0].signed_at && (
                      <span className="text-emerald-700 font-medium">Signed: {new Date(notes[0].signed_at).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ENCOUNTERS TIMELINE */}
      {activeTab === 'ENCOUNTERS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Encounter Documentation Timeline ({encounters.length})
            </h3>
            <button
              onClick={() => onNavigate(`/app/encounters/new?patientId=${patient.id}`)}
              className="text-xs font-semibold text-teal-700 hover:text-teal-900 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create New Encounter</span>
            </button>
          </div>

          {encounters.length === 0 ? (
            <div className="p-12 text-center bg-white border border-slate-200 rounded-xl space-y-2">
              <Stethoscope className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="text-sm font-semibold text-slate-700">No Encounters Recorded</div>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                No clinical encounters have been conducted for this patient in {activeOrganization?.name}.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {encounters.map(enc => (
                <div
                  key={enc.id}
                  onClick={() => onNavigate(`/app/encounters/${enc.id}`)}
                  className="p-4 bg-white border border-slate-200 hover:border-teal-500 rounded-xl shadow-xs transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">
                        {enc.reason_for_visit || 'Clinical Consultation'}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                        enc.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        enc.status === 'IN_PROGRESS' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                        enc.status === 'CANCELLED' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                        'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {enc.status}
                      </span>
                    </div>

                    <div className="text-xs text-slate-500 flex flex-wrap items-center gap-3">
                      <span>Type: <strong className="text-slate-700">{enc.encounter_type}</strong></span>
                      <span>•</span>
                      <span>Recorded: <strong className="text-slate-700">{new Date(enc.created_at).toLocaleString()}</strong></span>
                      <span>•</span>
                      <span>Timezone: <strong className="text-slate-700">{enc.timezone}</strong></span>
                    </div>

                    <div className="text-[11px] text-slate-400 flex items-center gap-3 pt-1">
                      <span>Notes Attached: {enc.notesCount ?? 0}</span>
                      <span>•</span>
                      <span>Observations: {enc.observationsCount ?? 0}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); onNavigate(`/app/encounters/${enc.id}`); }}
                      className="px-3 py-1.5 bg-slate-50 hover:bg-teal-50 hover:text-teal-900 border border-slate-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
                    >
                      <span>Open Workspace</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: CLINICAL NOTES */}
      {activeTab === 'NOTES' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Clinician-Authored Notes ({notes.length})
            </h3>
          </div>

          {notes.length === 0 ? (
            <div className="p-12 text-center bg-white border border-slate-200 rounded-xl space-y-2">
              <FileText className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="text-sm font-semibold text-slate-700">No Clinical Notes Documented</div>
              <p className="text-xs text-slate-500">
                Start or open an encounter to document subjective and objective medical notes.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {notes.map(note => {
                const isExpanded = expandedNoteId === note.id;
                return (
                  <div key={note.id} className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
                    <div
                      onClick={() => setExpandedNoteId(isExpanded ? null : note.id)}
                      className="p-4 bg-slate-50/50 hover:bg-slate-50 cursor-pointer flex items-center justify-between transition-colors border-b border-slate-100"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-teal-50 text-teal-700 rounded-lg">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                            <span>{note.note_type}</span>
                            <span className={`text-[10px] px-2 py-0.2 rounded-full font-bold uppercase ${
                              note.status === 'SIGNED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                              note.status === 'AMENDED' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                              'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
                              {note.status} (v{note.version})
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Authored on {new Date(note.created_at).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {note.signed_at && (
                          <div className="hidden sm:flex items-center gap-1 text-[11px] text-emerald-700 font-semibold">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Signed {new Date(note.signed_at).toLocaleDateString()}</span>
                          </div>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigate(`/app/encounters/${note.encounter_id}`);
                          }}
                          className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded text-xs font-medium"
                        >
                          Go to Encounter
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-5 space-y-4 text-xs">
                        {note.chief_complaint && (
                          <div>
                            <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px] text-slate-500 mb-1">Chief Complaint</div>
                            <p className="text-slate-800">{note.chief_complaint}</p>
                          </div>
                        )}

                        {note.history_of_present_illness && (
                          <div>
                            <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px] text-slate-500 mb-1">History of Present Illness (HPI)</div>
                            <p className="text-slate-800 whitespace-pre-line leading-relaxed">{note.history_of_present_illness}</p>
                          </div>
                        )}

                        {(note.past_medical_history || note.surgical_history || note.family_social_history) && (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                            {note.past_medical_history && (
                              <div>
                                <span className="font-semibold text-slate-700 block">Past Medical:</span>
                                <span className="text-slate-600">{note.past_medical_history}</span>
                              </div>
                            )}
                            {note.surgical_history && (
                              <div>
                                <span className="font-semibold text-slate-700 block">Surgical:</span>
                                <span className="text-slate-600">{note.surgical_history}</span>
                              </div>
                            )}
                            {note.family_social_history && (
                              <div>
                                <span className="font-semibold text-slate-700 block">Family/Social:</span>
                                <span className="text-slate-600">{note.family_social_history}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {note.physical_examination && (
                          <div>
                            <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px] text-slate-500 mb-1">Physical Examination</div>
                            <p className="text-slate-800 whitespace-pre-line leading-relaxed">{note.physical_examination}</p>
                          </div>
                        )}

                        {note.assessment && (
                          <div className="p-3.5 bg-teal-50/50 border border-teal-200 rounded-lg">
                            <div className="font-bold text-teal-950 uppercase tracking-wider text-[11px] mb-1">Clinical Assessment</div>
                            <p className="text-slate-800 whitespace-pre-line">{note.assessment}</p>
                          </div>
                        )}

                        {note.plan && (
                          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                            <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px] mb-1">Treatment Plan & Orders</div>
                            <p className="text-slate-800 whitespace-pre-line leading-relaxed">{note.plan}</p>
                          </div>
                        )}

                        {note.follow_up_instructions && (
                          <div>
                            <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px] text-slate-500 mb-1">Follow-Up Instructions</div>
                            <p className="text-slate-800">{note.follow_up_instructions}</p>
                          </div>
                        )}

                        {note.amendment_reason && (
                          <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-purple-900">
                            <span className="font-bold block">Document Amendment Notice:</span>
                            <span className="text-xs">{note.amendment_reason}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: OBSERVATIONS */}
      {activeTab === 'OBSERVATIONS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Recorded Physiological Observations & Vital Signs ({observations.length})
            </h3>
          </div>

          {observations.length === 0 ? (
            <div className="p-12 text-center bg-white border border-slate-200 rounded-xl space-y-2">
              <HeartPulse className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="text-sm font-semibold text-slate-700">No Vital Signs Recorded</div>
              <p className="text-xs text-slate-500">
                Vital signs recorded during clinical encounters will appear chronologically here.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
                    <tr>
                      <th className="px-4 py-3">Measurement</th>
                      <th className="px-4 py-3">Value</th>
                      <th className="px-4 py-3">Unit</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Recorded Timestamp</th>
                      <th className="px-4 py-3">Encounter</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {observations.map(obs => (
                      <tr key={obs.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-bold text-slate-900">
                          {obs.observation_type.replace(/_/g, ' ')}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-sm font-semibold text-teal-800">
                          {obs.numeric_value !== null ? obs.numeric_value : (obs.text_value || '—')}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 font-mono text-xs">
                          {obs.unit}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase bg-slate-100 text-slate-700">
                            {obs.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">
                          {new Date(obs.measured_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => onNavigate(`/app/encounters/${obs.encounter_id}`)}
                            className="text-teal-700 hover:text-teal-900 font-semibold"
                          >
                            View Encounter
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
