/**
 * CLINILYNC Lightweight EMR & Clinical Consultation Suite (/app/clinical)
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../api/client.js';
import { Stethoscope, CheckCircle2, Pill, Activity, Plus, FileSignature, AlertCircle, X } from 'lucide-react';

export const ClinicalView: React.FC = () => {
  const { activeOrganization, hasPermission, user } = useAuth();
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // SOAP Note Form State
  const [soap, setSoap] = useState({
    encounterType: 'OUTPATIENT_CONSULTATION',
    chiefComplaint: '',
    subjective: '',
    objective: '',
    assessment: '',
    plan: ''
  });
  const [isSubmittingSoap, setIsSubmittingSoap] = useState(false);

  // e-Prescription Modal State
  const [showRxModal, setShowRxModal] = useState(false);
  const [rx, setRx] = useState({
    medicationName: '',
    dosage: '10 mg',
    frequency: 'Once Daily',
    duration: '30 Days',
    quantity: 30,
    refillsRemaining: 1,
    instructions: 'Take orally after meals.'
  });

  // Vitals State
  const [showVitalsModal, setShowVitalsModal] = useState(false);
  const [vitals, setVitals] = useState({
    systolicBp: 120,
    diastolicBp: 80,
    heartRate: 72,
    respiratoryRate: 16,
    temperatureCelsius: 36.8,
    oxygenSaturation: 98,
    weightKg: 75.0,
    heightCm: 175.0
  });

  useEffect(() => {
    loadPatients();
  }, [activeOrganization?.id]);

  useEffect(() => {
    if (selectedPatientId) {
      loadRecords(selectedPatientId);
    }
  }, [selectedPatientId]);

  const loadPatients = async () => {
    setLoading(true);
    try {
      const res = await api.getPatients();
      setPatients(res.patients || []);
      if ((res.patients as any[])?.length > 0 && !selectedPatientId) {
        setSelectedPatientId((res.patients as any[])[0].id);
      }
    } catch (err) {
      console.error('Failed to load patients:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadRecords = async (patientId: string) => {
    try {
      const res = await api.getClinicalRecords(patientId);
      setRecords(res.records || []);
    } catch (err) {
      console.error('Failed to load clinical records:', err);
    }
  };

  const handleCreateSoap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId) return;
    setIsSubmittingSoap(true);
    try {
      await api.createClinicalRecord({
        patientId: selectedPatientId,
        ...soap
      });
      setSoap({
        encounterType: 'OUTPATIENT_CONSULTATION',
        chiefComplaint: '',
        subjective: '',
        objective: '',
        assessment: '',
        plan: ''
      });
      await loadRecords(selectedPatientId);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setIsSubmittingSoap(false);
    }
  };

  const handleFinalizeRecord = async (recordId: string) => {
    try {
      await api.finalizeClinicalRecord(recordId);
      await loadRecords(selectedPatientId);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleCreatePrescription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId) return;
    try {
      await api.createPrescription({
        patientId: selectedPatientId,
        ...rx
      });
      setShowRxModal(false);
      setRx({
        medicationName: '',
        dosage: '10 mg',
        frequency: 'Once Daily',
        duration: '30 Days',
        quantity: 30,
        refillsRemaining: 1,
        instructions: 'Take orally after meals.'
      });
      alert('Prescription authorized and dispatched.');
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleRecordVitals = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId) return;
    try {
      await api.createVitals({
        patientId: selectedPatientId,
        ...vitals
      });
      setShowVitalsModal(false);
      alert('Vitals saved to chart.');
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const currentPatient = patients.find(p => p.id === selectedPatientId);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Clinical EMR & SOAP Consultations</h1>
          <p className="text-xs text-slate-500">
            {activeOrganization?.name} · Electronic Medical Record Workspace
          </p>
        </div>

        {/* Patient Selector */}
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-slate-600">Active Patient Chart:</label>
          <select
            value={selectedPatientId}
            onChange={(e) => setSelectedPatientId(e.target.value)}
            className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600"
          >
            {patients.map(p => (
              <option key={p.id} value={p.id}>
                {p.first_name} {p.last_name} ({p.mrn})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Patient Banner */}
      {currentPatient && (
        <div className="bg-teal-50/60 border border-teal-200/60 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 text-sm">
                {currentPatient.first_name} {currentPatient.last_name}
              </span>
              <span className="font-mono text-xs px-2 py-0.5 bg-white text-teal-800 rounded border border-teal-200 font-medium">
                {currentPatient.mrn}
              </span>
            </div>
            <div className="text-xs text-slate-600 flex items-center gap-3">
              <span>Born: {currentPatient.date_of_birth}</span>
              <span>·</span>
              <span>Allergies: <strong className="text-amber-800">{currentPatient.allergies_summary || 'NKDA'}</strong></span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasPermission('clinical.create') && (
              <button
                onClick={() => setShowVitalsModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-2xs"
              >
                <Activity className="w-3.5 h-3.5 text-teal-600" />
                <span>Log Vitals</span>
              </button>
            )}
            {hasPermission('prescription.create') && (
              <button
                onClick={() => setShowRxModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-2xs"
              >
                <Pill className="w-3.5 h-3.5" />
                <span>Authorize e-Rx</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 2-Column Layout: Left Authoring Form, Right Past Encounters */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* SOAP Note Authoring Form (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-lg border border-slate-200 shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">New Clinical Encounter (SOAP Note)</h2>
              <p className="text-xs text-slate-500">Author comprehensive consultation record</p>
            </div>
            <span className="text-[11px] font-mono text-teal-700 bg-teal-50 px-2 py-0.5 rounded">
              Clinician: {user?.firstName} {user?.lastName}
            </span>
          </div>

          {!hasPermission('clinical.create') ? (
            <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 rounded-lg border border-slate-200">
              Your active role ({user?.firstName}) does not hold the <code className="font-mono text-teal-800">clinical.create</code> permission.
            </div>
          ) : (
            <form onSubmit={handleCreateSoap} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-800 mb-1">Chief Complaint *</label>
                <input
                  type="text"
                  required
                  value={soap.chiefComplaint}
                  onChange={(e) => setSoap({ ...soap, chiefComplaint: e.target.value })}
                  placeholder="e.g. Chest tightness on moderate exertion, 2-week history"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-800 mb-1">
                  Subjective (S) <span className="font-normal text-slate-500">— Patient narrative & symptoms</span>
                </label>
                <textarea
                  rows={2}
                  value={soap.subjective}
                  onChange={(e) => setSoap({ ...soap, subjective: e.target.value })}
                  placeholder="Patient describes gradual onset of exertional discomfort..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-800 mb-1">
                  Objective (O) <span className="font-normal text-slate-500">— Physical exam, observations & labs</span>
                </label>
                <textarea
                  rows={2}
                  value={soap.objective}
                  onChange={(e) => setSoap({ ...soap, objective: e.target.value })}
                  placeholder="BP 132/84, HR 72 regular. S1/S2 distinct without murmurs..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-800 mb-1">
                  Assessment (A) <span className="font-normal text-slate-500">— Differential diagnosis & clinical impression</span>
                </label>
                <textarea
                  rows={2}
                  value={soap.assessment}
                  onChange={(e) => setSoap({ ...soap, assessment: e.target.value })}
                  placeholder="1. Essential Hypertension (I10) 2. Suspected Angina Pectoris"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-800 mb-1">
                  Plan (P) <span className="font-normal text-slate-500">— Therapy, medications, referrals & follow-up</span>
                </label>
                <textarea
                  rows={2}
                  value={soap.plan}
                  onChange={(e) => setSoap({ ...soap, plan: e.target.value })}
                  placeholder="Initiate beta-blocker therapy, schedule stress echocardiogram..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="pt-2 flex items-center justify-end">
                <button
                  type="submit"
                  disabled={isSubmittingSoap}
                  className="px-5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-xs transition-colors disabled:opacity-50"
                >
                  {isSubmittingSoap ? 'Saving Note...' : 'Save Draft SOAP Note'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Existing Encounter Records (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-lg border border-slate-200 shadow-xs p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900">Encounter History</h2>
            <p className="text-xs text-slate-500">Documented medical records for this patient</p>
          </div>

          {records.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No historical clinical notes for this patient.
            </div>
          ) : (
            <div className="space-y-3.5 max-h-[600px] overflow-y-auto">
              {records.map((rec) => (
                <div key={rec.id} className="p-4 rounded-lg border border-slate-200 text-xs space-y-2 bg-slate-50/50">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">
                      {new Date(rec.encounter_date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                      rec.is_finalized ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}>
                      {rec.is_finalized ? 'Finalized & Released' : 'Draft Encounter'}
                    </span>
                  </div>

                  <div className="text-slate-700">
                    <span className="font-semibold text-slate-900">Chief Complaint:</span> {rec.chief_complaint}
                  </div>

                  {rec.assessment && (
                    <div className="p-2 bg-white rounded border border-slate-200 text-[11px] text-slate-700">
                      <div className="font-semibold text-slate-900">Assessment:</div>
                      <div>{rec.assessment}</div>
                      {rec.plan && <div className="mt-1"><strong className="text-slate-900">Plan:</strong> {rec.plan}</div>}
                    </div>
                  )}

                  {!rec.is_finalized && hasPermission('clinical.finalize') && (
                    <div className="pt-2 flex justify-end">
                      <button
                        onClick={() => handleFinalizeRecord(rec.id)}
                        className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-emerald-900 bg-emerald-100 hover:bg-emerald-200 rounded transition-colors"
                      >
                        <FileSignature className="w-3.5 h-3.5" />
                        <span>Sign & Finalize Record</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* e-Prescribe Modal */}
      {showRxModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-900 text-sm">Authorize Electronic Prescription (e-Rx)</h3>
              <button onClick={() => setShowRxModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePrescription} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Medication Name *</label>
                <input
                  type="text"
                  required
                  value={rx.medicationName}
                  onChange={(e) => setRx({ ...rx, medicationName: e.target.value })}
                  placeholder="e.g. Amlodipine, Lisinopril, Metformin"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Dosage & Form</label>
                  <input
                    type="text"
                    required
                    value={rx.dosage}
                    onChange={(e) => setRx({ ...rx, dosage: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Frequency</label>
                  <input
                    type="text"
                    required
                    value={rx.frequency}
                    onChange={(e) => setRx({ ...rx, frequency: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Dispense Quantity</label>
                  <input
                    type="number"
                    value={rx.quantity}
                    onChange={(e) => setRx({ ...rx, quantity: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Refills Authorized</label>
                  <input
                    type="number"
                    value={rx.refillsRemaining}
                    onChange={(e) => setRx({ ...rx, refillsRemaining: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Instructions for Patient</label>
                <textarea
                  rows={2}
                  value={rx.instructions}
                  onChange={(e) => setRx({ ...rx, instructions: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRxModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg font-semibold"
                >
                  Authorize Prescription
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Vitals Modal */}
      {showVitalsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-900 text-sm">Log Patient Vital Signs</h3>
              <button onClick={() => setShowVitalsModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordVitals} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Systolic BP (mmHg)</label>
                  <input
                    type="number"
                    value={vitals.systolicBp}
                    onChange={(e) => setVitals({ ...vitals, systolicBp: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Diastolic BP (mmHg)</label>
                  <input
                    type="number"
                    value={vitals.diastolicBp}
                    onChange={(e) => setVitals({ ...vitals, diastolicBp: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Heart Rate (bpm)</label>
                  <input
                    type="number"
                    value={vitals.heartRate}
                    onChange={(e) => setVitals({ ...vitals, heartRate: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">SpO2 Oxygen (%)</label>
                  <input
                    type="number"
                    value={vitals.oxygenSaturation}
                    onChange={(e) => setVitals({ ...vitals, oxygenSaturation: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Weight (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={vitals.weightKg}
                    onChange={(e) => setVitals({ ...vitals, weightKg: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Height (cm)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={vitals.heightCm}
                    onChange={(e) => setVitals({ ...vitals, heightCm: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 font-mono"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowVitalsModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg font-semibold"
                >
                  Save Vitals to Chart
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
