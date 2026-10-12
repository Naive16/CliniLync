/**
 * CLINILYNC Patient Medications, Allergies & Prescriptions View
 * 
 * Complies with Phase 10 Requirements:
 * - Longitudinal Medication History & Discontinuation with Clinical Rationale.
 * - Documented Allergies & Adverse Reactions with Criticality & Severity.
 * - Electronic Prescription (e-Rx) Authoring, Cryptographic Signing & Dispensing.
 * - Real-Time Clinical Safety Check with Mandatory Override Justification.
 * - Pharmacy Registry Fulfillment & Defensible Replacement Workflows.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../api/client.js';
import {
  Pill,
  AlertTriangle,
  Plus,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ArrowLeft,
  Search,
  Building2,
  Lock,
  RefreshCw,
  X,
  FileCheck,
  AlertCircle,
  FileText,
  BadgeAlert,
  Send,
  Sparkles,
  ChevronRight
} from 'lucide-react';

interface PatientMedicationsViewProps {
  patientId: string;
  onNavigate: (path: string) => void;
}

export const PatientMedicationsView: React.FC<PatientMedicationsViewProps> = ({
  patientId,
  onNavigate
}) => {
  const { user, hasPermission, activeOrganization } = useAuth();

  const [patient, setPatient] = useState<any>(null);
  const [medications, setMedications] = useState<any[]>([]);
  const [allergies, setAllergies] = useState<any[]>([]);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [pharmacies, setPharmacies] = useState<any[]>([]);
  const [catalogItems, setCatalogItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tabs
  const [activeTab, setActiveTab] = useState<'PRESCRIPTIONS' | 'MEDICATIONS' | 'ALLERGIES' | 'RECONCILIATION'>('PRESCRIPTIONS');

  // Modals
  const [showNewRxModal, setShowNewRxModal] = useState(false);
  const [showAddAllergyModal, setShowAddAllergyModal] = useState(false);
  const [showAddMedModal, setShowAddMedModal] = useState(false);
  const [showDiscontinueModal, setShowDiscontinueModal] = useState<string | null>(null);
  const [showCancelRxModal, setShowCancelRxModal] = useState<string | null>(null);
  const [showDispenseModal, setShowDispenseModal] = useState<any | null>(null);
  const [showReconcileModal, setShowReconcileModal] = useState(false);

  // Form states
  const [discontinueReason, setDiscontinueReason] = useState('');
  const [cancelRxReason, setCancelRxReason] = useState('');
  const [dispenseQty, setDispenseQty] = useState<number>(30);
  const [dispensePharmacyId, setDispensePharmacyId] = useState('');
  const [dispenseNotes, setDispenseNotes] = useState('');

  // New Prescription Form
  const [rxForm, setRxForm] = useState({
    medicationName: '',
    dosageForm: 'TABLET',
    doseAmount: '',
    doseUnit: 'mg',
    route: 'ORAL',
    frequency: 'ONCE_DAILY',
    duration: '30 days',
    quantity: 30,
    quantityUnit: 'TABLET',
    refillsAuthorized: 0,
    sigInstructions: '',
    indication: '',
    priority: 'ROUTINE',
    pharmacyId: '',
    overrideReason: ''
  });
  const [rxSafetyAlerts, setRxSafetyAlerts] = useState<any[]>([]);
  const [isSubmittingRx, setIsSubmittingRx] = useState(false);

  // Add Allergy Form
  const [allergyForm, setAllergyForm] = useState({
    substanceName: '',
    allergenType: 'MEDICATION',
    reactionDescription: '',
    severity: 'MODERATE',
    verificationStatus: 'CONFIRMED',
    clinicalStatus: 'ACTIVE',
    notes: ''
  });

  // Add Medication Form
  const [medForm, setMedForm] = useState({
    medicationName: '',
    dosage: '',
    route: 'ORAL',
    frequency: 'ONCE_DAILY',
    sigInstructions: '',
    startDate: new Date().toISOString().split('T')[0]
  });

  // Reconcile Form
  const [reconcileNotes, setReconcileNotes] = useState('Routine clinical reconciliation performed. Verified active medication regimens.');
  const [discrepancyCount, setDiscrepancyCount] = useState(0);

  // Load all patient medical data
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load patient
      const patRes = await api.getPatient(patientId);
      setPatient(patRes.patient);

      // Load medications
      const medsRes = await api.v1GetPatientMedications(patientId);
      setMedications(medsRes || []);

      // Load allergies
      const allergiesRes = await api.v1GetPatientAllergies(patientId);
      setAllergies(allergiesRes || []);

      // Load prescriptions
      const rxRes = await api.v1GetPrescriptions({ patientId });
      setPrescriptions(rxRes || []);

      // Load pharmacies
      const pharmRes = await api.request<any[]>('/api/v1/pharmacies');
      const pharms = pharmRes || [];
      setPharmacies(pharms);
      if (pharms.length > 0 && !rxForm.pharmacyId) {
        setRxForm(prev => ({ ...prev, pharmacyId: pharms[0].id }));
        setDispensePharmacyId(pharms[0].id);
      }

      // Load catalog items for autocomplete
      const catRes = await api.v1GetMedicationCatalog();
      setCatalogItems(catRes || []);
    } catch (err: any) {
      console.error('Failed to load patient medications data:', err);
      setError(err.message || 'Failed to retrieve medication data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [patientId]);

  // Live safety check evaluator when drafting a prescription
  useEffect(() => {
    if (!rxForm.medicationName || rxForm.medicationName.trim().length < 2) {
      setRxSafetyAlerts([]);
      return;
    }

    const medNameLower = rxForm.medicationName.toLowerCase();
    const alerts: any[] = [];

    for (const allergy of allergies) {
      const substanceLower = allergy.substance_name.toLowerCase();
      // Match penicillin family
      if (
        (substanceLower.includes('penicillin') && (medNameLower.includes('amoxicillin') || medNameLower.includes('ampicillin') || medNameLower.includes('penicillin') || medNameLower.includes('augmentin'))) ||
        (substanceLower.includes('sulfa') && (medNameLower.includes('bactrim') || medNameLower.includes('sulfamethoxazole'))) ||
        (medNameLower.includes(substanceLower) || substanceLower.includes(medNameLower))
      ) {
        alerts.push({
          type: 'ALLERGY_CROSS_REACTION',
          severity: allergy.severity || 'CRITICAL',
          substance: allergy.substance_name,
          reaction: allergy.reaction_description,
          message: `Documented Allergy: Patient is allergic to ${allergy.substance_name} (${allergy.severity} severity). Reaction: "${allergy.reaction_description}".`
        });
      }
    }

    setRxSafetyAlerts(alerts);
  }, [rxForm.medicationName, allergies]);

  // Handle Create Prescription
  const handleCreatePrescription = async (signNow: boolean) => {
    try {
      setIsSubmittingRx(true);

      // Verify safety override if alerts exist
      if (rxSafetyAlerts.length > 0 && !rxForm.overrideReason.trim()) {
        alert('A clinical override rationale is mandatory when prescribing a medication with an active allergy warning.');
        setIsSubmittingRx(false);
        return;
      }

      // Determine provider ID (current user provider or fallback)
      const provId = user?.id || 'prov_clinician';

      const draftPayload = {
        patientId,
        providerId: provId,
        priority: rxForm.priority,
        pharmacyId: rxForm.pharmacyId || undefined,
        items: [
          {
            medicationName: rxForm.medicationName,
            dosageForm: rxForm.dosageForm,
            doseAmount: rxForm.doseAmount || '1',
            doseUnit: rxForm.doseUnit,
            route: rxForm.route,
            frequency: rxForm.frequency,
            duration: rxForm.duration,
            quantity: Number(rxForm.quantity) || 30,
            quantityUnit: rxForm.quantityUnit,
            refillsAuthorized: Number(rxForm.refillsAuthorized) || 0,
            sigInstructions: rxForm.sigInstructions || `Take as directed for ${rxForm.indication || 'indicated condition'}`,
            indication: rxForm.indication
          }
        ]
      };

      const res = await api.v1CreatePrescription(draftPayload);
      const createdRx = res.prescription;

      // If override rationale entered, record it
      if (rxSafetyAlerts.length > 0 && rxForm.overrideReason.trim()) {
        await api.request(`/api/v1/prescriptions/${createdRx.id}/safety-override`, {
          method: 'POST',
          body: JSON.stringify({
            patientId,
            alertType: 'ALLERGY_CROSS_REACTION',
            alertDescription: rxSafetyAlerts.map(a => a.message).join(' | '),
            overrideReason: rxForm.overrideReason
          })
        });
      }

      // If user chose to sign immediately
      if (signNow) {
        await api.v1SignPrescription(createdRx.id);
      }

      setShowNewRxModal(false);
      setRxForm({
        medicationName: '',
        dosageForm: 'TABLET',
        doseAmount: '',
        doseUnit: 'mg',
        route: 'ORAL',
        frequency: 'ONCE_DAILY',
        duration: '30 days',
        quantity: 30,
        quantityUnit: 'TABLET',
        refillsAuthorized: 0,
        sigInstructions: '',
        indication: '',
        priority: 'ROUTINE',
        pharmacyId: pharmacies[0]?.id || '',
        overrideReason: ''
      });
      await loadData();
    } catch (err: any) {
      alert(`Error creating prescription: ${err.message || 'Validation failed'}`);
    } finally {
      setIsSubmittingRx(false);
    }
  };

  // Sign an existing draft
  const handleSignPrescription = async (rxId: string) => {
    try {
      await api.v1SignPrescription(rxId);
      await loadData();
    } catch (err: any) {
      alert(`Failed to sign prescription: ${err.message}`);
    }
  };

  // Cancel prescription
  const handleCancelPrescription = async () => {
    if (!showCancelRxModal || !cancelRxReason.trim()) {
      alert('A cancellation reason is required.');
      return;
    }
    try {
      await api.v1CancelPrescription(showCancelRxModal, cancelRxReason);
      setShowCancelRxModal(null);
      setCancelRxReason('');
      await loadData();
    } catch (err: any) {
      alert(`Failed to cancel prescription: ${err.message}`);
    }
  };

  // Dispense prescription
  const handleDispensePrescription = async () => {
    if (!showDispenseModal) return;
    try {
      await api.v1DispensePrescription(showDispenseModal.id, {
        pharmacyId: dispensePharmacyId || pharmacies[0]?.id,
        quantityDispensed: Number(dispenseQty) || 30,
        isComplete: true,
        notes: dispenseNotes || 'Dispensed by hospital pharmacy'
      });
      setShowDispenseModal(null);
      setDispenseNotes('');
      await loadData();
    } catch (err: any) {
      alert(`Dispensation failed: ${err.message}`);
    }
  };

  // Record Allergy
  const handleAddAllergy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allergyForm.substanceName || !allergyForm.reactionDescription) {
      alert('Substance name and reaction description are mandatory.');
      return;
    }
    try {
      await api.v1RecordPatientAllergy(patientId, allergyForm);
      setShowAddAllergyModal(false);
      setAllergyForm({
        substanceName: '',
        allergenType: 'MEDICATION',
        reactionDescription: '',
        severity: 'MODERATE',
        verificationStatus: 'CONFIRMED',
        clinicalStatus: 'ACTIVE',
        notes: ''
      });
      await loadData();
    } catch (err: any) {
      alert(`Failed to record allergy: ${err.message}`);
    }
  };

  // Record Medication
  const handleAddMedication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!medForm.medicationName) {
      alert('Medication name is required.');
      return;
    }
    try {
      await api.v1RecordPatientMedication(patientId, medForm);
      setShowAddMedModal(false);
      setMedForm({
        medicationName: '',
        dosage: '',
        route: 'ORAL',
        frequency: 'ONCE_DAILY',
        sigInstructions: '',
        startDate: new Date().toISOString().split('T')[0]
      });
      await loadData();
    } catch (err: any) {
      alert(`Failed to record medication: ${err.message}`);
    }
  };

  // Discontinue Medication
  const handleDiscontinue = async () => {
    if (!showDiscontinueModal || !discontinueReason.trim()) {
      alert('A clinical rationale for discontinuation is required.');
      return;
    }
    try {
      await api.v1DiscontinueMedication(showDiscontinueModal, discontinueReason);
      setShowDiscontinueModal(null);
      setDiscontinueReason('');
      await loadData();
    } catch (err: any) {
      alert(`Failed to discontinue medication: ${err.message}`);
    }
  };

  // Reconcile Medications
  const handleReconcile = async () => {
    try {
      await api.v1ReconcileMedications(patientId, {
        discrepancyCount: Number(discrepancyCount) || 0,
        notes: reconcileNotes
      });
      setShowReconcileModal(false);
      await loadData();
    } catch (err: any) {
      alert(`Failed to perform medication reconciliation: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-teal-600" />
        <p className="text-sm font-medium">Loading patient medications & pharmacy records...</p>
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-4">
        <button
          onClick={() => onNavigate(`/app/patients/${patientId}/medical-record`)}
          className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Medical Record</span>
        </button>
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm">
          {error || 'Patient not found'}
        </div>
      </div>
    );
  }

  const activeMeds = medications.filter(m => m.status === 'ACTIVE');
  const pastMeds = medications.filter(m => m.status !== 'ACTIVE');

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Navigation & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <button
            onClick={() => onNavigate(`/app/patients/${patientId}/medical-record`)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Patient Medical Record</span>
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-teal-100 text-teal-800 font-bold flex items-center justify-center text-sm shadow-xs">
              <Pill className="w-5 h-5 text-teal-700" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">
                  {patient.first_name} {patient.last_name}
                </h1>
                <span className="font-mono text-xs px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 rounded font-medium">
                  {patient.mrn}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Medications & Pharmacy
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Longitudinal drug regimen, documented allergies, e-prescriptions, and dispensary fulfillment.
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {hasPermission('allergy.manage') && (
            <button
              onClick={() => setShowAddAllergyModal(true)}
              className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
              <span>Document Allergy</span>
            </button>
          )}

          {hasPermission('medication.record') && (
            <button
              onClick={() => setShowAddMedModal(true)}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Record Medication</span>
            </button>
          )}

          {hasPermission('medication.record') && (
            <button
              onClick={() => setShowReconcileModal(true)}
              className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5 text-indigo-700" />
              <span>Reconcile Regimen</span>
            </button>
          )}

          {hasPermission('prescription.create') && (
            <button
              onClick={() => setShowNewRxModal(true)}
              className="px-3.5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Pill className="w-3.5 h-3.5" />
              <span>New Prescription (e-Rx)</span>
            </button>
          )}
        </div>
      </div>

      {/* Allergies Alert Banner (if any active allergies exist) */}
      {allergies.length > 0 ? (
        <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700" />
              <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                Documented Allergies & Adverse Reactions ({allergies.length})
              </span>
            </div>
            <span className="text-[11px] text-amber-800 font-medium">
              Verified clinical alerts enforced during e-prescribing
            </span>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {allergies.map(a => (
              <div
                key={a.id}
                className={`px-2.5 py-1 rounded-md text-xs border font-medium flex items-center gap-1.5 ${
                  a.severity === 'SEVERE'
                    ? 'bg-rose-100 border-rose-300 text-rose-900'
                    : 'bg-amber-100 border-amber-300 text-amber-900'
                }`}
              >
                <span className="font-bold">{a.substance_name}</span>
                <span className="text-[10px] opacity-80">({a.severity})</span>
                <span className="text-[10px] text-slate-600">— {a.reaction_description}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>No known drug allergies currently documented for this patient.</span>
          </div>
          <button
            onClick={() => setShowAddAllergyModal(true)}
            className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 underline"
          >
            Add Allergy Record
          </button>
        </div>
      )}

      {/* Primary Navigation Tabs */}
      <div className="border-b border-slate-200 flex gap-4">
        {[
          { id: 'PRESCRIPTIONS', label: 'Electronic Prescriptions (e-Rx)', count: prescriptions.length },
          { id: 'MEDICATIONS', label: 'Active & Historical Medications', count: medications.length },
          { id: 'ALLERGIES', label: 'Allergy Registry', count: allergies.length },
          { id: 'RECONCILIATION', label: 'Reconciliation Log' }
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

      {/* ========================================================================= */}
      {/* TAB 1: PRESCRIPTIONS (e-Rx) */}
      {/* ========================================================================= */}
      {activeTab === 'PRESCRIPTIONS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800">Electronic Prescription Orders</h2>
            <div className="text-xs text-slate-500">
              Orders carry SHA-256 cryptographic signatures and immutable state transitions.
            </div>
          </div>

          {prescriptions.length === 0 ? (
            <div className="p-12 text-center bg-white border border-slate-200 rounded-xl space-y-3">
              <Pill className="w-8 h-8 text-slate-300 mx-auto" />
              <div className="text-sm font-semibold text-slate-700">No Prescriptions on Record</div>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                No electronic prescription orders have been authored yet for {patient.first_name}.
              </p>
              {hasPermission('prescription.create') && (
                <button
                  onClick={() => setShowNewRxModal(true)}
                  className="px-3.5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Draft First Prescription</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {prescriptions.map(rx => {
                const isSigned = rx.status === 'SIGNED';
                const isDraft = rx.status === 'DRAFT';
                const isDispensed = rx.status === 'DISPENSED' || rx.status === 'PARTIALLY_DISPENSED';
                const isCancelled = rx.status === 'CANCELLED';

                return (
                  <div
                    key={rx.id}
                    className="p-5 bg-white border border-slate-200 rounded-xl shadow-xs space-y-4 hover:border-slate-300 transition-all"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs font-bold text-slate-800">
                          Order #{rx.id.substring(0, 12)}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          rx.status === 'SIGNED'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : rx.status === 'DRAFT'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : rx.status === 'DISPENSED'
                            ? 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}>
                          {rx.status}
                        </span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase ${
                          rx.priority === 'STAT'
                            ? 'bg-rose-100 text-rose-800'
                            : rx.priority === 'URGENT'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {rx.priority || 'ROUTINE'}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span>Created: {new Date(rx.created_at).toLocaleDateString()}</span>
                        {rx.signed_at && (
                          <span className="flex items-center gap-1 text-emerald-700 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Signed {new Date(rx.signed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Prescribed Items */}
                    <div className="space-y-2">
                      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Prescribed Medication Items ({rx.items?.length || 1})
                      </div>
                      <div className="space-y-2">
                        {rx.items && rx.items.length > 0 ? (
                          rx.items.map((item: any) => (
                            <div key={item.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-sm text-slate-900">{item.medication_name}</span>
                                <span className="text-xs text-slate-600 font-medium">
                                  Qty: {item.quantity} {item.quantity_unit} · Refills: {item.refills_authorized}
                                </span>
                              </div>
                              <div className="text-xs text-slate-700 font-mono">
                                SIG: {item.sig_instructions}
                              </div>
                              {item.indication && (
                                <div className="text-[11px] text-slate-500">
                                  Indication: {item.indication}
                                </div>
                              )}
                            </div>
                          ))
                        ) : (
                          <div className="text-xs text-slate-600 font-medium">
                            Standard prescription details linked.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Digital Signature & Integrity Footer */}
                    {rx.signature_hash && (
                      <div className="p-2.5 bg-emerald-50/60 border border-emerald-200/60 rounded-lg flex items-center justify-between text-xs text-emerald-900">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                          <div>
                            <span className="font-bold">Cryptographically Verified (SHA-256): </span>
                            <span className="font-mono text-[10px] text-emerald-800">
                              {rx.signature_hash.substring(0, 24)}...
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] text-emerald-700 font-semibold">
                          Version {rx.version} · Immutable
                        </span>
                      </div>
                    )}

                    {/* Cancellation Rationale if cancelled */}
                    {rx.cancellation_reason && (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900 space-y-0.5">
                        <div className="font-bold">Cancellation Justification:</div>
                        <div>{rx.cancellation_reason}</div>
                      </div>
                    )}

                    {/* Actions Bar */}
                    <div className="flex flex-wrap items-center justify-between pt-2 border-t border-slate-100 gap-2">
                      <div className="text-xs text-slate-400">
                        {rx.pharmacy_name ? `Fulfillment: ${rx.pharmacy_name}` : 'Internal Hospital Dispensary'}
                      </div>

                      <div className="flex items-center gap-2">
                        {isDraft && hasPermission('prescription.sign') && (
                          <button
                            onClick={() => handleSignPrescription(rx.id)}
                            className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md text-xs font-semibold flex items-center gap-1 shadow-xs transition-colors"
                          >
                            <FileCheck className="w-3.5 h-3.5" />
                            <span>Sign & Authorize</span>
                          </button>
                        )}

                        {isSigned && (hasPermission('prescription.dispense') || user?.isSuperAdmin) && (
                          <button
                            onClick={() => {
                              setShowDispenseModal(rx);
                              setDispenseQty(rx.items?.[0]?.quantity || 30);
                            }}
                            className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white rounded-md text-xs font-semibold flex items-center gap-1 shadow-xs transition-colors"
                          >
                            <Building2 className="w-3.5 h-3.5" />
                            <span>Fulfill / Dispense</span>
                          </button>
                        )}

                        {(isDraft || isSigned) && hasPermission('prescription.cancel') && (
                          <button
                            onClick={() => setShowCancelRxModal(rx.id)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Cancel Order</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: MEDICATIONS (Longitudinal Regimen) */}
      {/* ========================================================================= */}
      {activeTab === 'MEDICATIONS' && (
        <div className="space-y-6">
          {/* Active Medications */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span>Active Longitudinal Regimens</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  {activeMeds.length}
                </span>
              </h2>
              {hasPermission('medication.record') && (
                <button
                  onClick={() => setShowAddMedModal(true)}
                  className="text-xs text-teal-700 hover:text-teal-900 font-semibold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Medication Record</span>
                </button>
              )}
            </div>

            {activeMeds.length === 0 ? (
              <div className="p-8 text-center bg-white border border-slate-200 rounded-xl text-xs text-slate-500">
                No active ongoing medications documented.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {activeMeds.map(m => (
                  <div
                    key={m.id}
                    className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs space-y-2 hover:border-slate-300 transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-sm text-slate-900">{m.medication_name}</div>
                        <div className="text-xs text-slate-600 mt-0.5">
                          {m.dosage} · Route: {m.route} · Frequency: {m.frequency}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        ACTIVE
                      </span>
                    </div>

                    {m.sig_instructions && (
                      <div className="text-xs text-slate-700 font-mono bg-slate-50 p-2 rounded border border-slate-100">
                        {m.sig_instructions}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                      <span>Started: {m.start_date || new Date(m.created_at).toLocaleDateString()}</span>
                      {hasPermission('medication.discontinue') && (
                        <button
                          onClick={() => setShowDiscontinueModal(m.id)}
                          className="font-semibold text-rose-600 hover:text-rose-800 transition-colors"
                        >
                          Discontinue
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Discontinued Medications */}
          {pastMeds.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-slate-200">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider">
                Discontinued & Historical Regimens ({pastMeds.length})
              </h2>
              <div className="space-y-2">
                {pastMeds.map(m => (
                  <div
                    key={m.id}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600"
                  >
                    <div>
                      <span className="font-bold text-slate-800">{m.medication_name}</span>
                      <span className="text-slate-500 ml-2">({m.dosage})</span>
                      {m.discontinuation_reason && (
                        <p className="text-[11px] text-slate-500 mt-0.5 italic">
                          Discontinued: "{m.discontinuation_reason}"
                        </p>
                      )}
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-200 text-slate-700 shrink-0">
                      DISCONTINUED
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: ALLERGIES & ADVERSE REACTIONS */}
      {/* ========================================================================= */}
      {activeTab === 'ALLERGIES' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800">Verified Patient Allergies</h2>
            {hasPermission('allergy.manage') && (
              <button
                onClick={() => setShowAddAllergyModal(true)}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Document New Allergy</span>
              </button>
            )}
          </div>

          {allergies.length === 0 ? (
            <div className="p-8 text-center bg-white border border-slate-200 rounded-xl text-xs text-slate-500">
              No known adverse allergies or hypersensitivities on record.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {allergies.map(a => (
                <div
                  key={a.id}
                  className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs space-y-2 hover:border-slate-300 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-sm text-slate-900">{a.substance_name}</div>
                      <div className="text-xs text-slate-500">{a.allergen_type} Allergen</div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      a.severity === 'SEVERE'
                        ? 'bg-rose-100 text-rose-800 border border-rose-200'
                        : 'bg-amber-100 text-amber-800 border border-amber-200'
                    }`}>
                      {a.severity}
                    </span>
                  </div>

                  <div className="text-xs text-slate-700 bg-amber-50/50 p-2.5 rounded border border-amber-100">
                    <span className="font-semibold text-amber-900">Reaction: </span>
                    {a.reaction_description}
                  </div>

                  {a.notes && (
                    <div className="text-[11px] text-slate-500 italic">
                      Notes: {a.notes}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[10px] text-slate-400">
                    <span>Status: {a.verification_status}</span>
                    <span>Documented: {new Date(a.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: RECONCILIATION */}
      {/* ========================================================================= */}
      {activeTab === 'RECONCILIATION' && (
        <div className="space-y-4">
          <div className="p-6 bg-white border border-slate-200 rounded-xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-sm text-slate-900">Medication Reconciliation Protocol</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-xl">
                  Reconciliation synchronizes patient-reported regimens with clinical active orders across transitions of care (admission, transfer, discharge).
                </p>
              </div>
              <button
                onClick={() => setShowReconcileModal(true)}
                className="px-3.5 py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Execute Reconciliation</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-[11px] font-bold text-slate-500 uppercase">Active Medications</div>
                <div className="text-xl font-bold text-slate-900 mt-1">{activeMeds.length}</div>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-[11px] font-bold text-slate-500 uppercase">Verified Allergies</div>
                <div className="text-xl font-bold text-slate-900 mt-1">{allergies.length}</div>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-[11px] font-bold text-slate-500 uppercase">Fulfillment Pharmacies</div>
                <div className="text-xl font-bold text-slate-900 mt-1">{pharmacies.length}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: NEW PRESCRIPTION (e-Rx) */}
      {/* ========================================================================= */}
      {showNewRxModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center">
                  <Pill className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">Author Electronic Prescription</h3>
                  <p className="text-xs text-slate-500">For patient {patient.first_name} {patient.last_name}</p>
                </div>
              </div>
              <button
                onClick={() => setShowNewRxModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* LIVE SAFETY WARNING BANNER */}
            {rxSafetyAlerts.length > 0 && (
              <div className="p-4 bg-rose-50 border border-rose-300 rounded-xl space-y-2 text-rose-900">
                <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-rose-700">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Clinical Safety Alert: Allergy Cross-Reaction Risk!</span>
                </div>
                {rxSafetyAlerts.map((a, idx) => (
                  <p key={idx} className="text-xs text-rose-800 font-medium">
                    {a.message}
                  </p>
                ))}
                <div className="pt-2">
                  <label className="block text-xs font-bold text-rose-900 mb-1">
                    Mandatory Clinician Override Justification *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Desensitization completed / Supervised inpatient challenge..."
                    value={rxForm.overrideReason}
                    onChange={e => setRxForm({ ...rxForm, overrideReason: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-lg border border-rose-300 bg-white focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Medication Name & Strength *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Amoxicillin 500mg, Atorvastatin 20mg..."
                  value={rxForm.medicationName}
                  onChange={e => setRxForm({ ...rxForm, medicationName: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-600 focus:outline-none"
                />
                {catalogItems.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    <span className="text-[10px] text-slate-400 mr-1">Quick Picks:</span>
                    {catalogItems.slice(0, 3).map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setRxForm({
                          ...rxForm,
                          medicationName: item.display_name,
                          dosageForm: item.dosage_form || 'TABLET'
                        })}
                        className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded transition-colors"
                      >
                        {item.display_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Form</label>
                  <select
                    value={rxForm.dosageForm}
                    onChange={e => setRxForm({ ...rxForm, dosageForm: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="TABLET">TABLET</option>
                    <option value="CAPSULE">CAPSULE</option>
                    <option value="ORAL_LIQUID">ORAL LIQUID</option>
                    <option value="INJECTION">INJECTION</option>
                    <option value="INHALER">INHALER</option>
                    <option value="TOPICAL">TOPICAL CREAM</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Route</label>
                  <select
                    value={rxForm.route}
                    onChange={e => setRxForm({ ...rxForm, route: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="ORAL">ORAL</option>
                    <option value="INTRAVENOUS">INTRAVENOUS</option>
                    <option value="SUBCUTANEOUS">SUBCUTANEOUS</option>
                    <option value="INHALATION">INHALATION</option>
                    <option value="TOPICAL">TOPICAL</option>
                    <option value="OPHTHALMIC">OPHTHALMIC</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Frequency</label>
                  <select
                    value={rxForm.frequency}
                    onChange={e => setRxForm({ ...rxForm, frequency: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="ONCE_DAILY">Once Daily (QD)</option>
                    <option value="ONCE_DAILY_EVENING">Once Daily Evening</option>
                    <option value="BID">Twice Daily (BID)</option>
                    <option value="TID">Three Times Daily (TID)</option>
                    <option value="QID">Four Times Daily (QID)</option>
                    <option value="PRN">As Needed (PRN)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={rxForm.quantity}
                    onChange={e => setRxForm({ ...rxForm, quantity: Number(e.target.value) })}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Refills Authorized</label>
                  <input
                    type="number"
                    min="0"
                    max="12"
                    value={rxForm.refillsAuthorized}
                    onChange={e => setRxForm({ ...rxForm, refillsAuthorized: Number(e.target.value) })}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
                  <select
                    value={rxForm.priority}
                    onChange={e => setRxForm({ ...rxForm, priority: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="ROUTINE">ROUTINE</option>
                    <option value="URGENT">URGENT</option>
                    <option value="STAT">STAT</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Sig Instructions (Directions for Patient) *
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Take 1 tablet by mouth daily in the evening with food..."
                  value={rxForm.sigInstructions}
                  onChange={e => setRxForm({ ...rxForm, sigInstructions: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Indication</label>
                  <input
                    type="text"
                    placeholder="e.g. Essential hypertension / Secondary prevention"
                    value={rxForm.indication}
                    onChange={e => setRxForm({ ...rxForm, indication: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Fulfillment Pharmacy</label>
                  <select
                    value={rxForm.pharmacyId}
                    onChange={e => setRxForm({ ...rxForm, pharmacyId: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-white"
                  >
                    {pharmacies.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.is_internal ? '(In-House)' : '(External)'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowNewRxModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmittingRx || !rxForm.medicationName}
                onClick={() => handleCreatePrescription(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-semibold disabled:opacity-50"
              >
                Save as Draft
              </button>
              <button
                type="button"
                disabled={isSubmittingRx || !rxForm.medicationName}
                onClick={() => handleCreatePrescription(true)}
                className="px-5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              >
                <FileCheck className="w-3.5 h-3.5" />
                <span>Save & Cryptographically Sign</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DISPENSE PRESCRIPTION */}
      {/* ========================================================================= */}
      {showDispenseModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-700" />
                <h3 className="font-bold text-base text-slate-900">Pharmacy Fulfillment</h3>
              </div>
              <button onClick={() => setShowDispenseModal(null)} className="text-slate-400 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-lg text-xs text-indigo-900">
              <div className="font-bold">Prescription Order #{showDispenseModal.id.substring(0, 12)}</div>
              <div>Patient: {patient.first_name} {patient.last_name} ({patient.mrn})</div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Dispensary Location</label>
                <select
                  value={dispensePharmacyId}
                  onChange={e => setDispensePharmacyId(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-white"
                >
                  {pharmacies.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Quantity Dispensed</label>
                <input
                  type="number"
                  min="1"
                  value={dispenseQty}
                  onChange={e => setDispenseQty(Number(e.target.value))}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Pharmacist Batch Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Original pack dispensed, batch #B7712 exp 2028-09"
                  value={dispenseNotes}
                  onChange={e => setDispenseNotes(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowDispenseModal(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleDispensePrescription}
                className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg text-xs font-semibold shadow-xs"
              >
                Confirm Dispensation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DOCUMENT ALLERGY */}
      {/* ========================================================================= */}
      {showAddAllergyModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-base text-slate-900">Document Allergy Record</h3>
              </div>
              <button onClick={() => setShowAddAllergyModal(false)} className="text-slate-400 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddAllergy} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Substance Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Penicillin, Sulfa, Peanuts, Latex..."
                  value={allergyForm.substanceName}
                  onChange={e => setAllergyForm({ ...allergyForm, substanceName: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Type</label>
                  <select
                    value={allergyForm.allergenType}
                    onChange={e => setAllergyForm({ ...allergyForm, allergenType: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="MEDICATION">MEDICATION</option>
                    <option value="FOOD">FOOD</option>
                    <option value="ENVIRONMENTAL">ENVIRONMENTAL</option>
                    <option value="BIOLOGIC">BIOLOGIC</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Severity</label>
                  <select
                    value={allergyForm.severity}
                    onChange={e => setAllergyForm({ ...allergyForm, severity: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="MILD">MILD</option>
                    <option value="MODERATE">MODERATE</option>
                    <option value="SEVERE">SEVERE / CRITICAL</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reaction Description *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="e.g. Anaphylaxis, urticaria, facial swelling, vomiting..."
                  value={allergyForm.reactionDescription}
                  onChange={e => setAllergyForm({ ...allergyForm, reactionDescription: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddAllergyModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-xs"
                >
                  Save Allergy Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: RECORD MEDICATION */}
      {/* ========================================================================= */}
      {showAddMedModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Pill className="w-5 h-5 text-teal-700" />
                <h3 className="font-bold text-base text-slate-900">Record Active Medication</h3>
              </div>
              <button onClick={() => setShowAddMedModal(false)} className="text-slate-400 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddMedication} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Medication Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Metformin 500mg, Lisinopril 10mg..."
                  value={medForm.medicationName}
                  onChange={e => setMedForm({ ...medForm, medicationName: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Dosage</label>
                  <input
                    type="text"
                    placeholder="e.g. 10mg, 1 puff..."
                    value={medForm.dosage}
                    onChange={e => setMedForm({ ...medForm, dosage: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Frequency</label>
                  <input
                    type="text"
                    placeholder="e.g. ONCE_DAILY, BID..."
                    value={medForm.frequency}
                    onChange={e => setMedForm({ ...medForm, frequency: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">SIG / Instructions</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Take 1 tablet daily in morning..."
                  value={medForm.sigInstructions}
                  onChange={e => setMedForm({ ...medForm, sigInstructions: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddMedModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold shadow-xs"
                >
                  Save Medication
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DISCONTINUE MEDICATION */}
      {/* ========================================================================= */}
      {showDiscontinueModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <h3 className="font-bold text-base text-slate-900">Discontinue Medication</h3>
            <p className="text-xs text-slate-500">
              Provide clinical justification for stopping this medication regimen.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Discontinuation Rationale *</label>
              <textarea
                rows={3}
                required
                placeholder="e.g. Adverse reaction observed / Therapeutic target achieved / Switched to alternative drug..."
                value={discontinueReason}
                onChange={e => setDiscontinueReason(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-rose-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowDiscontinueModal(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                disabled={!discontinueReason.trim()}
                onClick={handleDiscontinue}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50"
              >
                Discontinue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CANCEL PRESCRIPTION */}
      {/* ========================================================================= */}
      {showCancelRxModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <h3 className="font-bold text-base text-slate-900">Cancel Prescription Order</h3>
            <p className="text-xs text-slate-500">
              Prescription cancellation requires an explicit medical justification for audit defensibility.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Cancellation Reason *</label>
              <textarea
                rows={3}
                required
                placeholder="e.g. Contraindicated following lab results / Alternative medication prescribed..."
                value={cancelRxReason}
                onChange={e => setCancelRxReason(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-rose-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCancelRxModal(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold"
              >
                Keep Active
              </button>
              <button
                disabled={!cancelRxReason.trim()}
                onClick={handleCancelPrescription}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: RECONCILE MEDICATIONS */}
      {/* ========================================================================= */}
      {showReconcileModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <h3 className="font-bold text-base text-slate-900">Execute Medication Reconciliation</h3>
            <p className="text-xs text-slate-500">
              Record reconciliation review across active medications, allergies, and patient statements.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Discrepancy Count</label>
                <input
                  type="number"
                  min="0"
                  value={discrepancyCount}
                  onChange={e => setDiscrepancyCount(Number(e.target.value))}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reconciliation Notes</label>
                <textarea
                  rows={3}
                  value={reconcileNotes}
                  onChange={e => setReconcileNotes(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowReconcileModal(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleReconcile}
                className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg text-xs font-semibold shadow-xs"
              >
                Record Reconciliation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

