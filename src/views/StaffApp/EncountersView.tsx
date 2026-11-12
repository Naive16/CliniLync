/**
 * CLINILYNC Clinical Encounters & Workspace View (/app/encounters)
 * 
 * Phase 8 Implementation:
 * - Encounters Roster & Filter Directory (/app/encounters)
 * - Encounter Intake Registration (/app/encounters/new)
 * - Clinical Encounter Workspace (/app/encounters/:encounterId)
 * - Multi-section Clinician Notes Editor (Draft, Optimistic Locking, Sign, Amend)
 * - Observation & Vital Signs Recording with Explicit Units & Live BMI Calculation
 * - Enforced RBAC & Multi-tenant isolation
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../api/client.js';
import {
  Stethoscope,
  Plus,
  Search,
  Calendar,
  Clock,
  User,
  CheckCircle2,
  AlertTriangle,
  FileText,
  HeartPulse,
  ArrowLeft,
  ChevronRight,
  ShieldCheck,
  XCircle,
  Play,
  RotateCcw,
  History,
  Activity,
  Lock,
  Edit3
} from 'lucide-react';

interface EncountersViewProps {
  currentPath?: string;
  encounterIdParam?: string | null;
  onNavigate: (path: string) => void;
}

export const EncountersView: React.FC<EncountersViewProps> = ({ currentPath = '/app/encounters', encounterIdParam, onNavigate }) => {
  const { user, activeOrganization, hasPermission } = useAuth();

  const isNewRoute = currentPath === '/app/encounters/new';
  const targetEncounterId = encounterIdParam || (currentPath.match(/\/app\/encounters\/([a-zA-Z0-9_]+)/)?.[1] || null);
  const isWorkspaceRoute = !isNewRoute && targetEncounterId && targetEncounterId !== 'new';

  // Roster state
  const [encounters, setEncounters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Workspace state
  const [encounterData, setEncounterData] = useState<{
    encounter: any;
    patient: any;
    provider: any;
    appointment: any;
  } | null>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [observations, setObservations] = useState<any[]>([]);
  const [diagnoses, setDiagnoses] = useState<any[]>([]);
  const [followUps, setFollowUps] = useState<any[]>([]);
  const [clinicalAlerts, setClinicalAlerts] = useState<any[]>([]);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'NOTES' | 'VITALS' | 'DIAGNOSES' | 'FOLLOW_UP' | 'ALERTS'>('NOTES');
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  // Phase 9 Diagnosis state
  const [showAddDiagModal, setShowAddDiagModal] = useState(false);
  const [diagForm, setDiagForm] = useState({
    displayName: '',
    diagnosisCode: '',
    terminologySystem: 'ICD-10',
    description: '',
    isPrimary: false,
    clinicalStatus: 'ACTIVE',
    onsetDate: ''
  });
  const [diagSubmitting, setDiagSubmitting] = useState(false);
  const [diagTerminologyQuery, setDiagTerminologyQuery] = useState('');
  const [diagTerminologyResults, setDiagTerminologyResults] = useState<any[]>([]);

  // Phase 9 Follow-up state
  const [showAddFollowUpModal, setShowAddFollowUpModal] = useState(false);
  const [followUpForm, setFollowUpForm] = useState({
    timeframe: '2-3 weeks',
    reassessmentDate: '',
    instructions: '',
    warningSigns: '',
    isPatientFacing: true
  });
  const [followUpSubmitting, setFollowUpSubmitting] = useState(false);

  // Phase 9 Alert Review state
  const [alertToReview, setAlertToReview] = useState<any | null>(null);
  const [reviewAlertStatus, setReviewAlertStatus] = useState<'ACKNOWLEDGED' | 'DISMISSED' | 'ACTION_TAKEN'>('ACKNOWLEDGED');
  const [reviewAlertNotes, setReviewAlertNotes] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  // Note editor state
  const [selectedNote, setSelectedNote] = useState<any | null>(null);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteForm, setNoteForm] = useState({
    noteType: 'PROGRESS_NOTE',
    chiefComplaint: '',
    historyOfPresentIllness: '',
    pastMedicalHistory: '',
    surgicalHistory: '',
    familySocialHistory: '',
    reviewOfSystems: '',
    physicalExamination: '',
    assessment: '',
    plan: '',
    followUpInstructions: ''
  });
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteSuccess, setNoteSuccess] = useState<string | null>(null);

  // Note signing / amendment modal state
  const [showSignModal, setShowSignModal] = useState(false);
  const [showAmendModal, setShowAmendModal] = useState(false);
  const [amendmentReason, setAmendmentReason] = useState('');
  const [showVersionHistoryModal, setShowVersionHistoryModal] = useState(false);
  const [versionHistory, setVersionHistory] = useState<any[]>([]);

  // Cancel encounter modal state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Observation form state
  const [obsForm, setObsForm] = useState({
    observationType: 'HEART_RATE',
    numericValue: '',
    unit: 'bpm',
    notes: ''
  });
  const [vitalsBatch, setVitalsBatch] = useState({
    systolicBp: '',
    diastolicBp: '',
    heartRate: '',
    respiratoryRate: '',
    tempC: '',
    o2Sat: '',
    heightCm: '',
    weightKg: '',
    painScore: ''
  });
  const [savingVitals, setSavingVitals] = useState(false);

  // New encounter form state
  const [newEncForm, setNewEncForm] = useState({
    patientId: '',
    providerId: '',
    encounterType: 'IN_PERSON',
    reasonForVisit: '',
    timezone: activeOrganization?.timezone || 'Europe/London'
  });
  const [patientsList, setPatientsList] = useState<any[]>([]);
  const [providersList, setProvidersList] = useState<any[]>([]);
  const [creatingEncounter, setCreatingEncounter] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Load roster
  useEffect(() => {
    if (!isWorkspaceRoute && !isNewRoute) {
      loadEncounters();
    }
  }, [isWorkspaceRoute, isNewRoute, statusFilter, activeOrganization?.id]);

  // Load workspace
  useEffect(() => {
    if (isWorkspaceRoute && targetEncounterId) {
      loadWorkspace(targetEncounterId);
    }
  }, [isWorkspaceRoute, targetEncounterId, activeOrganization?.id]);

  // Load new form data
  useEffect(() => {
    if (isNewRoute) {
      loadIntakeCatalogs();
    }
  }, [isNewRoute, activeOrganization?.id]);

  const loadEncounters = async () => {
    setLoading(true);
    try {
      const res = await api.v1GetEncounters({
        status: statusFilter !== 'ALL' ? statusFilter : undefined
      });
      setEncounters(res.encounters || []);
    } catch {
      setEncounters([]);
    } finally {
      setLoading(false);
    }
  };

  const loadWorkspace = async (encId: string) => {
    setWorkspaceLoading(true);
    setWorkspaceError(null);
    try {
      const [encRes, notesRes, obsRes, diagRes, fupRes, alertsRes] = await Promise.all([
        api.v1GetEncounter(encId),
        api.v1GetEncounterNotes(encId),
        api.v1GetEncounterObservations(encId),
        api.v1GetEncounterDiagnoses(encId).catch(() => ({ diagnoses: [] })),
        api.v1GetEncounterFollowUp(encId).catch(() => ({ followUps: [] })),
        api.v1GetClinicalAlerts({ encounterId: encId }).catch(() => ({ alerts: [] }))
      ]);
      setEncounterData(encRes);
      setNotes(notesRes.notes || []);
      setObservations(obsRes.observations || []);
      setDiagnoses(diagRes.diagnoses || []);
      setFollowUps(fupRes.followUps || []);
      setClinicalAlerts(alertsRes.alerts || []);

      if (notesRes.notes?.length > 0) {
        selectNoteForViewing(notesRes.notes[0]);
      } else {
        resetNoteForm();
      }
    } catch (err: any) {
      setWorkspaceError(err?.message || 'Failed to load encounter workspace.');
    } finally {
      setWorkspaceLoading(false);
    }
  };

  const loadIntakeCatalogs = async () => {
    try {
      const [patRes, provRes] = await Promise.all([
        api.v1GetPatients({ limit: 100 }),
        api.v1GetProviders({})
      ]);
      setPatientsList(patRes.patients || []);
      setProvidersList(provRes.providers || []);

      // Check query param for preselected patient
      const urlParams = new URLSearchParams(window.location.search);
      const preselectPatId = urlParams.get('patientId');
      if (preselectPatId) {
        setNewEncForm(prev => ({ ...prev, patientId: preselectPatId }));
      } else if (patRes.patients?.length > 0) {
        setNewEncForm(prev => ({ ...prev, patientId: patRes.patients[0].id }));
      }

      if (provRes.providers?.length > 0) {
        setNewEncForm(prev => ({ ...prev, providerId: provRes.providers[0].id }));
      }
    } catch {
      // Catalogs load fallback
    }
  };

  const selectNoteForViewing = (note: any) => {
    setSelectedNote(note);
    setIsEditingNote(false);
    setNoteForm({
      noteType: note.note_type || 'PROGRESS_NOTE',
      chiefComplaint: note.chief_complaint || '',
      historyOfPresentIllness: note.history_of_present_illness || '',
      pastMedicalHistory: note.past_medical_history || '',
      surgicalHistory: note.surgical_history || '',
      familySocialHistory: note.family_social_history || '',
      reviewOfSystems: note.review_of_systems || '',
      physicalExamination: note.physical_examination || '',
      assessment: note.assessment || '',
      plan: note.plan || '',
      followUpInstructions: note.follow_up_instructions || ''
    });
  };

  const resetNoteForm = () => {
    setSelectedNote(null);
    setIsEditingNote(true);
    setNoteForm({
      noteType: 'PROGRESS_NOTE',
      chiefComplaint: '',
      historyOfPresentIllness: '',
      pastMedicalHistory: '',
      surgicalHistory: '',
      familySocialHistory: '',
      reviewOfSystems: '',
      physicalExamination: '',
      assessment: '',
      plan: '',
      followUpInstructions: ''
    });
  };

  // Live BMI calculation
  const calculatedBmi = (() => {
    const h = parseFloat(vitalsBatch.heightCm);
    const w = parseFloat(vitalsBatch.weightKg);
    if (!isNaN(h) && !isNaN(w) && h > 30 && w > 1) {
      const hM = h / 100;
      const bmi = w / (hM * hM);
      return bmi.toFixed(1);
    }
    return null;
  })();

  // Handle Save Note (Draft or Update Draft)
  const handleSaveNote = async () => {
    if (!targetEncounterId) return;
    setSavingNote(true);
    setNoteError(null);
    setNoteSuccess(null);

    try {
      if (selectedNote && selectedNote.id) {
        // Updating existing draft
        const res = await api.v1UpdateDraftNote(selectedNote.id, {
          expectedVersion: selectedNote.version,
          ...noteForm
        });
        setNoteSuccess('Clinical note draft updated successfully.');
        setSelectedNote(res.note);
      } else {
        // Creating new draft note
        const res = await api.v1CreateEncounterNote(targetEncounterId, noteForm);
        setNoteSuccess('New clinical note draft created.');
        setSelectedNote(res.note);
      }

      // Refresh notes list
      const notesRes = await api.v1GetEncounterNotes(targetEncounterId);
      setNotes(notesRes.notes || []);
      setIsEditingNote(false);
    } catch (err: any) {
      setNoteError(err?.message || 'Failed to save note.');
    } finally {
      setSavingNote(false);
    }
  };

  // Handle Sign Note
  const handleSignNote = async () => {
    if (!selectedNote) return;
    try {
      const res = await api.v1SignClinicalNote(selectedNote.id);
      setSelectedNote(res.note);
      setShowSignModal(false);
      setNoteSuccess('Clinical note successfully signed and locked.');
      // Refresh list
      const notesRes = await api.v1GetEncounterNotes(targetEncounterId!);
      setNotes(notesRes.notes || []);
    } catch (err: any) {
      setNoteError(err?.message || 'Failed to sign note.');
    }
  };

  // Handle Amend Note
  const handleAmendNote = async () => {
    if (!selectedNote || !amendmentReason.trim()) return;
    try {
      const res = await api.v1AmendClinicalNote(selectedNote.id, {
        amendmentReason,
        ...noteForm
      });
      setSelectedNote(res.note);
      setShowAmendModal(false);
      setAmendmentReason('');
      setNoteSuccess('Clinical note successfully amended with updated version.');
      const notesRes = await api.v1GetEncounterNotes(targetEncounterId!);
      setNotes(notesRes.notes || []);
      setIsEditingNote(false);
    } catch (err: any) {
      setNoteError(err?.message || 'Failed to amend note.');
    }
  };

  // View Version History
  const handleViewVersionHistory = async () => {
    if (!selectedNote) return;
    try {
      const res = await api.v1GetNoteVersions(selectedNote.id);
      setVersionHistory(res.versions || []);
      setShowVersionHistoryModal(true);
    } catch {
      setVersionHistory([]);
    }
  };

  // Handle Status Transitions
  const handleStartEncounter = async () => {
    if (!targetEncounterId) return;
    try {
      const res = await api.v1StartEncounter(targetEncounterId);
      setEncounterData(prev => prev ? { ...prev, encounter: res.encounter } : null);
    } catch (err: any) {
      setWorkspaceError(err?.message || 'Failed to start encounter.');
    }
  };

  const handleCompleteEncounter = async () => {
    if (!targetEncounterId) return;
    try {
      const res = await api.v1CompleteEncounter(targetEncounterId);
      setEncounterData(prev => prev ? { ...prev, encounter: res.encounter } : null);
    } catch (err: any) {
      setWorkspaceError(err?.message || 'Failed to complete encounter.');
    }
  };

  const handleCancelEncounter = async () => {
    if (!targetEncounterId) return;
    try {
      const res = await api.v1CancelEncounter(targetEncounterId, cancelReason);
      setEncounterData(prev => prev ? { ...prev, encounter: res.encounter } : null);
      setShowCancelModal(false);
    } catch (err: any) {
      setWorkspaceError(err?.message || 'Failed to cancel encounter.');
    }
  };

  // Handle Batch Vitals Submission
  const handleSaveVitalsBatch = async () => {
    if (!targetEncounterId) return;
    setSavingVitals(true);
    try {
      const promises: Promise<any>[] = [];

      if (vitalsBatch.systolicBp) {
        promises.push(api.v1RecordObservation(targetEncounterId, {
          observationType: 'BLOOD_PRESSURE_SYSTOLIC',
          numericValue: parseFloat(vitalsBatch.systolicBp),
          unit: 'mmHg'
        }));
      }
      if (vitalsBatch.diastolicBp) {
        promises.push(api.v1RecordObservation(targetEncounterId, {
          observationType: 'BLOOD_PRESSURE_DIASTOLIC',
          numericValue: parseFloat(vitalsBatch.diastolicBp),
          unit: 'mmHg'
        }));
      }
      if (vitalsBatch.heartRate) {
        promises.push(api.v1RecordObservation(targetEncounterId, {
          observationType: 'HEART_RATE',
          numericValue: parseFloat(vitalsBatch.heartRate),
          unit: 'bpm'
        }));
      }
      if (vitalsBatch.respiratoryRate) {
        promises.push(api.v1RecordObservation(targetEncounterId, {
          observationType: 'RESPIRATORY_RATE',
          numericValue: parseFloat(vitalsBatch.respiratoryRate),
          unit: 'breaths/min'
        }));
      }
      if (vitalsBatch.tempC) {
        promises.push(api.v1RecordObservation(targetEncounterId, {
          observationType: 'BODY_TEMPERATURE',
          numericValue: parseFloat(vitalsBatch.tempC),
          unit: 'celsius'
        }));
      }
      if (vitalsBatch.o2Sat) {
        promises.push(api.v1RecordObservation(targetEncounterId, {
          observationType: 'OXYGEN_SATURATION',
          numericValue: parseFloat(vitalsBatch.o2Sat),
          unit: '%'
        }));
      }
      if (vitalsBatch.heightCm) {
        promises.push(api.v1RecordObservation(targetEncounterId, {
          observationType: 'HEIGHT',
          numericValue: parseFloat(vitalsBatch.heightCm),
          unit: 'cm'
        }));
      }
      if (vitalsBatch.weightKg) {
        promises.push(api.v1RecordObservation(targetEncounterId, {
          observationType: 'WEIGHT',
          numericValue: parseFloat(vitalsBatch.weightKg),
          unit: 'kg'
        }));
      }
      if (calculatedBmi) {
        promises.push(api.v1RecordObservation(targetEncounterId, {
          observationType: 'BMI',
          numericValue: parseFloat(calculatedBmi),
          unit: 'kg/m2'
        }));
      }
      if (vitalsBatch.painScore) {
        promises.push(api.v1RecordObservation(targetEncounterId, {
          observationType: 'PAIN_SCORE',
          numericValue: parseFloat(vitalsBatch.painScore),
          unit: 'scale_0_10'
        }));
      }

      await Promise.all(promises);

      // Reset form & reload observations
      setVitalsBatch({
        systolicBp: '',
        diastolicBp: '',
        heartRate: '',
        respiratoryRate: '',
        tempC: '',
        o2Sat: '',
        heightCm: '',
        weightKg: '',
        painScore: ''
      });

      const obsRes = await api.v1GetEncounterObservations(targetEncounterId);
      setObservations(obsRes.observations || []);
    } catch (err: any) {
      alert(`Validation Error: ${err?.message || 'Failed to save vital signs.'}`);
    } finally {
      setSavingVitals(false);
    }
  };

  // Phase 9: Diagnosis Handlers
  const searchDiagTerminology = async (q: string) => {
    setDiagTerminologyQuery(q);
    if (!q || q.trim().length < 2) {
      setDiagTerminologyResults([]);
      return;
    }
    try {
      const res = await api.v1SearchTerminology('ICD-10', q.trim());
      setDiagTerminologyResults(res.concepts || []);
    } catch {
      setDiagTerminologyResults([]);
    }
  };

  const handleSelectDiagConcept = (concept: any) => {
    setDiagForm({
      ...diagForm,
      displayName: concept.display_name,
      diagnosisCode: concept.code,
      terminologySystem: concept.system || 'ICD-10'
    });
    setDiagTerminologyQuery('');
    setDiagTerminologyResults([]);
  };

  const handleRecordDiagnosis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetEncounterId || !diagForm.displayName.trim()) return;

    setDiagSubmitting(true);
    try {
      await api.v1RecordEncounterDiagnosis(targetEncounterId, diagForm);
      setShowAddDiagModal(false);
      setDiagForm({
        displayName: '',
        diagnosisCode: '',
        terminologySystem: 'ICD-10',
        description: '',
        isPrimary: false,
        clinicalStatus: 'ACTIVE',
        onsetDate: ''
      });
      const res = await api.v1GetEncounterDiagnoses(targetEncounterId);
      setDiagnoses(res.diagnoses || []);
    } catch (err: any) {
      alert(`Diagnosis Error: ${err?.message || 'Failed to record encounter diagnosis.'}`);
    } finally {
      setDiagSubmitting(false);
    }
  };

  const handleResolveDiagnosis = async (diagId: string) => {
    if (!targetEncounterId) return;
    try {
      await api.v1ResolveDiagnosis(diagId);
      const res = await api.v1GetEncounterDiagnoses(targetEncounterId);
      setDiagnoses(res.diagnoses || []);
    } catch (err: any) {
      alert(`Error resolving diagnosis: ${err?.message || 'Failed'}`);
    }
  };

  const handlePromoteToProblemList = async (diag: any) => {
    if (!encounterData?.encounter?.patient_id || !targetEncounterId) return;
    try {
      await api.v1AddPatientProblem(encounterData.encounter.patient_id, {
        problemName: diag.display_name,
        code: diag.diagnosis_code,
        terminologySystem: diag.terminology_system || 'ICD-10',
        status: 'ACTIVE',
        onsetDate: diag.onset_date || diag.diagnosed_date,
        encounterId: targetEncounterId
      });
      alert(`Successfully added "${diag.display_name}" to patient's longitudinal problem list.`);
    } catch (err: any) {
      alert(`Error adding to problem list: ${err?.message || 'Failed'}`);
    }
  };

  // Phase 9: Follow-Up Handlers
  const handleRecordFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetEncounterId || !followUpForm.instructions.trim()) return;

    setFollowUpSubmitting(true);
    try {
      await api.v1RecordFollowUp(targetEncounterId, followUpForm);
      setShowAddFollowUpModal(false);
      setFollowUpForm({
        timeframe: '2-3 weeks',
        reassessmentDate: '',
        instructions: '',
        warningSigns: '',
        isPatientFacing: true
      });
      const res = await api.v1GetEncounterFollowUp(targetEncounterId);
      setFollowUps(res.followUps || []);
    } catch (err: any) {
      alert(`Follow-Up Error: ${err?.message || 'Failed to record follow-up instructions.'}`);
    } finally {
      setFollowUpSubmitting(false);
    }
  };

  // Phase 9: Alert Review Handlers
  const handleReviewAlert = async () => {
    if (!alertToReview || !targetEncounterId) return;

    setReviewSubmitting(true);
    try {
      await api.v1ReviewClinicalAlert(alertToReview.id, {
        reviewStatus: reviewAlertStatus,
        reviewNotes: reviewAlertNotes
      });
      setAlertToReview(null);
      setReviewAlertNotes('');
      const res = await api.v1GetClinicalAlerts({ encounterId: targetEncounterId });
      setClinicalAlerts(res.alerts || []);
    } catch (err: any) {
      alert(`Alert Review Error: ${err?.message || 'Failed to review alert.'}`);
    } finally {
      setReviewSubmitting(false);
    }
  };

  // Handle Create Encounter
  const handleCreateEncounter = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingEncounter(true);
    setCreateError(null);

    try {
      const res = await api.v1CreateEncounter(newEncForm);
      onNavigate(`/app/encounters/${res.encounter.id}`);
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to create encounter.');
      setCreatingEncounter(false);
    }
  };

  // ==========================================
  // VIEW 1: CREATE ENCOUNTER (/app/encounters/new)
  // ==========================================
  if (isNewRoute) {
    return (
      <div className="cl-ui-page space-y-6">
        <div>
          <button
            onClick={() => onNavigate('/app/encounters')}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Encounters Roster</span>
          </button>
          <h1 className="text-xl font-bold text-slate-900">Initiate Clinical Encounter</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Create an encounter to document patient interactions, clinical notes, and vital signs in {activeOrganization?.name}.
          </p>
        </div>

        {createError && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2.5 text-xs text-rose-800">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{createError}</span>
          </div>
        )}

        <form onSubmit={handleCreateEncounter} className="p-6 bg-white border border-slate-200 rounded-xl shadow-xs space-y-4 text-xs">
          <div>
            <label className="font-semibold text-slate-700 block mb-1">Select Patient *</label>
            <select
              value={newEncForm.patientId}
              onChange={e => setNewEncForm({ ...newEncForm, patientId: e.target.value })}
              className="w-full p-2.5 border border-slate-300 rounded-lg text-xs"
              required
            >
              <option value="">-- Choose patient --</option>
              {patientsList.map(p => (
                <option key={p.id} value={p.id}>
                  {p.first_name} {p.last_name} ({p.mrn})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Responsible Healthcare Provider *</label>
            <select
              value={newEncForm.providerId}
              onChange={e => setNewEncForm({ ...newEncForm, providerId: e.target.value })}
              className="w-full p-2.5 border border-slate-300 rounded-lg text-xs"
              required
            >
              <option value="">-- Choose provider --</option>
              {providersList.map(pr => (
                <option key={pr.id} value={pr.id}>
                  {pr.display_name || `${pr.title || 'Dr.'} ${pr.first_name} ${pr.last_name}`}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Encounter Type *</label>
              <select
                value={newEncForm.encounterType}
                onChange={e => setNewEncForm({ ...newEncForm, encounterType: e.target.value })}
                className="w-full p-2.5 border border-slate-300 rounded-lg text-xs"
              >
                <option value="IN_PERSON">In-Person Outpatient</option>
                <option value="TELEHEALTH">Telehealth Video Encounter</option>
                <option value="URGENT_CARE">Urgent Care Evaluation</option>
                <option value="FOLLOW_UP">Follow-Up Review</option>
                <option value="HOME_VISIT">Home Healthcare Visit</option>
              </select>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Clinic Timezone</label>
              <input
                type="text"
                value={newEncForm.timezone}
                onChange={e => setNewEncForm({ ...newEncForm, timezone: e.target.value })}
                className="w-full p-2.5 border border-slate-300 rounded-lg text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Reason for Visit / Presenting Concern</label>
            <textarea
              rows={3}
              value={newEncForm.reasonForVisit}
              onChange={e => setNewEncForm({ ...newEncForm, reasonForVisit: e.target.value })}
              placeholder="e.g. Chest tightness on exertion, routine diabetes follow-up..."
              className="w-full p-2.5 border border-slate-300 rounded-lg text-xs"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => onNavigate('/app/encounters')}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creatingEncounter}
              className="px-5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5"
            >
              {creatingEncounter ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <span>Open Clinical Workspace</span>
              )}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ==========================================
  // VIEW 2: ENCOUNTER WORKSPACE (/app/encounters/:encounterId)
  // ==========================================
  if (isWorkspaceRoute) {
    if (workspaceLoading) {
      return (
        <div className="p-8 max-w-6xl mx-auto">
          <div className="p-12 bg-white border border-slate-200 rounded-xl flex items-center justify-center gap-3 text-slate-600 text-xs">
            <div className="w-5 h-5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
            <span>Loading clinical encounter workspace...</span>
          </div>
        </div>
      );
    }

    if (workspaceError || !encounterData) {
      return (
        <div className="p-8 max-w-4xl mx-auto space-y-4">
          <button
            onClick={() => onNavigate('/app/encounters')}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Encounters Roster</span>
          </button>
          <div className="p-8 bg-white border border-rose-200 rounded-xl text-center space-y-2">
            <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
            <div className="text-base font-bold text-slate-900">Encounter Unavailable</div>
            <p className="text-xs text-slate-600">{workspaceError || 'Encounter record not found.'}</p>
          </div>
        </div>
      );
    }

    const { encounter, patient, provider, appointment } = encounterData;

    return (
      <div className="cl-ui-page space-y-6">
        {/* Top Breadcrumb & Status Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 border border-slate-200 rounded-xl shadow-xs">
          <div>
            <button
              onClick={() => onNavigate('/app/encounters')}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 mb-2 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Encounters Roster</span>
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center font-bold">
                <Stethoscope className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold text-slate-900">
                    {encounter.reason_for_visit || 'Clinical Consultation'}
                  </h1>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                    encounter.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                    encounter.status === 'IN_PROGRESS' ? 'bg-blue-50 text-blue-700 border border-blue-200 animate-pulse' :
                    encounter.status === 'CANCELLED' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                    'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}>
                    {encounter.status}
                  </span>
                </div>
                <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                  <span className="font-semibold text-slate-800">
                    {patient ? `${patient.first_name} ${patient.last_name} (${patient.mrn})` : 'Unknown Patient'}
                  </span>
                  <span>•</span>
                  <span>Provider: {provider?.display_name || `${provider?.first_name} ${provider?.last_name}`}</span>
                  <span>•</span>
                  <span>Type: {encounter.encounter_type}</span>
                  {appointment && (
                    <>
                      <span>•</span>
                      <span className="text-teal-700 font-medium">Linked to Appt #{appointment.id.substring(0, 8)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Encounter Lifecycle Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {encounter.status === 'PLANNED' && (
              <button
                onClick={handleStartEncounter}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Start Encounter</span>
              </button>
            )}

            {encounter.status === 'IN_PROGRESS' && (
              <button
                onClick={handleCompleteEncounter}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Complete Encounter</span>
              </button>
            )}

            {(encounter.status === 'PLANNED' || encounter.status === 'IN_PROGRESS') && (
              <button
                onClick={() => setShowCancelModal(true)}
                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition-colors"
              >
                <span>Cancel</span>
              </button>
            )}

            <button
              onClick={() => onNavigate(`/app/patients/${encounter.patient_id}/medical-record`)}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Full Medical Record</span>
            </button>
          </div>
        </div>

        {/* Workspace Subtabs */}
        <div className="border-b border-slate-200 flex gap-6 overflow-x-auto">
          <button
            onClick={() => setActiveWorkspaceTab('NOTES')}
            className={`pb-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
              activeWorkspaceTab === 'NOTES' ? 'border-teal-700 text-teal-800' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Clinical Documentation ({notes.length})</span>
          </button>

          <button
            onClick={() => setActiveWorkspaceTab('VITALS')}
            className={`pb-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
              activeWorkspaceTab === 'VITALS' ? 'border-teal-700 text-teal-800' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <HeartPulse className="w-3.5 h-3.5" />
            <span>Vital Signs & Observations ({observations.length})</span>
          </button>

          <button
            onClick={() => setActiveWorkspaceTab('DIAGNOSES')}
            className={`pb-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
              activeWorkspaceTab === 'DIAGNOSES' ? 'border-teal-700 text-teal-800' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Stethoscope className="w-3.5 h-3.5" />
            <span>Encounter Diagnoses ({diagnoses.length})</span>
          </button>

          <button
            onClick={() => setActiveWorkspaceTab('FOLLOW_UP')}
            className={`pb-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
              activeWorkspaceTab === 'FOLLOW_UP' ? 'border-teal-700 text-teal-800' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Follow-Up Instructions ({followUps.length})</span>
          </button>

          <button
            onClick={() => setActiveWorkspaceTab('ALERTS')}
            className={`pb-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
              activeWorkspaceTab === 'ALERTS' ? 'border-teal-700 text-teal-800' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Decision Support ({clinicalAlerts.length})</span>
          </button>
        </div>

        {/* TAB 1: CLINICAL NOTES WORKSPACE */}
        {activeWorkspaceTab === 'NOTES' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Note selector list (Left 4 cols) */}
            <div className="lg:col-span-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Attached Notes</span>
                <button
                  onClick={resetNoteForm}
                  className="text-xs font-semibold text-teal-700 hover:text-teal-900 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Draft New Note</span>
                </button>
              </div>

              {notes.length === 0 ? (
                <div className="p-6 bg-white border border-slate-200 rounded-xl text-center text-xs text-slate-400">
                  No notes drafted yet. Click above to start documentation.
                </div>
              ) : (
                <div className="space-y-2">
                  {notes.map(n => {
                    const isSelected = selectedNote?.id === n.id;
                    return (
                      <div
                        key={n.id}
                        onClick={() => selectNoteForViewing(n)}
                        className={`p-3.5 rounded-xl border text-xs cursor-pointer transition-all ${
                          isSelected ? 'bg-teal-50/60 border-teal-600 shadow-xs' : 'bg-white border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{n.note_type}</span>
                          <span className={`text-[10px] px-2 py-0.2 rounded font-bold uppercase ${
                            n.status === 'SIGNED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                            n.status === 'AMENDED' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                            'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>
                            {n.status} v{n.version}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 truncate">
                          {n.chief_complaint || n.assessment || 'No summary text'}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">
                          {new Date(n.updated_at || n.created_at).toLocaleString()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Note Editor Surface (Right 8 cols) */}
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl shadow-xs p-6 space-y-5">
              {/* Note Header & Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-900">
                      {selectedNote ? `${selectedNote.note_type} (Version ${selectedNote.version})` : 'New Clinical Note Draft'}
                    </h2>
                    {selectedNote && (
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                        selectedNote.status === 'SIGNED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        selectedNote.status === 'AMENDED' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                        'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {selectedNote.status}
                      </span>
                    )}
                  </div>
                  {selectedNote?.signed_at && (
                    <div className="text-[11px] text-emerald-700 mt-0.5 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Digitally signed on {new Date(selectedNote.signed_at).toLocaleString()}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {selectedNote && (
                    <button
                      onClick={handleViewVersionHistory}
                      className="px-2.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-semibold flex items-center gap-1"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>Versions</span>
                    </button>
                  )}

                  {/* Actions according to note status */}
                  {(!selectedNote || selectedNote.status === 'DRAFT') && (
                    <>
                      <button
                        onClick={handleSaveNote}
                        disabled={savingNote}
                        className="px-3.5 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs flex items-center gap-1"
                      >
                        {savingNote ? 'Saving...' : 'Save Draft'}
                      </button>

                      {selectedNote && (
                        <button
                          onClick={() => setShowSignModal(true)}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs flex items-center gap-1"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Sign Note</span>
                        </button>
                      )}
                    </>
                  )}

                  {selectedNote && (selectedNote.status === 'SIGNED' || selectedNote.status === 'AMENDED') && (
                    <button
                      onClick={() => setShowAmendModal(true)}
                      className="px-3.5 py-1.5 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs flex items-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Amend Signed Note</span>
                    </button>
                  )}
                </div>
              </div>

              {noteSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{noteSuccess}</span>
                </div>
              )}

              {noteError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <span>{noteError}</span>
                </div>
              )}

              {/* Note Input Fields (Disabled if signed and not amending) */}
              <div className="space-y-4 text-xs">
                {selectedNote && selectedNote.status !== 'DRAFT' && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 flex items-center gap-2 text-xs">
                    <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>This clinical note is signed and tamper-protected. To modify or correct findings, use the <strong>Amend Signed Note</strong> workflow to preserve defensible legal history.</span>
                  </div>
                )}

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Chief Complaint / Presenting Concern</label>
                  <input
                    type="text"
                    disabled={selectedNote && selectedNote.status !== 'DRAFT'}
                    value={noteForm.chiefComplaint}
                    onChange={e => setNoteForm({ ...noteForm, chiefComplaint: e.target.value })}
                    placeholder="e.g. Chest tightness, fatigue..."
                    className="w-full p-2.5 border border-slate-300 rounded-lg text-xs disabled:bg-slate-50 disabled:text-slate-600"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">History of Present Illness (HPI)</label>
                  <textarea
                    rows={3}
                    disabled={selectedNote && selectedNote.status !== 'DRAFT'}
                    value={noteForm.historyOfPresentIllness}
                    onChange={e => setNoteForm({ ...noteForm, historyOfPresentIllness: e.target.value })}
                    placeholder="Chronological narrative of presenting illness..."
                    className="w-full p-2.5 border border-slate-300 rounded-lg text-xs disabled:bg-slate-50 disabled:text-slate-600"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Physical Examination Findings</label>
                    <textarea
                      rows={3}
                      disabled={selectedNote && selectedNote.status !== 'DRAFT'}
                      value={noteForm.physicalExamination}
                      onChange={e => setNoteForm({ ...noteForm, physicalExamination: e.target.value })}
                      placeholder="Cardiac, respiratory, abdominal exam..."
                      className="w-full p-2.5 border border-slate-300 rounded-lg text-xs disabled:bg-slate-50 disabled:text-slate-600"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Review of Systems (ROS)</label>
                    <textarea
                      rows={3}
                      disabled={selectedNote && selectedNote.status !== 'DRAFT'}
                      value={noteForm.reviewOfSystems}
                      onChange={e => setNoteForm({ ...noteForm, reviewOfSystems: e.target.value })}
                      placeholder="Positive or pertinent negative findings..."
                      className="w-full p-2.5 border border-slate-300 rounded-lg text-xs disabled:bg-slate-50 disabled:text-slate-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-teal-900 block mb-1">Clinical Assessment *</label>
                  <textarea
                    rows={2}
                    disabled={selectedNote && selectedNote.status !== 'DRAFT'}
                    value={noteForm.assessment}
                    onChange={e => setNoteForm({ ...noteForm, assessment: e.target.value })}
                    placeholder="Clinician differential assessment or primary conclusion..."
                    className="w-full p-2.5 border border-teal-300 bg-teal-50/20 rounded-lg text-xs disabled:bg-slate-50 disabled:text-slate-600"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Plan & Orders *</label>
                  <textarea
                    rows={3}
                    disabled={selectedNote && selectedNote.status !== 'DRAFT'}
                    value={noteForm.plan}
                    onChange={e => setNoteForm({ ...noteForm, plan: e.target.value })}
                    placeholder="Diagnostics ordered, patient education, treatment regimen..."
                    className="w-full p-2.5 border border-slate-300 rounded-lg text-xs disabled:bg-slate-50 disabled:text-slate-600"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Follow-Up Instructions</label>
                  <input
                    type="text"
                    disabled={selectedNote && selectedNote.status !== 'DRAFT'}
                    value={noteForm.followUpInstructions}
                    onChange={e => setNoteForm({ ...noteForm, followUpInstructions: e.target.value })}
                    placeholder="e.g. Return to clinic in 3 weeks, emergency precautions..."
                    className="w-full p-2.5 border border-slate-300 rounded-lg text-xs disabled:bg-slate-50 disabled:text-slate-600"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: VITALS & OBSERVATIONS */}
        {activeWorkspaceTab === 'VITALS' && (
          <div className="space-y-6">
            {/* Quick Record Vitals Card */}
            <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Record Vital Signs</h3>
                  <p className="text-[11px] text-slate-500">Record point-in-time clinical observations with explicit units and automatic range checks.</p>
                </div>
                {calculatedBmi && (
                  <div className="px-3 py-1 bg-teal-50 border border-teal-200 text-teal-800 rounded-lg text-xs font-bold">
                    Calculated BMI: {calculatedBmi} kg/m²
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 text-xs">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Systolic BP (mmHg)</label>
                  <input
                    type="number"
                    value={vitalsBatch.systolicBp}
                    onChange={e => setVitalsBatch({ ...vitalsBatch, systolicBp: e.target.value })}
                    placeholder="120"
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Diastolic BP (mmHg)</label>
                  <input
                    type="number"
                    value={vitalsBatch.diastolicBp}
                    onChange={e => setVitalsBatch({ ...vitalsBatch, diastolicBp: e.target.value })}
                    placeholder="80"
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Heart Rate (bpm)</label>
                  <input
                    type="number"
                    value={vitalsBatch.heartRate}
                    onChange={e => setVitalsBatch({ ...vitalsBatch, heartRate: e.target.value })}
                    placeholder="72"
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">O₂ Saturation (%)</label>
                  <input
                    type="number"
                    value={vitalsBatch.o2Sat}
                    onChange={e => setVitalsBatch({ ...vitalsBatch, o2Sat: e.target.value })}
                    placeholder="98"
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Body Temp (°C)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={vitalsBatch.tempC}
                    onChange={e => setVitalsBatch({ ...vitalsBatch, tempC: e.target.value })}
                    placeholder="36.8"
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Resp Rate (/min)</label>
                  <input
                    type="number"
                    value={vitalsBatch.respiratoryRate}
                    onChange={e => setVitalsBatch({ ...vitalsBatch, respiratoryRate: e.target.value })}
                    placeholder="16"
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Height (cm)</label>
                  <input
                    type="number"
                    value={vitalsBatch.heightCm}
                    onChange={e => setVitalsBatch({ ...vitalsBatch, heightCm: e.target.value })}
                    placeholder="175"
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Weight (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={vitalsBatch.weightKg}
                    onChange={e => setVitalsBatch({ ...vitalsBatch, weightKg: e.target.value })}
                    placeholder="70"
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Pain Score (0-10)</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={vitalsBatch.painScore}
                    onChange={e => setVitalsBatch({ ...vitalsBatch, painScore: e.target.value })}
                    placeholder="0"
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    onClick={handleSaveVitalsBatch}
                    disabled={savingVitals}
                    className="w-full py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1 shadow-xs"
                  >
                    {savingVitals ? 'Saving...' : 'Record Vitals'}
                  </button>
                </div>
              </div>
            </div>

            {/* Observations History Table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <div className="p-4 border-b border-slate-100 font-bold text-xs text-slate-800 uppercase tracking-wider">
                Encounter Observations History ({observations.length})
              </div>
              {observations.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No vital signs recorded for this encounter yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
                      <tr>
                        <th className="px-4 py-3">Observation Type</th>
                        <th className="px-4 py-3">Value</th>
                        <th className="px-4 py-3">Unit</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Recorded Timestamp</th>
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: ENCOUNTER DIAGNOSES WORKSPACE */}
        {activeWorkspaceTab === 'DIAGNOSES' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Stethoscope className="w-4 h-4 text-teal-700" />
                  <span>Encounter Diagnoses ({diagnoses.length})</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Record structured primary and secondary diagnoses associated with this encounter visit.
                </p>
              </div>

              {hasPermission('diagnosis.record') && (
                <button
                  onClick={() => setShowAddDiagModal(true)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Record Diagnosis</span>
                </button>
              )}
            </div>

            {diagnoses.length === 0 ? (
              <div className="bg-white p-12 text-center rounded-xl border border-slate-200 shadow-xs space-y-2">
                <Stethoscope className="w-10 h-10 text-slate-300 mx-auto" />
                <h4 className="text-xs font-bold text-slate-800">No Diagnoses Recorded</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  No structured primary or secondary diagnoses have been recorded for this clinical visit yet.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
                    <tr>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Diagnosis & Code</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Onset / Diagnosed</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {diagnoses.map(diag => (
                      <tr key={diag.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          {diag.is_primary ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-teal-100 text-teal-800 border border-teal-200">
                              Primary
                            </span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-slate-100 text-slate-600">
                              Secondary
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          <div>{diag.display_name}</div>
                          {diag.diagnosis_code && (
                            <div className="text-[10px] text-teal-700 font-mono mt-0.5">
                              {diag.terminology_system || 'ICD-10'}: {diag.diagnosis_code}
                            </div>
                          )}
                          {diag.description && (
                            <div className="text-[11px] text-slate-500 font-normal mt-1">
                              {diag.description}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600 font-mono text-[11px]">
                          {diag.diagnosis_type || 'PRIMARY'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                            diag.clinical_status === 'ACTIVE'
                              ? 'bg-teal-50 text-teal-700 border border-teal-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {diag.clinical_status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-[11px]">
                          <div>Diagnosed: {diag.diagnosed_date}</div>
                          {diag.onset_date && <div className="text-[10px] text-slate-400">Onset: {diag.onset_date}</div>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {diag.clinical_status === 'ACTIVE' && hasPermission('diagnosis.resolve') && (
                              <button
                                onClick={() => handleResolveDiagnosis(diag.id)}
                                className="px-2 py-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
                              >
                                Resolve
                              </button>
                            )}

                            {hasPermission('problem_list.manage') && (
                              <button
                                onClick={() => handlePromoteToProblemList(diag)}
                                className="px-2 py-1 text-[11px] font-semibold text-teal-700 hover:bg-teal-50 rounded"
                                title="Promote to longitudinal problem list"
                              >
                                Add to Problem List
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: FOLLOW-UP INSTRUCTIONS WORKSPACE */}
        {activeWorkspaceTab === 'FOLLOW_UP' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-teal-700" />
                  <span>Clinician Follow-Up Instructions ({followUps.length})</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Document reassessment timelines, patient-facing directives, and critical warning signs.
                </p>
              </div>

              {hasPermission('follow_up.manage') && (
                <button
                  onClick={() => setShowAddFollowUpModal(true)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Record Instructions</span>
                </button>
              )}
            </div>

            {followUps.length === 0 ? (
              <div className="bg-white p-12 text-center rounded-xl border border-slate-200 shadow-xs space-y-2">
                <Clock className="w-10 h-10 text-slate-300 mx-auto" />
                <h4 className="text-xs font-bold text-slate-800">No Follow-Up Instructions Recorded</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  No post-encounter follow-up instructions or warning signs have been entered for this visit.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {followUps.map(fup => (
                  <div key={fup.id} className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-3 text-xs">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">
                          Timeframe: {fup.timeframe || 'Not specified'}
                        </span>
                        {fup.reassessment_date && (
                          <span className="text-slate-500">
                            • Target Reassessment: <strong>{fup.reassessment_date}</strong>
                          </span>
                        )}
                      </div>

                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        fup.is_patient_facing
                          ? 'bg-teal-50 text-teal-800 border border-teal-200'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {fup.is_patient_facing ? 'Patient Facing' : 'Internal Clinician Guidance'}
                      </span>
                    </div>

                    <div>
                      <span className="font-semibold text-slate-700 block mb-1">Instructions:</span>
                      <p className="text-slate-800 whitespace-pre-line bg-slate-50 p-3 rounded-lg border border-slate-100">
                        {fup.instructions}
                      </p>
                    </div>

                    {fup.warning_signs && (
                      <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-amber-900">
                        <strong className="block text-amber-800 mb-0.5 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                          <span>Emergency Warning Signs & Precautions:</span>
                        </strong>
                        <p className="text-xs text-amber-900">{fup.warning_signs}</p>
                      </div>
                    )}

                    <div className="text-[10px] text-slate-400 pt-1">
                      Recorded on {new Date(fup.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: CLINICAL DECISION SUPPORT ALERTS */}
        {activeWorkspaceTab === 'ALERTS' && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-teal-700" />
                <span>Clinical Decision Support ({clinicalAlerts.length})</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Evaluated clinical decision-support alerts for this encounter. All recommendations are clinician-governed and safety-checked.
              </p>
            </div>

            {clinicalAlerts.length === 0 ? (
              <div className="bg-white p-12 text-center rounded-xl border border-slate-200 shadow-xs space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <h4 className="text-xs font-bold text-slate-800">No Clinical Alerts</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  No active safety alerts or protocol warnings were triggered for this patient visit.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {clinicalAlerts.map(alert => (
                  <div key={alert.id} className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-3 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            alert.severity === 'CRITICAL'
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : alert.severity === 'WARNING'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                          }`}>
                            {alert.severity}
                          </span>
                          <span className="font-bold text-slate-900">{alert.explanation}</span>
                        </div>

                        {alert.trigger_context && (
                          <p className="text-slate-600 text-[11px]">
                            <strong>Context:</strong> {alert.trigger_context}
                          </p>
                        )}
                      </div>

                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider shrink-0 ${
                        alert.review_status === 'ACKNOWLEDGED' || alert.review_status === 'ACTION_TAKEN'
                          ? 'bg-teal-50 text-teal-800 border border-teal-200'
                          : alert.review_status === 'DISMISSED'
                          ? 'bg-slate-100 text-slate-600'
                          : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}>
                        {alert.review_status}
                      </span>
                    </div>

                    {alert.review_notes && (
                      <div className="p-2.5 bg-slate-50 rounded border border-slate-100 text-slate-700">
                        <strong className="text-slate-800 block text-[11px]">Clinician Review Note:</strong>
                        <p className="text-xs mt-0.5">{alert.review_notes}</p>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[10px] text-slate-400">
                      <span>Evaluated: {new Date(alert.created_at).toLocaleString()}</span>

                      {hasPermission('clinical_alert.review') && alert.review_status === 'PENDING' && (
                        <button
                          onClick={() => {
                            setAlertToReview(alert);
                            setReviewAlertStatus('ACKNOWLEDGED');
                            setReviewAlertNotes('');
                          }}
                          className="px-2.5 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-50 rounded transition-colors"
                        >
                          Review & Acknowledge
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* MODAL 1: ELECTRONIC SIGN NOTE CONFIRMATION */}
        {showSignModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4 text-xs">
              <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div className="text-center space-y-1">
                <h3 className="text-base font-bold text-slate-900">Sign & Lock Clinical Note</h3>
                <p className="text-xs text-slate-600">
                  By signing this document, you certify that the recorded findings, assessment, and care plan are accurate.
                </p>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs">
                <strong>Legal & Clinical Notice:</strong> Signed clinical notes cannot be directly overwritten or deleted. Any subsequent modifications will require an audited clinical amendment.
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowSignModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSignNote}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Confirm Electronic Signature</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 2: AMEND SIGNED NOTE */}
        {showAmendModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-purple-700" />
                  <h3 className="text-sm font-bold text-slate-900">Record Clinical Amendment (Version {selectedNote?.version + 1})</h3>
                </div>
                <button onClick={() => setShowAmendModal(false)} className="text-slate-400 hover:text-slate-600">
                  <XCircle className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-slate-600">
                You are amending a finalized note. An immutable version snapshot of version {selectedNote?.version} will be preserved in the audit log.
              </p>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Clinical Justification for Amendment *</label>
                <textarea
                  rows={3}
                  value={amendmentReason}
                  onChange={e => setAmendmentReason(e.target.value)}
                  placeholder="e.g. Added collateral history from family member; corrected typographical error in dosage..."
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-xs"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowAmendModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAmendNote}
                  disabled={!amendmentReason.trim()}
                  className="px-4 py-2 bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs"
                >
                  Apply Amendment & Save v{selectedNote?.version + 1}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 3: VERSION HISTORY AUDIT TRAIL */}
        {showVersionHistoryModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-xl max-w-xl w-full p-6 shadow-xl border border-slate-200 space-y-4 text-xs max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-teal-700" />
                  <h3 className="text-sm font-bold text-slate-900">Document Version & Amendment Trail</h3>
                </div>
                <button onClick={() => setShowVersionHistoryModal(false)} className="text-slate-400 hover:text-slate-600">
                  <XCircle className="w-4 h-4" />
                </button>
              </div>

              <div className="overflow-y-auto flex-1 space-y-3 pr-1">
                {versionHistory.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    No historical archived versions recorded yet. This is version 1.
                  </div>
                ) : (
                  versionHistory.map(v => (
                    <div key={v.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                      <div className="flex items-center justify-between font-bold text-slate-900">
                        <span>Version {v.version_number} ({v.status})</span>
                        <span className="text-[10px] text-slate-500 font-normal">
                          {new Date(v.created_at).toLocaleString()}
                        </span>
                      </div>
                      {v.amendment_reason && (
                        <div className="text-[11px] text-purple-900 bg-purple-50 p-2 rounded border border-purple-200">
                          <strong>Amendment Reason: </strong>{v.amendment_reason}
                        </div>
                      )}
                      {v.signed_at && (
                        <div className="text-[11px] text-emerald-700 flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" />
                          <span>Signed on {new Date(v.signed_at).toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setShowVersionHistoryModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 4: CANCEL ENCOUNTER */}
        {showCancelModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4 text-xs">
              <div className="flex items-center gap-2 text-rose-700 font-bold text-sm">
                <AlertTriangle className="w-4 h-4" />
                <span>Cancel Clinical Encounter</span>
              </div>
              <p className="text-slate-600 text-xs">
                Please supply a cancellation reason. The cancellation will be logged in the permanent audit trail.
              </p>
              <textarea
                rows={3}
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="Reason for cancellation..."
                className="w-full p-2.5 border border-slate-300 rounded-lg text-xs"
              />
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowCancelModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50"
                >
                  Abort
                </button>
                <button
                  onClick={handleCancelEncounter}
                  className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-xs font-semibold shadow-xs"
                >
                  Confirm Cancellation
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 5: RECORD ENCOUNTER DIAGNOSIS */}
        {showAddDiagModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-teal-700" />
                  <h3 className="text-sm font-bold text-slate-900">Record Encounter Diagnosis</h3>
                </div>
                <button onClick={() => setShowAddDiagModal(false)} className="text-slate-400 hover:text-slate-600">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleRecordDiagnosis} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Search Standard Terminology (ICD-10)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Type to search ICD-10 concepts (e.g. hypertension, palpitations)..."
                      value={diagTerminologyQuery}
                      onChange={e => searchDiagTerminology(e.target.value)}
                      className="w-full text-xs px-3 py-2 pl-8 border border-slate-300 rounded-lg"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  </div>

                  {diagTerminologyResults.length > 0 && (
                    <div className="mt-1 border border-slate-200 rounded-lg bg-white shadow-xs max-h-36 overflow-y-auto divide-y divide-slate-100">
                      {diagTerminologyResults.map(item => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleSelectDiagConcept(item)}
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
                    Diagnosis Display Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Essential (primary) hypertension"
                    value={diagForm.displayName}
                    onChange={e => setDiagForm({ ...diagForm, displayName: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Diagnosis Code</label>
                    <input
                      type="text"
                      placeholder="e.g. I10"
                      value={diagForm.diagnosisCode}
                      onChange={e => setDiagForm({ ...diagForm, diagnosisCode: e.target.value })}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Onset Date</label>
                    <input
                      type="date"
                      value={diagForm.onsetDate}
                      onChange={e => setDiagForm({ ...diagForm, onsetDate: e.target.value })}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Clinical Clarification / Notes
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Context, severity, or clinician assessment notes..."
                    value={diagForm.description}
                    onChange={e => setDiagForm({ ...diagForm, description: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="isPrimaryDiag"
                    checked={diagForm.isPrimary}
                    onChange={e => setDiagForm({ ...diagForm, isPrimary: e.target.checked })}
                    className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <label htmlFor="isPrimaryDiag" className="text-xs font-semibold text-slate-800">
                    Designate as Primary Encounter Diagnosis
                  </label>
                </div>

                <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowAddDiagModal(false)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={diagSubmitting}
                    className="px-4 py-1.5 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-xs"
                  >
                    {diagSubmitting ? 'Recording...' : 'Record Diagnosis'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 6: RECORD FOLLOW-UP INSTRUCTIONS */}
        {showAddFollowUpModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-teal-700" />
                  <h3 className="text-sm font-bold text-slate-900">Record Follow-Up Instructions</h3>
                </div>
                <button onClick={() => setShowAddFollowUpModal(false)} className="text-slate-400 hover:text-slate-600">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleRecordFollowUp} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Timeframe
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 2-3 weeks, 1 month, PRN"
                      value={followUpForm.timeframe}
                      onChange={e => setFollowUpForm({ ...followUpForm, timeframe: e.target.value })}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Target Reassessment Date
                    </label>
                    <input
                      type="date"
                      value={followUpForm.reassessmentDate}
                      onChange={e => setFollowUpForm({ ...followUpForm, reassessmentDate: e.target.value })}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Instructions & Recommendations *
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Instructions for arranging subsequent visit, self-care, or medication continuation..."
                    value={followUpForm.instructions}
                    onChange={e => setFollowUpForm({ ...followUpForm, instructions: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Emergency Warning Signs & Precautions
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Symptoms warranting emergency medical review (e.g. chest pain, severe shortness of breath)..."
                    value={followUpForm.warningSigns}
                    onChange={e => setFollowUpForm({ ...followUpForm, warningSigns: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="isPatientFacing"
                    checked={followUpForm.isPatientFacing}
                    onChange={e => setFollowUpForm({ ...followUpForm, isPatientFacing: e.target.checked })}
                    className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <label htmlFor="isPatientFacing" className="text-xs font-semibold text-slate-800">
                    Patient-Facing (Eligible for Patient Portal & Direct Instructions)
                  </label>
                </div>

                <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowAddFollowUpModal(false)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={followUpSubmitting}
                    className="px-4 py-1.5 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-xs"
                  >
                    {followUpSubmitting ? 'Saving...' : 'Save Instructions'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 7: REVIEW CLINICAL DECISION SUPPORT ALERT */}
        {alertToReview && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <h3 className="text-sm font-bold text-slate-900">Clinician Alert Review</h3>
                </div>
                <button onClick={() => setAlertToReview(null)} className="text-slate-400 hover:text-slate-600">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-1">
                <span className="font-bold text-slate-800 block">Alert:</span>
                <p className="text-slate-700">{alertToReview.explanation}</p>
                {alertToReview.trigger_context && (
                  <p className="text-[11px] text-slate-500 mt-1">Context: {alertToReview.trigger_context}</p>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Review Decision *</label>
                  <select
                    value={reviewAlertStatus}
                    onChange={e => setReviewAlertStatus(e.target.value as any)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="ACKNOWLEDGED">Acknowledge & Confirm</option>
                    <option value="ACTION_TAKEN">Action Taken in Care Plan</option>
                    <option value="DISMISSED">Dismiss (Clinically Non-Applicable)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Clinician Review Notes</label>
                  <textarea
                    rows={3}
                    placeholder="Document clinical rationale or actions initiated..."
                    value={reviewAlertNotes}
                    onChange={e => setReviewAlertNotes(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAlertToReview(null)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleReviewAlert}
                  disabled={reviewSubmitting}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-xs"
                >
                  {reviewSubmitting ? 'Recording...' : 'Save Alert Review'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // VIEW 3: ENCOUNTERS ROSTER (/app/encounters)
  // ==========================================
  return (
    <div className="cl-ui-page space-y-6">
      {/* Roster Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Clinical Encounters</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage patient encounters, clinical documentation, observations, and status lifecycles in {activeOrganization?.name}.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('/app/encounters/new')}
            className="px-3.5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Clinical Encounter</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 overflow-x-auto text-xs">
        {['ALL', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map(st => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
              statusFilter === st
                ? 'bg-teal-700 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {st.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Encounters List */}
      {loading ? (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-xl flex items-center justify-center gap-2 text-xs text-slate-500">
          <div className="w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
          <span>Loading encounters...</span>
        </div>
      ) : encounters.length === 0 ? (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-xl space-y-3">
          <Stethoscope className="w-8 h-8 text-slate-400 mx-auto" />
          <div className="text-sm font-semibold text-slate-800">No Encounters Found</div>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {statusFilter !== 'ALL'
              ? `No encounters match status ${statusFilter}.`
              : 'There are no clinical encounters recorded in this organization.'}
          </p>
          <button
            onClick={() => onNavigate('/app/encounters/new')}
            className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold shadow-xs inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Initiate Encounter</span>
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
                <tr>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Reason for Visit</th>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {encounters.map(enc => (
                  <tr
                    key={enc.id}
                    onClick={() => onNavigate(`/app/encounters/${enc.id}`)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      <div>
                        {enc.patient_first_name} {enc.patient_last_name}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {enc.patient_mrn}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800 max-w-xs truncate">
                      {enc.reason_for_visit || 'Clinical Consultation'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {enc.provider_display_name || `${enc.provider_title || 'Dr.'} ${enc.provider_last_name}`}
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-mono text-[11px]">
                      {enc.encounter_type}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                        enc.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        enc.status === 'IN_PROGRESS' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                        enc.status === 'CANCELLED' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                        'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {enc.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-[11px]">
                      {new Date(enc.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigate(`/app/encounters/${enc.id}`);
                        }}
                        className="px-2.5 py-1 text-teal-700 hover:bg-teal-50 rounded text-xs font-semibold"
                      >
                        Open Workspace
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
  );
};
