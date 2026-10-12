/**
 * CLINILYNC Appointments Management & Scheduling Workspace
 * 
 * Supports:
 * - /app/appointments: Clinical Calendar & Agenda Schedule
 * - /app/appointments/new: Guided Multi-Step Booking Intake
 * - /app/appointments/:appointmentId: Appointment 360 View & Lifecycle Transitions
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../api/client.js';
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Filter,
  Stethoscope,
  Building2,
  Phone,
  FileText,
  RotateCcw,
  UserCheck,
  Play,
  ArrowRight
} from 'lucide-react';

interface AppointmentsViewProps {
  currentPath: string;
  appointmentIdParam?: string | null;
  onNavigate: (path: string) => void;
}

export const AppointmentsView: React.FC<AppointmentsViewProps> = ({ currentPath, appointmentIdParam, onNavigate }) => {
  const { activeOrganization, hasPermission } = useAuth();

  // Core Data
  const [appointments, setAppointments] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [appointmentTypes, setAppointmentTypes] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Calendar Date
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [providerFilter, setProviderFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Single Appointment Detail Modal State
  const [selectedApt, setSelectedApt] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Cancellation Modal State
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Reschedule Modal State
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('10:00');
  const [rescheduleProviderId, setRescheduleProviderId] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  // Guided Booking Flow State (/app/appointments/new)
  const isBookingNew = currentPath === '/app/appointments/new';
  const [bookingStep, setBookingStep] = useState<1 | 2 | 3 | 4>(1);
  const [bookingPatientSearch, setBookingPatientSearch] = useState('');
  const [bookingPatient, setBookingPatient] = useState<any | null>(null);
  const [bookingProviderId, setBookingProviderId] = useState('');
  const [bookingDeptId, setBookingDeptId] = useState('');
  const [bookingTypeId, setBookingTypeId] = useState('');
  const [bookingDate, setBookingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [bookingSlotTime, setBookingSlotTime] = useState('');
  const [bookingReason, setBookingReason] = useState('');
  const [bookingSlots, setBookingSlots] = useState<any[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [bookingConflictError, setBookingConflictError] = useState<string | null>(null);
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);

  useEffect(() => {
    loadFoundationalData();
  }, [activeOrganization?.id]);

  useEffect(() => {
    if (!isBookingNew) {
      loadAppointments();
    }
  }, [activeOrganization?.id, selectedDate, providerFilter, departmentFilter, statusFilter, isBookingNew]);

  useEffect(() => {
    if (appointmentIdParam) {
      loadAppointmentDetails(appointmentIdParam);
    } else {
      setSelectedApt(null);
    }
  }, [appointmentIdParam, activeOrganization?.id]);

  // When in booking flow, fetch slots when provider or date changes
  useEffect(() => {
    if (isBookingNew && bookingProviderId && bookingDate) {
      loadBookingSlots();
    }
  }, [isBookingNew, bookingProviderId, bookingDate, bookingTypeId]);

  const loadFoundationalData = async () => {
    try {
      const [provRes, deptRes, typesRes, patRes] = await Promise.all([
        api.v1GetProviders({ status: 'ACTIVE' }).catch(() => ({ providers: [] })),
        api.v1GetDepartments({ status: 'ACTIVE' }).catch(() => ({ departments: [] })),
        api.v1GetAppointmentTypes().catch(() => ({ appointmentTypes: [] })),
        api.v1GetPatients({ limit: 100 }).catch(() => ({ patients: [] }))
      ]);
      setProviders(provRes.providers || []);
      setDepartments(deptRes.departments || []);
      setAppointmentTypes(typesRes.appointmentTypes || []);
      setPatients(patRes.patients || []);

      if (provRes.providers?.length > 0 && !bookingProviderId) {
        setBookingProviderId(provRes.providers[0].id);
      }
      if (typesRes.appointmentTypes?.length > 0 && !bookingTypeId) {
        setBookingTypeId(typesRes.appointmentTypes[0].id);
      }
    } catch (err) {
      console.warn('Failed to load foundational appointment metadata:', err);
    }
  };

  const loadAppointments = async () => {
    setLoading(true);
    try {
      const res = await api.v1GetAppointments({
        startDate: selectedDate ? `${selectedDate}T00:00:00.000Z` : undefined,
        endDate: selectedDate ? `${selectedDate}T23:59:59.999Z` : undefined,
        providerId: providerFilter || undefined,
        departmentId: departmentFilter || undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined
      });
      setAppointments(res.appointments || []);
    } catch (err) {
      console.error('Failed to load appointments:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAppointmentDetails = async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await api.v1GetAppointment(id);
      setSelectedApt(res.appointment);
    } catch (err) {
      console.error('Failed to load appointment details:', err);
      setSelectedApt(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const loadBookingSlots = async () => {
    setLoadingSlots(true);
    setBookingSlotTime('');
    try {
      const selectedType = appointmentTypes.find(t => t.id === bookingTypeId);
      const duration = selectedType?.duration_minutes || 30;
      const res = await api.v1GetProviderAvailableSlots(bookingProviderId, bookingDate, duration);
      setBookingSlots(res.slots || []);
    } catch (err) {
      console.error('Failed to load slots:', err);
      setBookingSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  // Date controls
  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const handleToday = () => {
    setSelectedDate(new Date().toISOString().slice(0, 10));
  };

  // Lifecycle Transitions
  const handleConfirm = async (id: string) => {
    try {
      await api.v1ConfirmAppointment(id);
      await loadAppointments();
      if (selectedApt) await loadAppointmentDetails(id);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCheckIn = async (id: string) => {
    try {
      await api.v1CheckInAppointment(id);
      await loadAppointments();
      if (selectedApt) await loadAppointmentDetails(id);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleStartConsultation = async (id: string) => {
    try {
      await api.v1StartAppointment(id);
      await loadAppointments();
      if (selectedApt) await loadAppointmentDetails(id);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleComplete = async (id: string) => {
    try {
      await api.v1CompleteAppointment(id);
      await loadAppointments();
      if (selectedApt) await loadAppointmentDetails(id);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleNoShow = async (id: string) => {
    if (!confirm('Mark this appointment as No-Show?')) return;
    try {
      await api.v1NoShowAppointment(id);
      await loadAppointments();
      if (selectedApt) await loadAppointmentDetails(id);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApt || !cancelReason) return;
    try {
      await api.v1CancelAppointment(selectedApt.id, cancelReason);
      setShowCancelModal(false);
      setCancelReason('');
      await loadAppointments();
      await loadAppointmentDetails(selectedApt.id);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApt || !rescheduleDate || !rescheduleTime) return;
    setRescheduleError(null);
    try {
      const scheduledIso = `${rescheduleDate}T${rescheduleTime}:00.000Z`;
      await api.v1RescheduleAppointment(selectedApt.id, {
        newScheduledTime: scheduledIso,
        newProviderId: rescheduleProviderId || selectedApt.provider_id,
        reason: rescheduleReason
      });
      setShowRescheduleModal(false);
      await loadAppointments();
      await loadAppointmentDetails(selectedApt.id);
    } catch (err: any) {
      setRescheduleError(err.message || 'Rescheduling failed.');
    }
  };

  // Guided Booking Submission
  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingPatient || !bookingProviderId || !bookingSlotTime) return;

    setIsSubmittingBooking(true);
    setBookingConflictError(null);
    try {
      const scheduledIso = `${bookingDate}T${bookingSlotTime}:00.000Z`;
      const selectedType = appointmentTypes.find(t => t.id === bookingTypeId);

      await api.v1CreateAppointment({
        patientId: bookingPatient.id,
        providerId: bookingProviderId,
        departmentId: bookingDeptId || undefined,
        appointmentTypeId: bookingTypeId || undefined,
        scheduledTime: scheduledIso,
        durationMinutes: selectedType?.duration_minutes || 30,
        reasonForVisit: bookingReason || null
      });

      onNavigate('/app/appointments');
    } catch (err: any) {
      setBookingConflictError(err.message || 'Booking conflict encountered.');
    } finally {
      setIsSubmittingBooking(false);
    }
  };

  const filteredPatients = patients.filter(p => {
    if (!bookingPatientSearch) return true;
    const q = bookingPatientSearch.toLowerCase();
    return (
      p.first_name.toLowerCase().includes(q) ||
      p.last_name.toLowerCase().includes(q) ||
      p.mrn.toLowerCase().includes(q) ||
      (p.phone && p.phone.includes(q))
    );
  });

  const currencySymbol = activeOrganization?.currency_code === 'USD' ? '$' : '£';

  // ==========================================
  // VIEW MODE: /app/appointments/new (GUIDED INTAKE)
  // ==========================================
  if (isBookingNew) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <button
          onClick={() => onNavigate('/app/appointments')}
          className="inline-flex items-center gap-1.5 text-xs text-teal-700 hover:text-teal-900 font-semibold"
        >
          <ChevronLeft className="w-4 h-4" />
          Cancel & Return to Calendar
        </button>

        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-6">
          {/* Header & Step Indicator */}
          <div className="border-b border-slate-100 pb-4">
            <h1 className="text-xl font-bold text-slate-900">Schedule New Clinical Appointment</h1>
            <p className="text-xs text-slate-500">Atomic, conflict-preventing multi-step booking engine.</p>

            <div className="flex items-center gap-2 mt-4 text-xs font-semibold">
              {[
                { step: 1, label: '1. Patient' },
                { step: 2, label: '2. Provider & Unit' },
                { step: 3, label: '3. Time Slot' },
                { step: 4, label: '4. Review & Confirm' }
              ].map((s) => (
                <div
                  key={s.step}
                  className={`px-3 py-1 rounded-full ${
                    bookingStep === s.step
                      ? 'bg-teal-700 text-white font-bold'
                      : bookingStep > s.step
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {s.label}
                </div>
              ))}
            </div>
          </div>

          {bookingConflictError && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold">Booking Conflict Detected:</strong>
                <p className="mt-0.5">{bookingConflictError}</p>
                <p className="mt-1 text-[11px] text-rose-700">Please choose a different time slot or another attending provider.</p>
              </div>
            </div>
          )}

          {/* STEP 1: Select Patient */}
          {bookingStep === 1 && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-slate-800">Step 1: Select Patient from Active Roster</h2>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search patient name, MRN, or phone..."
                  value={bookingPatientSearch}
                  onChange={(e) => setBookingPatientSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-teal-600 focus:outline-none"
                />
              </div>

              <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto border border-slate-200 rounded-lg">
                {filteredPatients.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => setBookingPatient(p)}
                    className={`p-3 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                      bookingPatient?.id === p.id ? 'bg-teal-50 border-teal-300' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-slate-900">{p.first_name} {p.last_name}</div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        MRN: {p.mrn} · DOB: {p.date_of_birth} · {p.phone || 'No phone'}
                      </div>
                    </div>
                    {bookingPatient?.id === p.id && (
                      <span className="text-teal-700 font-bold">Selected ✓</span>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="button"
                  disabled={!bookingPatient}
                  onClick={() => setBookingStep(2)}
                  className="px-5 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold rounded-lg shadow-xs disabled:opacity-40 flex items-center gap-1.5"
                >
                  <span>Next: Choose Provider</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Provider & Department */}
          {bookingStep === 2 && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-slate-800">Step 2: Select Provider & Clinical Department</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Attending Clinician *</label>
                  <select
                    value={bookingProviderId}
                    onChange={(e) => setBookingProviderId(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="">-- Choose clinician --</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.display_name || `${p.title} ${p.first_name} ${p.last_name}`} — {p.specialization}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Clinical Department</label>
                  <select
                    value={bookingDeptId}
                    onChange={(e) => setBookingDeptId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="">-- Optional / General Suite --</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Appointment Type & Protocol *</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {appointmentTypes.map((at) => (
                    <div
                      key={at.id}
                      onClick={() => setBookingTypeId(at.id)}
                      className={`p-3 rounded-lg border text-xs cursor-pointer transition-colors ${
                        bookingTypeId === at.id ? 'bg-teal-50 border-teal-600 font-semibold' : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">{at.name}</span>
                        <span className="font-mono text-slate-500">{at.duration_minutes} min</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{at.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setBookingStep(1)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={!bookingProviderId || !bookingTypeId}
                  onClick={() => setBookingStep(3)}
                  className="px-5 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold rounded-lg shadow-xs disabled:opacity-40 flex items-center gap-1.5"
                >
                  <span>Next: Choose Time Slot</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Slot Calculator */}
          {bookingStep === 3 && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 className="text-sm font-bold text-slate-800">Step 3: Select Date & Available Time Slot</h2>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-slate-600">Date:</label>
                  <input
                    type="date"
                    value={bookingDate}
                    onChange={(e) => setBookingDate(e.target.value)}
                    className="px-2.5 py-1 border border-slate-300 rounded text-xs text-slate-800 font-mono"
                  />
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between text-xs text-slate-500 pb-2 border-b border-slate-200">
                  <span>Available slots computed from provider schedule & active conflict checks.</span>
                  <span className="font-mono">Timezone: Europe/London</span>
                </div>

                {loadingSlots ? (
                  <div className="p-8 text-center text-xs text-slate-400">Evaluating provider availability...</div>
                ) : bookingSlots.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    No available working shifts scheduled for this provider on {bookingDate}.
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 pt-3">
                    {bookingSlots.map((slot, idx) => (
                      <button
                        key={idx}
                        type="button"
                        disabled={!slot.isAvailable}
                        onClick={() => setBookingSlotTime(slot.timeString)}
                        className={`p-2.5 rounded-lg border text-center text-xs transition-all ${
                          !slot.isAvailable
                            ? 'bg-slate-100 text-slate-400 border-slate-200 line-through cursor-not-allowed opacity-50'
                            : bookingSlotTime === slot.timeString
                            ? 'bg-teal-700 text-white font-bold border-teal-700 shadow-xs'
                            : 'bg-white hover:bg-teal-50 border-slate-200 text-slate-800 font-medium'
                        }`}
                      >
                        <div className="font-mono text-xs">{slot.timeString}</div>
                        <div className="text-[10px] mt-0.5">{slot.isAvailable ? 'Open' : 'Booked'}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setBookingStep(2)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={!bookingSlotTime}
                  onClick={() => setBookingStep(4)}
                  className="px-5 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold rounded-lg shadow-xs disabled:opacity-40 flex items-center gap-1.5"
                >
                  <span>Next: Review & Confirm</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Review & Confirm */}
          {bookingStep === 4 && (
            <form onSubmit={handleBookingSubmit} className="space-y-4">
              <h2 className="text-sm font-bold text-slate-800">Step 4: Review Appointment Details & Confirm</h2>

              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-500">Patient:</span>
                  <span className="font-bold text-slate-900">{bookingPatient?.first_name} {bookingPatient?.last_name} (MRN: {bookingPatient?.mrn})</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-500">Provider:</span>
                  <span className="font-bold text-slate-900">
                    {providers.find(p => p.id === bookingProviderId)?.display_name || 'Selected Provider'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-500">Appointment Type:</span>
                  <span className="font-semibold text-slate-900">
                    {appointmentTypes.find(t => t.id === bookingTypeId)?.name}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-500">Scheduled Time:</span>
                  <span className="font-mono font-bold text-teal-800">
                    {bookingDate} at {bookingSlotTime} UTC (Europe/London)
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Department:</span>
                  <span className="text-slate-900">
                    {departments.find(d => d.id === bookingDeptId)?.name || 'General Outpatient'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for Visit / Clinical Notes</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Follow-up on hypertension management and ECG telemetry review..."
                  value={bookingReason}
                  onChange={(e) => setBookingReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setBookingStep(3)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingBooking}
                  className="px-6 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-lg shadow-xs disabled:opacity-50"
                >
                  {isSubmittingBooking ? 'Reserving...' : 'Confirm & Schedule Appointment'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW MODE: /app/appointments (CALENDAR & WORKSPACE)
  // ==========================================
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Clinical Appointments Calendar</h1>
          <p className="text-xs text-slate-500">
            {activeOrganization?.name} · Enterprise scheduling workspace and daily consultation queue
          </p>
        </div>

        {hasPermission('appointment.create') && (
          <button
            onClick={() => onNavigate('/app/appointments/new')}
            className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors self-start sm:self-center"
          >
            <Plus className="w-4 h-4" />
            <span>Book Appointment</span>
          </button>
        )}
      </div>

      {/* Date Navigation & Filters Header */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
        {/* Date Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevDay}
            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={handleToday}
            className="px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200"
          >
            Today
          </button>
          <button
            onClick={handleNextDay}
            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-2.5 py-1 border border-slate-200 rounded-lg font-mono text-xs text-slate-800"
          />

          <span className="text-slate-400 font-mono text-[11px] hidden sm:inline">
            ({new Date(selectedDate).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })})
          </span>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <select
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-700"
          >
            <option value="">All Clinicians</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>{p.display_name || p.specialization}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-700"
          >
            <option value="ALL">All Statuses</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="CHECKED_IN">Checked In</option>
            <option value="IN_PROGRESS">In Consultation</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="NO_SHOW">No Show</option>
          </select>
        </div>
      </div>

      {/* Daily Schedule Agenda / Cards */}
      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400">Loading daily appointments roster...</div>
      ) : appointments.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-3">
          <CalendarIcon className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="text-sm font-bold text-slate-700">No Appointments Scheduled for this Date</h3>
          <p className="text-xs text-slate-400">There are no consultations matching the filters on {selectedDate}.</p>
          {hasPermission('appointment.create') && (
            <button
              onClick={() => onNavigate('/app/appointments/new')}
              className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold shadow-xs inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Schedule Appointment</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {appointments.map((apt) => {
            const timeStr = new Date(apt.scheduled_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            return (
              <div
                key={apt.id}
                className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-teal-400 transition-colors"
              >
                <div className="flex items-start gap-3.5">
                  <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-center shrink-0">
                    <div className="text-xs font-bold font-mono text-slate-900">{timeStr}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{apt.duration_minutes} min</div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">{apt.patientName}</span>
                      <span className="font-mono text-[11px] text-slate-400">[{apt.patientMrn}]</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        apt.status === 'CONFIRMED' ? 'bg-sky-50 text-sky-800 border border-sky-200' :
                        apt.status === 'CHECKED_IN' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                        apt.status === 'IN_PROGRESS' ? 'bg-teal-50 text-teal-800 border border-teal-200' :
                        apt.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                        apt.status === 'CANCELLED' ? 'bg-rose-50 text-rose-800 border border-rose-200 line-through' :
                        'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}>
                        {apt.status}
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 flex flex-wrap items-center gap-3">
                      <span className="flex items-center gap-1 text-teal-800 font-medium">
                        <Stethoscope className="w-3.5 h-3.5" />
                        {apt.providerName}
                      </span>
                      {apt.departmentName && (
                        <span className="flex items-center gap-1 text-slate-500">
                          <Building2 className="w-3.5 h-3.5" />
                          {apt.departmentName}
                        </span>
                      )}
                      <span className="text-[11px] text-slate-400">
                        Type: {apt.appointmentTypeName}
                      </span>
                    </div>

                    {apt.reason_for_visit && (
                      <p className="text-xs text-slate-500 italic pt-0.5">
                        "{apt.reason_for_visit}"
                      </p>
                    )}
                  </div>
                </div>

                {/* Quick Lifecycle Action Buttons */}
                <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                  {apt.status === 'SCHEDULED' && hasPermission('appointment.confirm') && (
                    <button
                      onClick={() => handleConfirm(apt.id)}
                      className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 rounded text-xs font-semibold"
                    >
                      Confirm
                    </button>
                  )}

                  {(apt.status === 'SCHEDULED' || apt.status === 'CONFIRMED') && hasPermission('appointment.check_in') && (
                    <button
                      onClick={() => handleCheckIn(apt.id)}
                      className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded text-xs font-semibold"
                    >
                      Check In
                    </button>
                  )}

                  {apt.status === 'CHECKED_IN' && hasPermission('appointment.start') && (
                    <button
                      onClick={() => handleStartConsultation(apt.id)}
                      className="px-2.5 py-1 bg-teal-700 hover:bg-teal-800 text-white rounded text-xs font-semibold flex items-center gap-1"
                    >
                      <Play className="w-3 h-3" />
                      <span>Start</span>
                    </button>
                  )}

                  {apt.status === 'IN_PROGRESS' && hasPermission('appointment.complete') && (
                    <button
                      onClick={() => handleComplete(apt.id)}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold"
                    >
                      Complete
                    </button>
                  )}

                  <button
                    onClick={() => onNavigate(`/app/appointments/${apt.id}`)}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium"
                  >
                    Details
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================== */}
      {/* APPOINTMENT DETAILS MODAL / DRAWER */}
      {/* ========================================== */}
      {selectedApt && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Appointment Details</h3>
                <span className="font-mono text-[11px] text-slate-400">{selectedApt.id}</span>
              </div>
              <button onClick={() => onNavigate('/app/appointments')} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Current Status:</span>
                <span className="font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                  {selectedApt.status}
                </span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Scheduled Date & Time:</span>
                <span className="font-mono font-bold text-slate-900">
                  {new Date(selectedApt.scheduled_time).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })}
                </span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Attending Clinician:</span>
                <span className="font-semibold text-slate-900">
                  {providers.find(p => p.id === selectedApt.provider_id)?.display_name || selectedApt.provider_id}
                </span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Duration & Protocol:</span>
                <span className="text-slate-800">{selectedApt.duration_minutes} minutes ({selectedApt.appointment_type})</span>
              </div>

              {selectedApt.reason_for_visit && (
                <div className="py-1.5">
                  <span className="text-slate-500 block mb-0.5">Reason for Visit:</span>
                  <p className="p-2.5 bg-slate-50 rounded border border-slate-200 text-slate-800">
                    {selectedApt.reason_for_visit}
                  </p>
                </div>
              )}

              {selectedApt.cancellation_reason && (
                <div className="py-1.5">
                  <span className="text-rose-600 font-semibold block mb-0.5">Cancellation Reason:</span>
                  <p className="p-2.5 bg-rose-50 rounded border border-rose-200 text-rose-800">
                    {selectedApt.cancellation_reason}
                  </p>
                </div>
              )}
            </div>

            {/* Lifecycle Action Buttons */}
            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {selectedApt.status !== 'CANCELLED' && selectedApt.status !== 'COMPLETED' && hasPermission('appointment.reschedule') && (
                  <button
                    onClick={() => {
                      setRescheduleDate(new Date(selectedApt.scheduled_time).toISOString().slice(0, 10));
                      setRescheduleProviderId(selectedApt.provider_id);
                      setShowRescheduleModal(true);
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold"
                  >
                    Reschedule
                  </button>
                )}

                {selectedApt.status !== 'CANCELLED' && selectedApt.status !== 'COMPLETED' && hasPermission('appointment.cancel') && (
                  <button
                    onClick={() => setShowCancelModal(true)}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold"
                  >
                    Cancel
                  </button>
                )}

                {(selectedApt.status === 'SCHEDULED' || selectedApt.status === 'CONFIRMED') && hasPermission('appointment.no_show') && (
                  <button
                    onClick={() => handleNoShow(selectedApt.id)}
                    className="px-3 py-1.5 text-slate-500 hover:text-slate-700 text-xs"
                  >
                    Mark No-Show
                  </button>
                )}
              </div>

              <button
                onClick={() => onNavigate('/app/appointments')}
                className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-60 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Cancel Appointment</h3>
            <form onSubmit={handleCancelSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Cancellation Reason *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Document reason for patient or provider cancellation..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Return
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg shadow-xs"
                >
                  Confirm Cancellation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {showRescheduleModal && (
        <div className="fixed inset-0 z-60 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Reschedule Appointment</h3>

            {rescheduleError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
                {rescheduleError}
              </div>
            )}

            <form onSubmit={handleRescheduleSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">New Date *</label>
                <input
                  type="date"
                  required
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">New Time (UTC) *</label>
                <input
                  type="time"
                  required
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Clinician</label>
                <select
                  value={rescheduleProviderId}
                  onChange={(e) => setRescheduleProviderId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>{p.display_name || p.specialization}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for Rescheduling</label>
                <input
                  type="text"
                  placeholder="e.g. Patient schedule change request"
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRescheduleModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold rounded-lg shadow-xs"
                >
                  Reschedule Slot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
