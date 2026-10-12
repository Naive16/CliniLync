/**
 * CLINILYNC Care Plans & Treatment Planning View (/app/patients/:patientId/care-plans)
 * 
 * Complies with Clinilync Phase 9 Master Specification:
 * - Structured clinician-authored care plans with goals & review dates
 * - Granular plan items/actions across lifestyle, monitoring, self-care, and consultation
 * - Server-validated state transitions (DRAFT -> ACTIVE -> ON_HOLD -> COMPLETED / CANCELLED)
 * - Atomic item completion tracking without accidental whole-plan completion
 * - Strict multi-tenant isolation, RBAC gating, and audit logging
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../api/client.js';
import {
  ClipboardList,
  Plus,
  CheckCircle2,
  Clock,
  Calendar,
  AlertTriangle,
  ArrowLeft,
  CheckSquare,
  Square,
  User,
  ShieldCheck,
  RotateCcw,
  XCircle,
  FileText,
  ChevronRight,
  Activity,
  Layers
} from 'lucide-react';

interface CarePlansViewProps {
  patientId: string;
  onNavigate: (path: string) => void;
}

export const CarePlansView: React.FC<CarePlansViewProps> = ({ patientId, onNavigate }) => {
  const { user, activeOrganization, hasPermission } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [patient, setPatient] = useState<any | null>(null);
  const [carePlans, setCarePlans] = useState<any[]>([]);

  // Selected plan detail
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  // New Care Plan modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newPlanForm, setNewPlanForm] = useState({
    title: '',
    clinicalRationale: '',
    description: '',
    startDate: new Date().toISOString().split('T')[0],
    reviewDate: '',
    status: 'ACTIVE',
    items: [
      { category: 'SELF_CARE', description: '', responsibleRole: 'PATIENT', dueDate: '' }
    ]
  });

  // New Item modal for existing plan
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [newItemForm, setNewItemForm] = useState({
    category: 'SELF_CARE',
    description: '',
    responsibleRole: 'PATIENT',
    dueDate: ''
  });

  // Complete Item modal
  const [itemToComplete, setItemToComplete] = useState<any | null>(null);
  const [itemCompletionNotes, setItemCompletionNotes] = useState('');

  // Status transition modal
  const [transitionTarget, setTransitionTarget] = useState<'ACTIVE' | 'COMPLETED' | 'CANCELLED' | null>(null);
  const [transitionReason, setTransitionReason] = useState('');

  useEffect(() => {
    loadData();
  }, [patientId, activeOrganization?.id]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [patRes, plansRes] = await Promise.all([
        api.v1GetPatient(patientId),
        api.v1GetPatientCarePlans(patientId)
      ]);
      setPatient(patRes.patient);
      const plans = plansRes.carePlans || [];
      setCarePlans(plans);
      if (plans.length > 0 && !selectedPlanId) {
        setSelectedPlanId(plans[0].id);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load care plans.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCarePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlanForm.title.trim()) {
      setCreateError('Plan title is required.');
      return;
    }

    setCreateSubmitting(true);
    setCreateError(null);
    try {
      const validItems = newPlanForm.items.filter(it => it.description.trim() !== '');
      const res = await api.v1CreateCarePlan(patientId, {
        ...newPlanForm,
        items: validItems
      });
      setShowCreateModal(false);
      setNewPlanForm({
        title: '',
        clinicalRationale: '',
        description: '',
        startDate: new Date().toISOString().split('T')[0],
        reviewDate: '',
        status: 'ACTIVE',
        items: [{ category: 'SELF_CARE', description: '', responsibleRole: 'PATIENT', dueDate: '' }]
      });
      await loadData();
      if (res?.carePlan?.id) {
        setSelectedPlanId(res.carePlan.id);
      }
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to create care plan.');
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleAddItemToPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlanId || !newItemForm.description.trim()) return;

    try {
      await api.v1AddCarePlanItem(selectedPlanId, newItemForm);
      setShowAddItemModal(false);
      setNewItemForm({
        category: 'SELF_CARE',
        description: '',
        responsibleRole: 'PATIENT',
        dueDate: ''
      });
      await loadData();
    } catch (err: any) {
      alert(err?.message || 'Failed to add item to care plan.');
    }
  };

  const handleCompleteItem = async () => {
    if (!selectedPlanId || !itemToComplete) return;

    try {
      await api.v1CompleteCarePlanItem(selectedPlanId, itemToComplete.id, itemCompletionNotes);
      setItemToComplete(null);
      setItemCompletionNotes('');
      await loadData();
    } catch (err: any) {
      alert(err?.message || 'Failed to complete care plan item.');
    }
  };

  const handleStatusTransition = async () => {
    if (!selectedPlanId || !transitionTarget) return;

    try {
      if (transitionTarget === 'ACTIVE') {
        await api.v1ActivateCarePlan(selectedPlanId);
      } else if (transitionTarget === 'COMPLETED') {
        await api.v1CompleteCarePlan(selectedPlanId, transitionReason);
      } else if (transitionTarget === 'CANCELLED') {
        await api.v1CancelCarePlan(selectedPlanId, transitionReason);
      }
      setTransitionTarget(null);
      setTransitionReason('');
      await loadData();
    } catch (err: any) {
      alert(err?.message || 'Failed to update care plan status.');
    }
  };

  const selectedPlan = carePlans.find(cp => cp.id === selectedPlanId) || null;

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
        <div className="w-6 h-6 border-2 border-teal-700 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-semibold">Loading patient care plans...</span>
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-4">
        <div className="p-6 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-red-900">Care Plans Inaccessible</h3>
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

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
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
                Treatment & Care Plans
              </h1>
              <span className="font-mono text-xs px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-200 rounded">
                {patient.first_name} {patient.last_name} ({patient.mrn})
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Clinician-authored management protocols, goals, and follow-up activities
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasPermission('care_plan.create') && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Care Plan</span>
            </button>
          )}

          <button
            onClick={() => onNavigate(`/app/patients/${patientId}/medical-record`)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-xs transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            <span>Full Medical Record</span>
          </button>
        </div>
      </div>

      {carePlans.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-xs space-y-4">
          <ClipboardList className="w-12 h-12 text-slate-300 mx-auto" />
          <div>
            <h3 className="text-sm font-bold text-slate-800">No Care Plans Documented</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              There are currently no active or historical treatment plans recorded for this patient.
            </p>
          </div>
          {hasPermission('care_plan.create') && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Initial Care Plan</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Plan List */}
          <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 shadow-xs divide-y divide-slate-100 overflow-hidden">
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-teal-700" />
                <span>Patient Care Plans ({carePlans.length})</span>
              </span>
            </div>

            <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
              {carePlans.map(cp => {
                const isSelected = cp.id === selectedPlanId;
                const completedItems = (cp.items || []).filter((i: any) => i.status === 'COMPLETED').length;
                const totalItems = (cp.items || []).length;

                return (
                  <button
                    key={cp.id}
                    onClick={() => setSelectedPlanId(cp.id)}
                    className={`w-full text-left p-4 transition-colors ${
                      isSelected ? 'bg-teal-50/70 border-l-4 border-l-teal-600' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-xs font-bold text-slate-900 line-clamp-1">{cp.title}</h4>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${
                        cp.status === 'ACTIVE'
                          ? 'bg-teal-100 text-teal-800'
                          : cp.status === 'COMPLETED'
                          ? 'bg-blue-100 text-blue-800'
                          : cp.status === 'CANCELLED'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {cp.status}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 line-clamp-2 mt-1">
                      {cp.clinical_rationale || cp.description || 'No rationale specified'}
                    </p>

                    <div className="flex items-center gap-3 text-[10px] text-slate-400 mt-2">
                      <span>Started: {cp.start_date}</span>
                      <span>•</span>
                      <span>Items: {completedItems}/{totalItems}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Plan Detail Workspace */}
          {selectedPlan && (
            <div className="lg:col-span-8 space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-slate-900">{selectedPlan.title}</h2>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        selectedPlan.status === 'ACTIVE'
                          ? 'bg-teal-100 text-teal-800 border border-teal-200'
                          : selectedPlan.status === 'COMPLETED'
                          ? 'bg-blue-100 text-blue-800 border border-blue-200'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {selectedPlan.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
                      <span>Start: <strong>{selectedPlan.start_date}</strong></span>
                      {selectedPlan.review_date && (
                        <span>Review Due: <strong>{selectedPlan.review_date}</strong></span>
                      )}
                      <span>Plan ID: <code className="font-mono text-[10px]">{selectedPlan.id}</code></span>
                    </div>
                  </div>

                  {/* Actions based on status */}
                  <div className="flex items-center gap-2 shrink-0">
                    {selectedPlan.status === 'DRAFT' && hasPermission('care_plan.update') && (
                      <button
                        onClick={() => { setTransitionTarget('ACTIVE'); }}
                        className="px-2.5 py-1 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors"
                      >
                        Activate Plan
                      </button>
                    )}

                    {selectedPlan.status === 'ACTIVE' && hasPermission('care_plan.complete') && (
                      <button
                        onClick={() => { setTransitionTarget('COMPLETED'); }}
                        className="px-2.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
                      >
                        Mark Completed
                      </button>
                    )}

                    {['ACTIVE', 'DRAFT', 'ON_HOLD'].includes(selectedPlan.status) && hasPermission('care_plan.cancel') && (
                      <button
                        onClick={() => { setTransitionTarget('CANCELLED'); }}
                        className="px-2.5 py-1 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors"
                      >
                        Cancel Plan
                      </button>
                    )}
                  </div>
                </div>

                {/* Rationale & Description */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="font-bold text-slate-700 block mb-1">Clinical Goal & Rationale</span>
                    <p className="text-slate-600 whitespace-pre-line">
                      {selectedPlan.clinical_rationale || 'None specified.'}
                    </p>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="font-bold text-slate-700 block mb-1">Plan Description</span>
                    <p className="text-slate-600 whitespace-pre-line">
                      {selectedPlan.description || 'None specified.'}
                    </p>
                  </div>
                </div>

                {/* Items & Actions section */}
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-teal-700" />
                      <span>Action Items & Activities ({(selectedPlan.items || []).length})</span>
                    </h3>

                    {selectedPlan.status === 'ACTIVE' && hasPermission('care_plan.update') && (
                      <button
                        onClick={() => setShowAddItemModal(true)}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-50 rounded-lg transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Action Item</span>
                      </button>
                    )}
                  </div>

                  {(selectedPlan.items || []).length === 0 ? (
                    <div className="p-6 text-center border border-dashed border-slate-200 rounded-lg text-xs text-slate-400">
                      No action items or follow-up activities added yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedPlan.items.map((item: any) => {
                        const isDone = item.status === 'COMPLETED';
                        return (
                          <div
                            key={item.id}
                            className={`p-3.5 rounded-lg border text-xs flex items-start justify-between gap-3 transition-colors ${
                              isDone ? 'bg-slate-50/70 border-slate-200 text-slate-500' : 'bg-white border-slate-200 text-slate-800'
                            }`}
                          >
                            <div className="flex items-start gap-2.5">
                              {hasPermission('care_plan.update') && !isDone ? (
                                <button
                                  onClick={() => setItemToComplete(item)}
                                  className="mt-0.5 text-slate-400 hover:text-teal-600"
                                  title="Mark item completed"
                                >
                                  <Square className="w-4 h-4" />
                                </button>
                              ) : isDone ? (
                                <CheckSquare className="w-4 h-4 text-teal-600 mt-0.5 shrink-0" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300 mt-0.5 shrink-0" />
                              )}

                              <div>
                                <div className="flex items-center gap-2">
                                  <span className={`font-semibold ${isDone ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                                    {item.description}
                                  </span>
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-mono">
                                    {item.category}
                                  </span>
                                </div>

                                {item.completion_notes && (
                                  <p className="text-[11px] text-teal-800 bg-teal-50/60 p-1.5 rounded mt-1.5 border border-teal-100">
                                    <strong>Completion Note:</strong> {item.completion_notes}
                                  </p>
                                )}

                                <div className="flex items-center gap-3 text-[10px] text-slate-400 mt-1.5">
                                  <span>Role: {item.responsible_role || 'PATIENT'}</span>
                                  {item.due_date && <span>Due: {item.due_date}</span>}
                                  {item.completed_at && <span>Completed: {new Date(item.completed_at).toLocaleDateString()}</span>}
                                </div>
                              </div>
                            </div>

                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${
                              isDone ? 'bg-teal-100 text-teal-800' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {item.status}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal: New Care Plan */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Create Treatment & Care Plan</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {createError && (
              <div className="p-3 bg-red-50 text-xs text-red-700 rounded-lg border border-red-200">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateCarePlan} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Plan Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Hypertension Dietary & Exercise Management"
                  value={newPlanForm.title}
                  onChange={e => setNewPlanForm({ ...newPlanForm, title: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Clinical Goal & Rationale</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Achieve resting blood pressure < 130/80 mmHg via sodium restriction and daily aerobic exercise."
                  value={newPlanForm.clinicalRationale}
                  onChange={e => setNewPlanForm({ ...newPlanForm, clinicalRationale: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Plan Details & Instructions</label>
                <textarea
                  rows={2}
                  placeholder="Comprehensive clinical plan summary..."
                  value={newPlanForm.description}
                  onChange={e => setNewPlanForm({ ...newPlanForm, description: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={newPlanForm.startDate}
                    onChange={e => setNewPlanForm({ ...newPlanForm, startDate: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Target Review Date</label>
                  <input
                    type="date"
                    value={newPlanForm.reviewDate}
                    onChange={e => setNewPlanForm({ ...newPlanForm, reviewDate: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Initial Action Item */}
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-xs font-semibold text-slate-700 mb-2">Initial Action Item</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <select
                    value={newPlanForm.items[0].category}
                    onChange={e => {
                      const updated = [...newPlanForm.items];
                      updated[0].category = e.target.value;
                      setNewPlanForm({ ...newPlanForm, items: updated });
                    }}
                    className="text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="SELF_CARE">Self Care</option>
                    <option value="LIFESTYLE">Lifestyle</option>
                    <option value="MONITORING">Monitoring</option>
                    <option value="CONSULTATION">Consultation</option>
                    <option value="EDUCATION">Education</option>
                    <option value="REFERRAL">Referral</option>
                  </select>

                  <input
                    type="text"
                    placeholder="Action description..."
                    className="sm:col-span-2 text-xs px-3 py-2 border border-slate-300 rounded-lg"
                    value={newPlanForm.items[0].description}
                    onChange={e => {
                      const updated = [...newPlanForm.items];
                      updated[0].description = e.target.value;
                      setNewPlanForm({ ...newPlanForm, items: updated });
                    }}
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="px-4 py-2 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors"
                >
                  {createSubmitting ? 'Creating...' : 'Create Care Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Action Item */}
      {showAddItemModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Add Action Item</h3>
              <button onClick={() => setShowAddItemModal(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddItemToPlan} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                <select
                  value={newItemForm.category}
                  onChange={e => setNewItemForm({ ...newItemForm, category: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="SELF_CARE">Self Care</option>
                  <option value="LIFESTYLE">Lifestyle</option>
                  <option value="MONITORING">Monitoring / Tracking</option>
                  <option value="CONSULTATION">Consultation / Follow-Up</option>
                  <option value="EDUCATION">Patient Education</option>
                  <option value="REFERRAL">Referral</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g. Daily blood pressure check log every morning before breakfast"
                  value={newItemForm.description}
                  onChange={e => setNewItemForm({ ...newItemForm, description: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Responsible Role</label>
                  <input
                    type="text"
                    value={newItemForm.responsibleRole}
                    onChange={e => setNewItemForm({ ...newItemForm, responsibleRole: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
                    placeholder="PATIENT, PROVIDER, NURSE"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={newItemForm.dueDate}
                    onChange={e => setNewItemForm({ ...newItemForm, dueDate: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddItemModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                >
                  Add Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Complete Action Item */}
      {itemToComplete && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Mark Item Completed</h3>
            <p className="text-xs text-slate-600">
              Complete action: <strong>{itemToComplete.description}</strong>
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Clinical Completion Notes</label>
              <textarea
                rows={3}
                placeholder="Document outcomes or findings upon completion..."
                value={itemCompletionNotes}
                onChange={e => setItemCompletionNotes(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setItemToComplete(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCompleteItem}
                className="px-4 py-1.5 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
              >
                Confirm Completion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Status Transition */}
      {transitionTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              Transition Plan to {transitionTarget}
            </h3>
            <p className="text-xs text-slate-600">
              Are you sure you want to transition this care plan to <strong>{transitionTarget}</strong>?
            </p>

            {(transitionTarget === 'COMPLETED' || transitionTarget === 'CANCELLED') && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason / Clinical Summary</label>
                <textarea
                  rows={2}
                  placeholder="Document reason for plan completion or discontinuation..."
                  value={transitionReason}
                  onChange={e => setTransitionReason(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setTransitionTarget(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStatusTransition}
                className="px-4 py-1.5 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
              >
                Confirm Transition
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
