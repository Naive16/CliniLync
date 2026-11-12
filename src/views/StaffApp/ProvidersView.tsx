/**
 * CLINILYNC Provider Directory & Profiles View
 * Routes: /app/providers and /app/providers/:providerId
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../api/client.js';
import {
  UserCheck,
  Search,
  Plus,
  Building2,
  Stethoscope,
  Award,
  Calendar,
  Clock,
  Mail,
  Phone,
  ShieldCheck,
  ChevronLeft,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Archive,
  Edit2
} from 'lucide-react';

interface ProvidersViewProps {
  currentPath: string;
  providerIdParam?: string | null;
  onNavigate: (path: string) => void;
}

export const ProvidersView: React.FC<ProvidersViewProps> = ({ providerIdParam, onNavigate }) => {
  const { activeOrganization, hasPermission } = useAuth();
  const [providers, setProviders] = useState<any[]>([]);
  const [specialties, setSpecialties] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ACTIVE');

  // Single Provider Detail View State
  const [selectedProvider, setSelectedProvider] = useState<any | null>(null);
  const [providerDepts, setProviderDepts] = useState<any[]>([]);
  const [availabilityRules, setAvailabilityRules] = useState<any[]>([]);
  const [detailTab, setDetailTab] = useState<'OVERVIEW' | 'DEPARTMENTS' | 'SCHEDULE' | 'SLOTS'>('OVERVIEW');
  const [testDate, setTestDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Create Provider Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    title: 'Dr.',
    firstName: '',
    lastName: '',
    displayName: '',
    specialization: '',
    specialtyId: '',
    licenseNumber: '',
    consultationFee: 150,
    email: '',
    phone: '',
    bio: '',
    qualifications: '',
    departmentId: ''
  });
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Assign Dept Modal
  const [showAssignDeptModal, setShowAssignDeptModal] = useState(false);
  const [assignDeptId, setAssignDeptId] = useState('');
  const [assignIsPrimary, setAssignIsPrimary] = useState(false);

  useEffect(() => {
    loadReferenceData();
  }, [activeOrganization?.id]);

  useEffect(() => {
    if (providerIdParam) {
      loadProviderDetails(providerIdParam);
    } else {
      setSelectedProvider(null);
      loadProvidersList();
    }
  }, [providerIdParam, activeOrganization?.id, search, specialtyFilter, departmentFilter, statusFilter]);

  const loadReferenceData = async () => {
    try {
      const [specRes, deptRes] = await Promise.all([
        api.v1GetSpecialties().catch(() => ({ specialties: [] })),
        api.v1GetDepartments({ status: 'ACTIVE' }).catch(() => ({ departments: [] }))
      ]);
      setSpecialties(specRes.specialties || []);
      setDepartments(deptRes.departments || []);
    } catch (err) {
      console.warn('Failed to load specialties/departments:', err);
    }
  };

  const loadProvidersList = async () => {
    setLoading(true);
    try {
      const res = await api.v1GetProviders({
        search,
        specialtyId: specialtyFilter || undefined,
        departmentId: departmentFilter || undefined,
        status: statusFilter
      });
      setProviders(res.providers || []);
    } catch (err) {
      console.error('Failed to load providers list:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadProviderDetails = async (id: string) => {
    setLoading(true);
    try {
      const res = await api.v1GetProvider(id);
      setSelectedProvider(res.provider);
      setProviderDepts(res.departments || []);
      setAvailabilityRules(res.availability || []);
    } catch (err) {
      console.error('Failed to load provider details:', err);
      setSelectedProvider(null);
    } finally {
      setLoading(false);
    }
  };

  const handleTestSlots = async () => {
    if (!selectedProvider) return;
    setSlotsLoading(true);
    try {
      const res = await api.v1GetProviderAvailableSlots(selectedProvider.id, testDate, 30);
      setAvailableSlots(res.slots || []);
    } catch (err) {
      console.error('Failed to calculate slots:', err);
    } finally {
      setSlotsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedProvider && detailTab === 'SLOTS') {
      handleTestSlots();
    }
  }, [selectedProvider?.id, detailTab, testDate]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    setErrorMessage(null);
    try {
      await api.v1CreateProvider({
        ...formData,
        departmentIds: formData.departmentId ? [formData.departmentId] : []
      });
      setShowCreateModal(false);
      setFormData({
        title: 'Dr.',
        firstName: '',
        lastName: '',
        displayName: '',
        specialization: '',
        specialtyId: '',
        licenseNumber: '',
        consultationFee: 150,
        email: '',
        phone: '',
        bio: '',
        qualifications: '',
        departmentId: ''
      });
      await loadProvidersList();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create provider.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleAssignDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProvider || !assignDeptId) return;
    try {
      await api.v1AssignProviderDepartment(selectedProvider.id, assignDeptId, assignIsPrimary);
      setShowAssignDeptModal(false);
      setAssignDeptId('');
      await loadProviderDetails(selectedProvider.id);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRemoveDept = async (deptId: string) => {
    if (!selectedProvider) return;
    if (!confirm('Remove provider from this department?')) return;
    try {
      await api.v1RemoveProviderDepartment(selectedProvider.id, deptId);
      await loadProviderDetails(selectedProvider.id);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleArchive = async () => {
    if (!selectedProvider) return;
    const reason = prompt('Please enter the reason for archiving this provider profile:');
    if (!reason) return;
    try {
      await api.v1ArchiveProvider(selectedProvider.id, reason);
      await loadProviderDetails(selectedProvider.id);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const currencySymbol = activeOrganization?.currency_code === 'USD' ? '$' : '£';

  // --- SINGLE PROVIDER 360 PROFILE VIEW ---
  if (providerIdParam) {
    if (loading) {
      return (
        <div className="p-12 text-center text-xs text-slate-400">
          Loading provider profile...
        </div>
      );
    }

    if (!selectedProvider) {
      return (
        <div className="p-8 max-w-lg mx-auto text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
          <h2 className="text-base font-bold text-slate-800">Healthcare Provider Not Found</h2>
          <p className="text-xs text-slate-500">The requested provider profile does not exist in this organization or access was revoked.</p>
          <button
            onClick={() => onNavigate('/app/providers')}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
          >
            Return to Provider Directory
          </button>
        </div>
      );
    }

    return (
      <div className="cl-ui-page space-y-6">
        {/* Back link */}
        <button
          onClick={() => onNavigate('/app/providers')}
          className="inline-flex items-center gap-1.5 text-xs text-teal-700 hover:text-teal-900 font-semibold"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Provider Directory
        </button>

        {/* Provider Profile Header */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-xl bg-teal-600 text-white font-bold text-xl flex items-center justify-center shrink-0 shadow-xs">
              <Stethoscope className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-slate-900">
                  {selectedProvider.display_name || `${selectedProvider.title} ${selectedProvider.first_name} ${selectedProvider.last_name}`}
                </h1>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  selectedProvider.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                }`}>
                  {selectedProvider.status}
                </span>
                {selectedProvider.is_credential_verified && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">
                    <ShieldCheck className="w-3 h-3 text-teal-600" />
                    Verified Clinician
                  </span>
                )}
              </div>
              <p className="text-xs text-teal-800 font-medium">
                {selectedProvider.specialization} · License: <span className="font-mono">{selectedProvider.license_number}</span>
              </p>
              <p className="text-xs text-slate-500 flex items-center gap-4 pt-1">
                {selectedProvider.email && (
                  <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {selectedProvider.email}</span>
                )}
                {selectedProvider.phone && (
                  <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {selectedProvider.phone}</span>
                )}
                <span>Consultation Fee: <strong className="font-semibold text-slate-800">{currencySymbol}{Number(selectedProvider.consultation_fee).toFixed(2)}</strong></span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-center">
            <button
              onClick={() => onNavigate(`/app/appointments/new?providerId=${selectedProvider.id}`)}
              className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Book Appointment</span>
            </button>
            {hasPermission('provider.archive') && selectedProvider.status === 'ACTIVE' && (
              <button
                onClick={handleArchive}
                className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
              >
                <Archive className="w-3.5 h-3.5" />
                <span>Archive</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-semibold">
          <button
            onClick={() => setDetailTab('OVERVIEW')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              detailTab === 'OVERVIEW' ? 'bg-teal-700 text-white' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Professional Overview
          </button>
          <button
            onClick={() => setDetailTab('DEPARTMENTS')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              detailTab === 'DEPARTMENTS' ? 'bg-teal-700 text-white' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Department Assignments ({providerDepts.length})
          </button>
          <button
            onClick={() => setDetailTab('SCHEDULE')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              detailTab === 'SCHEDULE' ? 'bg-teal-700 text-white' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Weekly Working Hours
          </button>
          <button
            onClick={() => setDetailTab('SLOTS')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              detailTab === 'SLOTS' ? 'bg-teal-700 text-white' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Bookable Slot Calculator
          </button>
        </div>

        {/* Tab Panels */}
        {detailTab === 'OVERVIEW' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Award className="w-4 h-4 text-teal-700" />
                <span>Qualifications & Bio</span>
              </h2>
              <div>
                <span className="text-[11px] text-slate-400 font-semibold uppercase">Professional Bio</span>
                <p className="text-xs text-slate-700 mt-1 leading-relaxed">
                  {selectedProvider.bio || 'No professional biography entered.'}
                </p>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 font-semibold uppercase">Academic Qualifications & Credentials</span>
                <p className="text-xs text-slate-700 mt-1 font-mono bg-slate-50 p-2.5 rounded border border-slate-200">
                  {selectedProvider.qualifications || 'Board Certified Medical Specialist'}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-teal-700" />
                <span>Institutional Affiliations</span>
              </h2>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Healthcare Organization:</span>
                  <span className="font-semibold text-slate-900">{activeOrganization?.name}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">License Reference:</span>
                  <span className="font-mono font-semibold text-slate-900">{selectedProvider.license_number}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Patient Acceptance:</span>
                  <span className={`font-semibold ${selectedProvider.is_accepting_patients ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {selectedProvider.is_accepting_patients ? 'Accepting New Patients' : 'Roster Full'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Primary Timezone:</span>
                  <span className="font-mono text-slate-700">Europe/London</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {detailTab === 'DEPARTMENTS' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900">Assigned Clinical Departments</h2>
              {hasPermission('department.manage_assignments') && (
                <button
                  onClick={() => setShowAssignDeptModal(true)}
                  className="px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Assign Department</span>
                </button>
              )}
            </div>

            {providerDepts.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No department assignments on file for this provider.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {providerDepts.map((pd) => (
                  <div key={pd.id} className="py-3 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-slate-900 flex items-center gap-2">
                        <span>{pd.name}</span>
                        {pd.is_primary && (
                          <span className="px-1.5 py-0.5 bg-teal-50 text-teal-800 rounded text-[10px] font-semibold border border-teal-200">
                            Primary Unit
                          </span>
                        )}
                      </div>
                      <span className="text-slate-400 font-mono text-[11px]">Code: {pd.code}</span>
                    </div>

                    {hasPermission('department.manage_assignments') && (
                      <button
                        onClick={() => handleRemoveDept(pd.department_id)}
                        className="text-rose-600 hover:text-rose-800 text-[11px] font-medium"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {detailTab === 'SCHEDULE' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Weekly Clinical Schedule & Working Hours</h2>
                <p className="text-xs text-slate-500">Recurring consultation availability across operational days.</p>
              </div>
              <span className="text-xs font-mono text-slate-500 bg-slate-50 px-2.5 py-1 rounded border border-slate-200">
                Timezone: Europe/London
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {[
                { day: 1, name: 'Monday' },
                { day: 2, name: 'Tuesday' },
                { day: 3, name: 'Wednesday' },
                { day: 4, name: 'Thursday' },
                { day: 5, name: 'Friday' },
                { day: 6, name: 'Saturday' },
                { day: 7, name: 'Sunday' }
              ].map(({ day, name }) => {
                const rule = availabilityRules.find(r => r.day_of_week === day);
                return (
                  <div key={day} className="py-3 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-900 w-28">{name}</span>
                    {rule && rule.is_active ? (
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-800 font-mono rounded border border-emerald-200 font-medium">
                          {rule.start_time} — {rule.end_time}
                        </span>
                        <span className="text-[11px] text-slate-400 font-sans">Active Clinic</span>
                      </div>
                    ) : (
                      <span className="text-slate-400 italic">Off / No Clinic Scheduled</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {detailTab === 'SLOTS' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Bookable Slot Calculator</h2>
                <p className="text-xs text-slate-500">Live availability engine calculating real-time slots and detecting conflicts.</p>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-600">Select Date:</label>
                <input
                  type="date"
                  value={testDate}
                  onChange={(e) => setTestDate(e.target.value)}
                  className="px-2.5 py-1 border border-slate-300 rounded text-xs text-slate-800 font-mono"
                />
              </div>
            </div>

            {slotsLoading ? (
              <div className="p-8 text-center text-xs text-slate-400">Evaluating provider calendar and conflicts...</div>
            ) : availableSlots.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No active working hours scheduled for this provider on {testDate}.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5 pt-2">
                {availableSlots.map((slot, idx) => (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-lg border text-center text-xs transition-colors ${
                      slot.isAvailable
                        ? 'bg-teal-50/60 border-teal-200 text-teal-900 hover:bg-teal-100/70 cursor-pointer'
                        : 'bg-slate-100/70 border-slate-200 text-slate-400 line-through cursor-not-allowed'
                    }`}
                    onClick={() => {
                      if (slot.isAvailable) {
                        onNavigate(`/app/appointments/new?providerId=${selectedProvider.id}&date=${slot.startTime}`);
                      }
                    }}
                  >
                    <div className="font-bold font-mono text-xs">{slot.timeString}</div>
                    <div className="text-[10px] mt-0.5">
                      {slot.isAvailable ? 'Available' : 'Booked'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Assign Department Modal */}
        {showAssignDeptModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Assign Clinical Department</h3>
              <form onSubmit={handleAssignDept} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Select Department</label>
                  <select
                    value={assignDeptId}
                    onChange={(e) => setAssignDeptId(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="">-- Choose department --</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isPrimary"
                    checked={assignIsPrimary}
                    onChange={(e) => setAssignIsPrimary(e.target.checked)}
                    className="rounded text-teal-600 focus:ring-teal-500"
                  />
                  <label htmlFor="isPrimary" className="text-xs text-slate-700">Set as Primary Department</label>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowAssignDeptModal(false)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold rounded-lg shadow-xs"
                  >
                    Assign
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- PROVIDER DIRECTORY LIST VIEW ---
  return (
    <div className="cl-ui-page space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Healthcare Provider Directory</h1>
          <p className="text-xs text-slate-500">
            {activeOrganization?.name} · Clinical Medical Staff & Specialists Roster
          </p>
        </div>

        {hasPermission('provider.create') && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors self-start sm:self-center"
          >
            <Plus className="w-4 h-4" />
            <span>Register Provider</span>
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
        <div className="relative sm:col-span-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search provider, license, or specialty..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-teal-600 focus:outline-none"
          />
        </div>

        <div>
          <select
            value={specialtyFilter}
            onChange={(e) => setSpecialtyFilter(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-teal-600 focus:outline-none"
          >
            <option value="">All Specialties</option>
            {specialties.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-teal-600 focus:outline-none"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-teal-600 focus:outline-none"
          >
            <option value="ACTIVE">Active Staff</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ARCHIVED">Archived</option>
            <option value="ALL">All Statuses</option>
          </select>
        </div>
      </div>

      {/* Providers Grid */}
      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400">Loading clinicians and specialists...</div>
      ) : providers.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-3">
          <Stethoscope className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="text-sm font-bold text-slate-700">No Providers Found</h3>
          <p className="text-xs text-slate-400">No medical professionals match the selected criteria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {providers.map((p) => (
            <div
              key={p.id}
              onClick={() => onNavigate(`/app/providers/${p.id}`)}
              className="bg-white rounded-xl border border-slate-200 shadow-xs hover:border-teal-400 hover:shadow-sm transition-all p-5 space-y-3 cursor-pointer group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-teal-100 text-teal-800 font-bold flex items-center justify-center shrink-0 text-sm group-hover:bg-teal-600 group-hover:text-white transition-colors">
                    {p.first_name ? p.first_name[0] : 'Dr'}
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-900 text-sm group-hover:text-teal-700 transition-colors">
                      {p.display_name || `${p.title} ${p.first_name} ${p.last_name}`}
                    </h2>
                    <span className="text-[11px] text-teal-700 font-medium">
                      {p.specialization}
                    </span>
                  </div>
                </div>

                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  p.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                }`}>
                  {p.status}
                </span>
              </div>

              <div className="text-xs text-slate-600 space-y-1 pt-1 border-t border-slate-100">
                <div className="flex justify-between">
                  <span className="text-slate-400">License:</span>
                  <span className="font-mono font-medium text-slate-800">{p.license_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Fee:</span>
                  <span className="font-semibold text-slate-900">{currencySymbol}{Number(p.consultation_fee).toFixed(2)}</span>
                </div>
                {p.departments?.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Department:</span>
                    <span className="text-slate-800 truncate max-w-[160px]">{p.departments[0].name}</span>
                  </div>
                )}
              </div>

              <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400">
                <span>View Full Profile & Schedule →</span>
                {p.is_credential_verified && (
                  <span className="text-teal-700 flex items-center gap-0.5 font-medium">
                    <ShieldCheck className="w-3.5 h-3.5" /> Verified
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Register Provider Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Register Healthcare Provider</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {errorMessage && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Title</label>
                  <select
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                  >
                    <option value="Dr.">Dr.</option>
                    <option value="Prof.">Prof.</option>
                    <option value="Mr.">Mr.</option>
                    <option value="Ms.">Ms.</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">First Name</label>
                  <input
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Specialization / Clinical Focus *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Cardiology & Preventive Care"
                    value={formData.specialization}
                    onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Specialty Taxonomy</label>
                  <select
                    value={formData.specialtyId}
                    onChange={(e) => setFormData({ ...formData, specialtyId: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                  >
                    <option value="">-- Select specialty --</option>
                    {specialties.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">License / Registration Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. GMC-9482104"
                    value={formData.licenseNumber}
                    onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Consultation Fee ({currencySymbol})</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.consultationFee}
                    onChange={(e) => setFormData({ ...formData, consultationFee: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Professional Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Department Assignment</label>
                  <select
                    value={formData.departmentId}
                    onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                  >
                    <option value="">-- Choose department --</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Academic Qualifications</label>
                <input
                  type="text"
                  placeholder="e.g. MBBS, MRCP, FACC"
                  value={formData.qualifications}
                  onChange={(e) => setFormData({ ...formData, qualifications: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-1.5 bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold rounded-lg shadow-xs disabled:opacity-50"
                >
                  {formSubmitting ? 'Registering...' : 'Register Provider'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
