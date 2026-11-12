/**
 * CLINILYNC Organization Prescriptions & Pharmacy Dispensary View
 * 
 * Provides centralized organization-wide electronic prescription management:
 * - Live filtering across DRAFT, SIGNED, DISPENSED, CANCELLED orders.
 * - Cryptographic signature status and verification indicator.
 * - In-house pharmacy fulfillment queue.
 * - Direct navigation to patient medications profile.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../api/client.js';
import {
  Pill,
  Building2,
  Search,
  Filter,
  CheckCircle2,
  FileCheck,
  ShieldCheck,
  Clock,
  ArrowRight,
  RefreshCw,
  Plus,
  AlertTriangle,
  X
} from 'lucide-react';

interface PrescriptionsViewProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const PrescriptionsView: React.FC<PrescriptionsViewProps> = ({
  onNavigate
}) => {
  const { user, hasPermission, activeOrganization } = useAuth();

  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [pharmacies, setPharmacies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Dispense modal
  const [dispensingRx, setDispensingRx] = useState<any | null>(null);
  const [dispensePharmacyId, setDispensePharmacyId] = useState('');
  const [dispenseQty, setDispenseQty] = useState(30);

  const loadPrescriptions = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await api.v1GetPrescriptions({
        status: statusFilter !== 'ALL' ? statusFilter : undefined
      });
      setPrescriptions(res || []);

      if (hasPermission('pharmacy.view')) {
        const pharmRes = await api.request<any[]>('/api/v1/pharmacies');
        const pharms = pharmRes || [];
        setPharmacies(pharms);
        if (pharms.length > 0 && !dispensePharmacyId) {
          setDispensePharmacyId(pharms[0].id);
        }
      } else {
        setPharmacies([]);
      }
    } catch (err: any) {
      console.error('Failed to load prescriptions:', err);
      setError(err.message || 'Failed to retrieve electronic prescriptions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPrescriptions();
  }, [statusFilter]);

  const handleSign = async (rxId: string) => {
    try {
      await api.v1SignPrescription(rxId);
      await loadPrescriptions();
    } catch (err: any) {
      alert(`Signing failed: ${err.message}`);
    }
  };

  const handleDispense = async () => {
    if (!dispensingRx) return;
    try {
      await api.v1DispensePrescription(dispensingRx.id, {
        pharmacyId: dispensePharmacyId || pharmacies[0]?.id,
        quantityDispensed: Number(dispenseQty) || 30,
        isComplete: true,
        notes: 'Dispensed from dispensary queue'
      });
      setDispensingRx(null);
      await loadPrescriptions();
    } catch (err: any) {
      alert(`Dispensation failed: ${err.message}`);
    }
  };

  const filteredRx = prescriptions.filter(rx => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const idMatch = rx.id.toLowerCase().includes(q);
    const patMatch = rx.patient_name?.toLowerCase().includes(q);
    const itemMatch = rx.items?.some((i: any) => i.medication_name.toLowerCase().includes(q));
    return idMatch || patMatch || itemMatch;
  });

  return (
    <div className="cl-ui-page space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-800 font-bold flex items-center justify-center shadow-xs">
              <Pill className="w-5 h-5 text-teal-700" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">
                  Prescription Orders & Pharmacy Queue
                </h1>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  e-Prescribing
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage medication orders and pharmacy requests in one place.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate('/app/patients')}
            className="px-3.5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Prescribe via Patient Directory</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by Order ID, patient name, or medication item..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-600 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">Status:</span>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="text-xs py-2 px-3 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-teal-600"
          >
            <option value="ALL">All Statuses</option>
            <option value="DRAFT">DRAFT</option>
            <option value="SIGNED">SIGNED (Ready to Dispense)</option>
            <option value="PARTIALLY_DISPENSED">PARTIALLY DISPENSED</option>
            <option value="DISPENSED">DISPENSED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </div>
      </div>

      {/* Prescription List */}
      {loading ? (
        <div className="p-12 text-center text-slate-500">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-600" />
          <span className="text-xs font-medium">Loading organization prescriptions...</span>
        </div>
      ) : filteredRx.length === 0 ? (
        <div className="p-12 bg-white border border-slate-200 rounded-xl text-center space-y-3">
          <Pill className="w-8 h-8 text-slate-300 mx-auto" />
          <div className="text-sm font-semibold text-slate-700">No Prescriptions Found</div>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            No electronic prescription orders match your current filter criteria.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRx.map(rx => {
            const isSigned = rx.status === 'SIGNED';
            const isDraft = rx.status === 'DRAFT';
            const isDispensed = rx.status === 'DISPENSED';

            return (
              <div
                key={rx.id}
                className="p-5 bg-white border border-slate-200 rounded-xl shadow-xs space-y-3 hover:border-slate-300 transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold text-slate-800">
                      #{rx.id.substring(0, 12)}
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
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded uppercase bg-slate-100 text-slate-600">
                      {rx.priority || 'ROUTINE'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span>Created: {new Date(rx.created_at).toLocaleDateString()}</span>
                    {rx.signed_at && (
                      <span className="flex items-center gap-1 text-emerald-700 font-semibold text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Signed</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Patient Reference & Items */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-xs text-slate-500">
                      Patient: <span className="font-bold text-slate-800">{rx.patient_name || rx.patient_id}</span>
                      {rx.patient_mrn && <span className="font-mono text-[10px] ml-1 bg-slate-100 px-1.5 py-0.5 rounded">{rx.patient_mrn}</span>}
                    </div>
                    {rx.items && rx.items.length > 0 ? (
                      <div className="flex flex-wrap gap-2 pt-0.5">
                        {rx.items.map((item: any) => (
                          <div key={item.id} className="text-xs bg-slate-50 border border-slate-200 px-2 py-1 rounded">
                            <span className="font-semibold text-slate-800">{item.medication_name}</span>
                            <span className="text-slate-500 ml-1">({item.quantity} {item.quantity_unit})</span>
                            <span className="text-[11px] text-slate-600 block font-mono">{item.sig_instructions}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-600 font-medium">Standard prescription item.</div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isDraft && hasPermission('prescription.sign') && (
                      <button
                        onClick={() => handleSign(rx.id)}
                        className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md text-xs font-semibold flex items-center gap-1 shadow-xs transition-colors"
                      >
                        <FileCheck className="w-3.5 h-3.5" />
                        <span>Sign Order</span>
                      </button>
                    )}

                    {isSigned && (hasPermission('prescription.dispense') || user?.isSuperAdmin) && (
                      <button
                        onClick={() => {
                          setDispensingRx(rx);
                          setDispenseQty(rx.items?.[0]?.quantity || 30);
                        }}
                        className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white rounded-md text-xs font-semibold flex items-center gap-1 shadow-xs transition-colors"
                      >
                        <Building2 className="w-3.5 h-3.5" />
                        <span>Dispense</span>
                      </button>
                    )}

                    <button
                      onClick={() => onNavigate(`/app/patients/${rx.patient_id}/medications`)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors"
                    >
                      <span>Patient Profile</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {rx.signature_hash && (
                  <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 pt-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>SHA-256: {rx.signature_hash}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dispense Modal */}
      {dispensingRx && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-700" />
                <h3 className="font-bold text-base text-slate-900">Dispense Order #{dispensingRx.id.substring(0, 10)}</h3>
              </div>
              <button onClick={() => setDispensingRx(null)} className="text-slate-400 p-1">
                <X className="w-5 h-5" />
              </button>
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
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setDispensingRx(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleDispense}
                className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg text-xs font-semibold shadow-xs"
              >
                Fulfill Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

