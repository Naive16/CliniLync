/**
 * CLINILYNC Patient Longitudinal Problem List View (/app/patients/:patientId/problems)
 * 
 * Complies with Clinilync Phase 9 Master Specification:
 * - Clear distinction between transient encounter visits and longitudinal problems
 * - Structured terminology concepts (ICD-10 catalogue) + clinician-authored text
 * - Active vs Resolved problems with resolution dates and notes
 * - Preserves longitudinal history without destructive deletion
 * - Strict multi-tenant isolation, RBAC gating, and audit logging
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../api/client.js';
import {
  AlertCircle,
  Plus,
  CheckCircle2,
  Calendar,
  AlertTriangle,
  ArrowLeft,
  Search,
  Check,
  RotateCcw,
  History,
  FileText,
  ShieldCheck,
  XCircle,
  Stethoscope
} from 'lucide-react';

interface PatientProblemsViewProps {
  patientId: string;
  onNavigate: (path: string) => void;
}

export const PatientProblemsView: React.FC<PatientProblemsViewProps> = ({ patientId, onNavigate }) => {
  const { user, activeOrganization, hasPermission } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [patient, setPatient] = useState<any | null>(null);
  const [problems, setProblems] = useState<any[]>([]);

  // Filter tab
  const [filterTab, setFilterTab] = useState<'ACTIVE' | 'RESOLVED' | 'ALL'>('ACTIVE');

  // Add Problem modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [newProblemForm, setNewProblemForm] = useState({
    problemName: '',
    code: '',
    terminologySystem: 'ICD-10',
    status: 'ACTIVE',
    onsetDate: ''
  });

  // Terminology search state
  const [terminologyQuery, setTerminologyQuery] = useState('');
  const [terminologyResults, setTerminologyResults] = useState<any[]>([]);
  const [isSearchingTerminology, setIsSearchingTerminology] = useState(false);

  // Resolve Problem modal
  const [problemToResolve, setProblemToResolve] = useState<any | null>(null);
  const [resolveForm, setResolveForm] = useState({
    resolvedDate: new Date().toISOString().split('T')[0],
    resolutionNotes: ''
  });
  const [resolveSubmitting, setResolveSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, [patientId, activeOrganization?.id]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [patRes, probRes] = await Promise.all([
        api.v1GetPatient(patientId),
        api.v1GetPatientProblems(patientId)
      ]);
      setPatient(patRes.patient);
      setProblems(probRes.problems || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load patient problem list.');
    } finally {
      setLoading(false);
    }
  };

  const searchTerminology = async (q: string) => {
    setTerminologyQuery(q);
    if (!q || q.trim().length < 2) {
      setTerminologyResults([]);
      return;
    }

    setIsSearchingTerminology(true);
    try {
      const res = await api.v1SearchTerminology('ICD-10', q.trim());
      setTerminologyResults(res.concepts || []);
    } catch (err) {
      // Fallback
      setTerminologyResults([]);
    } finally {
      setIsSearchingTerminology(false);
    }
  };

  const handleSelectTerminology = (concept: any) => {
    setNewProblemForm({
      ...newProblemForm,
      problemName: concept.display_name,
      code: concept.code,
      terminologySystem: concept.system || 'ICD-10'
    });
    setTerminologyQuery('');
    setTerminologyResults([]);
  };

  const handleAddProblem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProblemForm.problemName.trim()) {
      setAddError('Problem name is required.');
      return;
    }

    setAddSubmitting(true);
    setAddError(null);
    try {
      await api.v1AddPatientProblem(patientId, newProblemForm);
      setShowAddModal(false);
      setNewProblemForm({
        problemName: '',
        code: '',
        terminologySystem: 'ICD-10',
        status: 'ACTIVE',
        onsetDate: ''
      });
      await loadData();
    } catch (err: any) {
      setAddError(err?.message || 'Failed to add problem to problem list.');
    } finally {
      setAddSubmitting(false);
    }
  };

  const handleResolveProblem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!problemToResolve) return;

    setResolveSubmitting(true);
    try {
      await api.v1ResolvePatientProblem(patientId, problemToResolve.id, resolveForm);
      setProblemToResolve(null);
      setResolveForm({
        resolvedDate: new Date().toISOString().split('T')[0],
        resolutionNotes: ''
      });
      await loadData();
    } catch (err: any) {
      alert(err?.message || 'Failed to resolve problem.');
    } finally {
      setResolveSubmitting(false);
    }
  };

  const filteredProblems = problems.filter(p => {
    if (filterTab === 'ALL') return true;
    return p.status === filterTab;
  });

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
        <div className="w-6 h-6 border-2 border-teal-700 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-semibold">Loading patient problem list...</span>
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-4">
        <div className="p-6 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-red-900">Problem List Inaccessible</h3>
            <p className="text-xs text-red-700 mt-1">{error || 'Patient record could not be resolved.'}</p>
          </div>
        </div>
        <button
          onClick={() => onNavigate(`/app/patients/${patientId}`)}
          className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to Patient Profile</span>
        </button>
      </div>
    );
  }

  const activeCount = problems.filter(p => p.status === 'ACTIVE').length;
  const resolvedCount = problems.filter(p => p.status === 'RESOLVED').length;

  return (
    <div className="cl-ui-page space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate(`/app/patients/${patientId}`)}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            title="Return to patient chart"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Longitudinal Problem List
              </h1>
              <span className="font-mono text-xs px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-200 rounded">
                {patient.first_name} {patient.last_name} ({patient.mrn})
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Longitudinal chronic and significant conditions maintained across clinical encounters
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasPermission('problem_list.manage') && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Problem</span>
            </button>
          )}

          <button
            onClick={() => onNavigate(`/app/patients/${patientId}/care-plans`)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-xs transition-colors"
          >
            <Stethoscope className="w-3.5 h-3.5 text-teal-700" />
            <span>Care Plans</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 text-xs font-semibold pb-1">
        <button
          onClick={() => setFilterTab('ACTIVE')}
          className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
            filterTab === 'ACTIVE'
              ? 'bg-teal-50 text-teal-800 font-bold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>Active Problems</span>
          <span className="px-1.5 py-0.2 rounded-full bg-teal-100 text-teal-800 text-[10px]">
            {activeCount}
          </span>
        </button>

        <button
          onClick={() => setFilterTab('RESOLVED')}
          className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
            filterTab === 'RESOLVED'
              ? 'bg-teal-50 text-teal-800 font-bold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>Resolved</span>
          <span className="px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 text-[10px]">
            {resolvedCount}
          </span>
        </button>

        <button
          onClick={() => setFilterTab('ALL')}
          className={`px-3 py-1.5 rounded-lg transition-colors ${
            filterTab === 'ALL'
              ? 'bg-teal-50 text-teal-800 font-bold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          All ({problems.length})
        </button>
      </div>

      {/* Problem List Content */}
      {filteredProblems.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-xs space-y-3">
          <AlertCircle className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="text-sm font-bold text-slate-800">No Problems in this Category</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {filterTab === 'ACTIVE'
              ? 'No active conditions currently on this patient’s longitudinal problem list.'
              : 'No resolved conditions documented.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs divide-y divide-slate-100 overflow-hidden">
          {filteredProblems.map(p => {
            const isResolved = p.status === 'RESOLVED';

            return (
              <div key={p.id} className="p-4 hover:bg-slate-50/50 transition-colors flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">{p.problem_name}</span>
                    {p.code && (
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                        {p.terminology_system || 'ICD-10'}: {p.code}
                      </span>
                    )}
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      isResolved
                        ? 'bg-slate-100 text-slate-700 border border-slate-200'
                        : 'bg-teal-100 text-teal-800 border border-teal-200'
                    }`}>
                      {p.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-[11px] text-slate-500">
                    {p.onset_date && (
                      <span>Onset Date: <strong>{p.onset_date}</strong></span>
                    )}
                    {p.resolved_date && (
                      <span>Resolved Date: <strong>{p.resolved_date}</strong></span>
                    )}
                    <span>Logged: {new Date(p.created_at).toLocaleDateString()}</span>
                  </div>

                  {p.resolution_notes && (
                    <div className="p-2 bg-slate-50 rounded border border-slate-100 text-xs text-slate-600 mt-2">
                      <span className="font-semibold text-slate-700 block">Resolution Note:</span>
                      {p.resolution_notes}
                    </div>
                  )}
                </div>

                {!isResolved && hasPermission('problem_list.manage') && (
                  <button
                    onClick={() => setProblemToResolve(p)}
                    className="px-2.5 py-1 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors shrink-0"
                  >
                    Mark Resolved
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Add Problem */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Add to Longitudinal Problem List</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {addError && (
              <div className="p-3 bg-red-50 text-xs text-red-700 rounded-lg border border-red-200">
                {addError}
              </div>
            )}

            <form onSubmit={handleAddProblem} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Search ICD-10 Catalogue (Optional)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search standard terminology (e.g. hypertension, asthma)..."
                    value={terminologyQuery}
                    onChange={e => searchTerminology(e.target.value)}
                    className="w-full text-xs px-3 py-2 pl-8 border border-slate-300 rounded-lg"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>

                {terminologyResults.length > 0 && (
                  <div className="mt-1 border border-slate-200 rounded-lg bg-white shadow-xs max-h-36 overflow-y-auto divide-y divide-slate-100">
                    {terminologyResults.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectTerminology(item)}
                        className="w-full text-left p-2 hover:bg-teal-50 text-xs flex items-center justify-between"
                      >
                        <span className="font-medium text-slate-800">{item.display_name}</span>
                        <span className="font-mono text-[10px] text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded">
                          {item.code}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Problem Name / Diagnosis *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Essential (primary) hypertension"
                  value={newProblemForm.problemName}
                  onChange={e => setNewProblemForm({ ...newProblemForm, problemName: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Code</label>
                  <input
                    type="text"
                    placeholder="e.g. I10"
                    value={newProblemForm.code}
                    onChange={e => setNewProblemForm({ ...newProblemForm, code: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Onset Date</label>
                  <input
                    type="date"
                    value={newProblemForm.onsetDate}
                    onChange={e => setNewProblemForm({ ...newProblemForm, onsetDate: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addSubmitting}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                >
                  {addSubmitting ? 'Adding...' : 'Add Problem'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Resolve Problem */}
      {problemToResolve && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Mark Problem Resolved</h3>
            <p className="text-xs text-slate-600">
              Condition: <strong>{problemToResolve.problem_name}</strong>
            </p>

            <form onSubmit={handleResolveProblem} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Resolution Date</label>
                <input
                  type="date"
                  required
                  value={resolveForm.resolvedDate}
                  onChange={e => setResolveForm({ ...resolveForm, resolvedDate: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Resolution Notes</label>
                <textarea
                  rows={3}
                  placeholder="Document clinical resolution criteria, normal findings, or conclusion..."
                  value={resolveForm.resolutionNotes}
                  onChange={e => setResolveForm({ ...resolveForm, resolutionNotes: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setProblemToResolve(null)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resolveSubmitting}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                >
                  {resolveSubmitting ? 'Resolving...' : 'Confirm Resolution'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
