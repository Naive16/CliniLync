/**
 * CLINILYNC Patient Management, Registration & Profiles (/app/patients)
 * 
 * Phase 6 Implementation:
 * - Staff Patient Intake Registration (/app/patients/new)
 * - Permission-Aware Patient Roster & Search (/app/patients)
 * - Patient Profile 360 View (/app/patients/:patientId)
 * - Patient Profile Editing (/app/patients/:patientId/edit)
 * - Emergency Contact Management (Add/Delete/View)
 * - Informed Consent Foundation (General Treatment, Telehealth, Data Sharing, Research)
 * - Lifecycle Status Management & Archiving (Reason required, server audit logged)
 * - Scoped strictly to active organization with RBAC enforcement
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../api/client.js';
import {
  Users,
  Search,
  Plus,
  User,
  Phone,
  Mail,
  Calendar,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Heart,
  FileText,
  Edit3,
  Archive,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Globe,
  MapPin,
  UserCheck,
  ArrowLeft,
  Trash2,
  Lock,
  ChevronRight,
  Sparkles,
  ClipboardList,
  AlertCircle
} from 'lucide-react';

interface PatientsViewProps {
  currentPath?: string;
  patientIdParam?: string | null;
  onNavigate: (path: string) => void;
}

export const PatientsView: React.FC<PatientsViewProps> = ({ currentPath = '/app/patients', patientIdParam, onNavigate }) => {
  const { user, activeOrganization, hasPermission } = useAuth();

  // Route mode: 'list' | 'new' | 'profile' | 'edit'
  const isNewRoute = currentPath === '/app/patients/new';
  const isEditRoute = currentPath.endsWith('/edit');
  const targetPatientId = patientIdParam || (currentPath.match(/\/app\/patients\/([a-zA-Z0-9_]+)/)?.[1] || null);
  const isProfileRoute = !isNewRoute && targetPatientId && targetPatientId !== 'new' && !isEditRoute;

  // List State
  const [patients, setPatients] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'INACTIVE' | 'ARCHIVED' | 'ALL'>('ACTIVE');
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  // Profile State
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [consents, setConsents] = useState<any[]>([]);
  const [primaryProvider, setPrimaryProvider] = useState<any | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Modals & Sub-forms
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusUpdateTarget, setStatusUpdateTarget] = useState<'ACTIVE' | 'INACTIVE' | 'ARCHIVED' | 'DECEASED'>('ARCHIVED');
  const [statusReason, setStatusReason] = useState('');
  const [statusSubmitting, setStatusSubmitting] = useState(false);

  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [newContact, setNewContact] = useState({
    name: '',
    relationship: 'Spouse',
    phone: '',
    email: '',
    isEmergencyContact: true,
    hasLegalAuthority: false
  });
  const [contactSubmitting, setContactSubmitting] = useState(false);

  const [showAddConsentModal, setShowAddConsentModal] = useState(false);
  const [newConsent, setNewConsent] = useState({
    consentType: 'GENERAL_TREATMENT',
    purpose: 'Standard outpatient examination, diagnostic procedures, and general medical care authorization',
    notes: 'Signed and recorded by attending clinician'
  });
  const [consentSubmitting, setConsentSubmitting] = useState(false);

  // Intake / Registration Form State
  const [intakeForm, setIntakeForm] = useState({
    firstName: '',
    lastName: '',
    dateOfBirth: '1990-01-15',
    gender: 'FEMALE',
    bloodGroup: 'O_POSITIVE',
    email: '',
    phone: '',
    addressLine1: '',
    city: activeOrganization?.country_code === 'GBR' ? 'London' : 'New York',
    postalCode: '',
    preferredLanguage: 'en',
    contactPreference: 'EMAIL',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelationship: 'Spouse',
    allergiesSummary: '',
    consentGranted: true,
    consentType: 'GENERAL_TREATMENT'
  });
  const [intakeSubmitting, setIntakeSubmitting] = useState(false);
  const [intakeError, setIntakeError] = useState<string | null>(null);

  // Profile Edit State
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    gender: 'MALE',
    bloodGroup: 'A_POSITIVE',
    email: '',
    phone: '',
    addressLine1: '',
    city: '',
    postalCode: '',
    preferredLanguage: 'en',
    contactPreference: 'EMAIL',
    allergiesSummary: ''
  });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Load patient list when on list route or when filter/org changes
  useEffect(() => {
    loadPatients();
  }, [activeOrganization?.id, search, statusFilter]);

  // Load patient profile when id param is present
  useEffect(() => {
    if (targetPatientId && targetPatientId !== 'new') {
      loadPatientDetails(targetPatientId);
    }
  }, [targetPatientId, activeOrganization?.id]);

  const loadPatients = async () => {
    setLoading(true);
    try {
      const res = await api.v1GetPatients({
        search: search.trim() || undefined,
        status: statusFilter,
        page: 1,
        limit: 50
      });
      setPatients(res.patients || []);
      setTotalCount(res.pagination?.total || (res.patients || []).length);
    } catch (err) {
      console.error('Failed to load patients list:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadPatientDetails = async (id: string) => {
    setProfileLoading(true);
    setProfileError(null);
    try {
      const res = await api.v1GetPatient(id);
      setSelectedPatient(res.patient);
      setContacts(res.contacts || []);
      setConsents(res.consents || []);
      setPrimaryProvider(res.primaryProvider || null);

      // Populate edit form
      setEditForm({
        firstName: res.patient.first_name || '',
        lastName: res.patient.last_name || '',
        dateOfBirth: res.patient.date_of_birth || '',
        gender: res.patient.gender || 'MALE',
        bloodGroup: res.patient.blood_group || 'O_POSITIVE',
        email: res.patient.email || '',
        phone: res.patient.phone || '',
        addressLine1: res.patient.address_line1 || '',
        city: res.patient.city || '',
        postalCode: res.patient.postal_code || '',
        preferredLanguage: res.patient.preferred_language || 'en',
        contactPreference: res.patient.contact_preference || 'EMAIL',
        allergiesSummary: res.patient.allergies_summary || ''
      });
    } catch (err: any) {
      setProfileError(err?.message || 'Failed to load patient record.');
    } finally {
      setProfileLoading(false);
    }
  };

  // Submit Intake Registration
  const handleRegisterIntake = async (e: React.FormEvent) => {
    e.preventDefault();
    setIntakeError(null);
    setIntakeSubmitting(true);

    try {
      const payload: Record<string, unknown> = {
        firstName: intakeForm.firstName,
        lastName: intakeForm.lastName,
        dateOfBirth: intakeForm.dateOfBirth,
        gender: intakeForm.gender,
        bloodGroup: intakeForm.bloodGroup || null,
        email: intakeForm.email || null,
        phone: intakeForm.phone || null,
        addressLine1: intakeForm.addressLine1 || null,
        city: intakeForm.city || null,
        postalCode: intakeForm.postalCode || null,
        preferredLanguage: intakeForm.preferredLanguage,
        contactPreference: intakeForm.contactPreference,
        emergencyContactName: intakeForm.emergencyContactName || null,
        emergencyContactPhone: intakeForm.emergencyContactPhone || null,
        emergencyContactRelationship: intakeForm.emergencyContactRelationship,
        allergiesSummary: intakeForm.allergiesSummary || null
      };

      if (intakeForm.consentGranted) {
        payload.initialConsent = {
          consentType: intakeForm.consentType,
          purpose: 'General healthcare consultation, medical intake, and data confidentiality acknowledgement',
          notes: 'Signed during digital intake'
        };
      }

      const res = await api.v1CreatePatient(payload);
      await loadPatients();
      onNavigate(`/app/patients/${res.patient.id}`);
    } catch (err: any) {
      setIntakeError(err?.message || 'Patient registration failed.');
    } finally {
      setIntakeSubmitting(false);
    }
  };

  // Submit Profile Edit
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;
    setEditError(null);
    setEditSubmitting(true);

    try {
      const res = await api.v1UpdatePatient(selectedPatient.id, {
        firstName: editForm.firstName,
        lastName: editForm.lastName,
        dateOfBirth: editForm.dateOfBirth,
        gender: editForm.gender,
        bloodGroup: editForm.bloodGroup,
        email: editForm.email,
        phone: editForm.phone,
        addressLine1: editForm.addressLine1,
        city: editForm.city,
        postalCode: editForm.postalCode,
        preferredLanguage: editForm.preferredLanguage,
        contactPreference: editForm.contactPreference,
        allergiesSummary: editForm.allergiesSummary
      });

      setSelectedPatient(res.patient);
      await loadPatients();
      onNavigate(`/app/patients/${selectedPatient.id}`);
    } catch (err: any) {
      setEditError(err?.message || 'Failed to update profile.');
    } finally {
      setEditSubmitting(false);
    }
  };

  // Change Lifecycle Status (Archive / Unarchive / Deceased)
  const handleUpdateStatus = async () => {
    if (!selectedPatient) return;
    setStatusSubmitting(true);
    try {
      const res = await api.v1UpdatePatientStatus(selectedPatient.id, statusUpdateTarget, statusReason);
      setSelectedPatient(res.patient);
      setShowStatusModal(false);
      setStatusReason('');
      await loadPatients();
    } catch (err: any) {
      alert(`Status transition failed: ${err.message}`);
    } finally {
      setStatusSubmitting(false);
    }
  };

  // Add Emergency Contact
  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;
    setContactSubmitting(true);
    try {
      await api.v1AddPatientContact(selectedPatient.id, newContact);
      setShowAddContactModal(false);
      setNewContact({
        name: '',
        relationship: 'Spouse',
        phone: '',
        email: '',
        isEmergencyContact: true,
        hasLegalAuthority: false
      });
      await loadPatientDetails(selectedPatient.id);
    } catch (err: any) {
      alert(`Failed to add contact: ${err.message}`);
    } finally {
      setContactSubmitting(false);
    }
  };

  // Delete Contact
  const handleDeleteContact = async (contactId: string) => {
    if (!selectedPatient) return;
    if (!confirm('Remove this emergency contact?')) return;
    try {
      await api.v1DeletePatientContact(selectedPatient.id, contactId);
      await loadPatientDetails(selectedPatient.id);
    } catch (err: any) {
      alert(`Failed to remove contact: ${err.message}`);
    }
  };

  // Record Consent
  const handleAddConsent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;
    setConsentSubmitting(true);
    try {
      await api.v1AddPatientConsent(selectedPatient.id, newConsent);
      setShowAddConsentModal(false);
      await loadPatientDetails(selectedPatient.id);
    } catch (err: any) {
      alert(`Failed to record consent: ${err.message}`);
    } finally {
      setConsentSubmitting(false);
    }
  };

  // Revoke Consent
  const handleRevokeConsent = async (consentId: string) => {
    if (!selectedPatient) return;
    if (!confirm('Revoke this patient consent record? This action is permanent and recorded in the audit log.')) return;
    try {
      await api.v1RevokePatientConsent(selectedPatient.id, consentId);
      await loadPatientDetails(selectedPatient.id);
    } catch (err: any) {
      alert(`Failed to revoke consent: ${err.message}`);
    }
  };

  // -------------------------------------------------------------
  // VIEW: NEW PATIENT INTAKE FORM (/app/patients/new)
  // -------------------------------------------------------------
  if (isNewRoute) {
    if (!hasPermission('patient.create')) {
      return (
        <div className="p-8 max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-start gap-3">
            <Lock className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-red-900">Access Restricted</h3>
              <p className="text-xs text-red-700 mt-1">
                Your assigned role does not grant the required permission (<code>patient.create</code>) to register new patients.
              </p>
              <button
                onClick={() => onNavigate('/app/patients')}
                className="mt-3 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-900 text-xs font-semibold rounded"
              >
                Return to Directory
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Header Breadcrumb */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate('/app/patients')}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              title="Back to patient directory"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Patient Registration & EMR Intake</h1>
              <p className="text-xs text-slate-500">
                Organization Scoped · {activeOrganization?.name} ({activeOrganization?.id})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] px-2.5 py-1 bg-teal-50 border border-teal-200 text-teal-800 rounded-full font-medium flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
              <span>RLAC Protected</span>
            </span>
          </div>
        </div>

        {intakeError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{intakeError}</span>
          </div>
        )}

        <form onSubmit={handleRegisterIntake} className="bg-white rounded-xl border border-slate-200 shadow-xs divide-y divide-slate-100">
          {/* Section 1: Demographics */}
          <div className="p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <User className="w-4 h-4 text-teal-700" />
              <span>1. Legal Demographics</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">First Name *</label>
                <input
                  type="text"
                  required
                  value={intakeForm.firstName}
                  onChange={e => setIntakeForm({ ...intakeForm, firstName: e.target.value })}
                  placeholder="e.g. Eleanor"
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Last Name *</label>
                <input
                  type="text"
                  required
                  value={intakeForm.lastName}
                  onChange={e => setIntakeForm({ ...intakeForm, lastName: e.target.value })}
                  placeholder="e.g. Vance"
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Date of Birth *</label>
                <input
                  type="date"
                  required
                  value={intakeForm.dateOfBirth}
                  onChange={e => setIntakeForm({ ...intakeForm, dateOfBirth: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Sex Assigned at Birth / Gender *</label>
                <select
                  value={intakeForm.gender}
                  onChange={e => setIntakeForm({ ...intakeForm, gender: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 focus:outline-none bg-white"
                >
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other / Non-binary</option>
                  <option value="UNKNOWN">Undisclosed</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Blood Group</label>
                <select
                  value={intakeForm.bloodGroup}
                  onChange={e => setIntakeForm({ ...intakeForm, bloodGroup: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 focus:outline-none bg-white"
                >
                  <option value="O_POSITIVE">O Positive (O+)</option>
                  <option value="O_NEGATIVE">O Negative (O-)</option>
                  <option value="A_POSITIVE">A Positive (A+)</option>
                  <option value="A_NEGATIVE">A Negative (A-)</option>
                  <option value="B_POSITIVE">B Positive (B+)</option>
                  <option value="B_NEGATIVE">B Negative (B-)</option>
                  <option value="AB_POSITIVE">AB Positive (AB+)</option>
                  <option value="AB_NEGATIVE">AB Negative (AB-)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Known Allergies Summary</label>
                <input
                  type="text"
                  value={intakeForm.allergiesSummary}
                  onChange={e => setIntakeForm({ ...intakeForm, allergiesSummary: e.target.value })}
                  placeholder="e.g. Penicillin, Latex, None recorded"
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Contact Preferences & Global Localization */}
          <div className="p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Globe className="w-4 h-4 text-teal-700" />
              <span>2. Contact Preferences & Language Localization</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Primary Email</label>
                <input
                  type="email"
                  value={intakeForm.email}
                  onChange={e => setIntakeForm({ ...intakeForm, email: e.target.value })}
                  placeholder="patient@example.com"
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Primary Telephone</label>
                <input
                  type="tel"
                  value={intakeForm.phone}
                  onChange={e => setIntakeForm({ ...intakeForm, phone: e.target.value })}
                  placeholder="+44 7700 900123"
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Preferred Language</label>
                <select
                  value={intakeForm.preferredLanguage}
                  onChange={e => setIntakeForm({ ...intakeForm, preferredLanguage: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 focus:outline-none bg-white"
                >
                  <option value="en">English (en)</option>
                  <option value="es">Spanish / Español (es)</option>
                  <option value="fr">French / Français (fr)</option>
                  <option value="de">German / Deutsch (de)</option>
                  <option value="ar">Arabic / العربية (ar)</option>
                  <option value="zh">Mandarin Chinese / 中文 (zh)</option>
                  <option value="pt">Portuguese / Português (pt)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Method Preference</label>
                <select
                  value={intakeForm.contactPreference}
                  onChange={e => setIntakeForm({ ...intakeForm, contactPreference: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 focus:outline-none bg-white"
                >
                  <option value="EMAIL">Email Notifications</option>
                  <option value="PHONE">Telephone Call</option>
                  <option value="SMS">SMS Text Message</option>
                  <option value="POSTAL">Postal Mail</option>
                </select>
              </div>

              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Street Address</label>
                  <input
                    type="text"
                    value={intakeForm.addressLine1}
                    onChange={e => setIntakeForm({ ...intakeForm, addressLine1: e.target.value })}
                    placeholder="12 Baker Street"
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
                  <input
                    type="text"
                    value={intakeForm.city}
                    onChange={e => setIntakeForm({ ...intakeForm, city: e.target.value })}
                    placeholder="London"
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Postal Code</label>
                  <input
                    type="text"
                    value={intakeForm.postalCode}
                    onChange={e => setIntakeForm({ ...intakeForm, postalCode: e.target.value })}
                    placeholder="W1U 3BW"
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Emergency Contact Details */}
          <div className="p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Phone className="w-4 h-4 text-teal-700" />
              <span>3. Primary Emergency Contact</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Full Name</label>
                <input
                  type="text"
                  value={intakeForm.emergencyContactName}
                  onChange={e => setIntakeForm({ ...intakeForm, emergencyContactName: e.target.value })}
                  placeholder="e.g. Jonathan Vance"
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Relationship</label>
                <select
                  value={intakeForm.emergencyContactRelationship}
                  onChange={e => setIntakeForm({ ...intakeForm, emergencyContactRelationship: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 focus:outline-none bg-white"
                >
                  <option value="Spouse">Spouse / Partner</option>
                  <option value="Parent">Parent / Guardian</option>
                  <option value="Child">Adult Child</option>
                  <option value="Sibling">Sibling</option>
                  <option value="Caregiver">Designated Caregiver</option>
                  <option value="Next of Kin">Next of Kin</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Emergency Phone</label>
                <input
                  type="tel"
                  value={intakeForm.emergencyContactPhone}
                  onChange={e => setIntakeForm({ ...intakeForm, emergencyContactPhone: e.target.value })}
                  placeholder="+44 7700 900999"
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Initial Informed Consent Foundation */}
          <div className="p-6 space-y-4 bg-slate-50/50">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-teal-700" />
              <span>4. Informed Consent Record Foundation</span>
            </h2>

            <div className="p-4 bg-white rounded-lg border border-slate-200 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={intakeForm.consentGranted}
                  onChange={e => setIntakeForm({ ...intakeForm, consentGranted: e.target.checked })}
                  className="mt-0.5 rounded text-teal-700 focus:ring-teal-600"
                />
                <div className="text-xs">
                  <span className="font-semibold text-slate-900 block">
                    Record Initial Informed Consent Authorization
                  </span>
                  <span className="text-slate-600">
                    Patient has acknowledged the organization's treatment terms, telehealth evaluation protocols, and statutory health data privacy notice.
                  </span>
                </div>
              </label>

              {intakeForm.consentGranted && (
                <div className="pt-2 border-t border-slate-100 flex items-center gap-4 text-xs">
                  <span className="font-semibold text-slate-700">Consent Domain:</span>
                  <select
                    value={intakeForm.consentType}
                    onChange={e => setIntakeForm({ ...intakeForm, consentType: e.target.value })}
                    className="px-2.5 py-1 border border-slate-300 rounded text-xs bg-white"
                  >
                    <option value="GENERAL_TREATMENT">General Clinical Care & Treatment</option>
                    <option value="TELEHEALTH">Telehealth Encounters & Remote Telemetry</option>
                    <option value="DATA_SHARING">Secure Health Information Exchange</option>
                    <option value="RESEARCH">Anonymized Clinical Research</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Form Actions */}
          <div className="p-6 bg-slate-50 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onNavigate('/app/patients')}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
            >
              Cancel & Return
            </button>

            <button
              type="submit"
              disabled={intakeSubmitting}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-xs transition-colors disabled:opacity-50"
            >
              {intakeSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Registering Intake...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Complete Patient Registration</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW: EDIT PATIENT PROFILE (/app/patients/:patientId/edit)
  // -------------------------------------------------------------
  if (isEditRoute) {
    if (!hasPermission('patient.update')) {
      return (
        <div className="p-8 max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-start gap-3">
            <Lock className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-red-900">Access Restricted</h3>
              <p className="text-xs text-red-700 mt-1">
                Your assigned role does not grant <code>patient.update</code> permission to edit patient profiles.
              </p>
              <button
                onClick={() => onNavigate(`/app/patients/${targetPatientId}`)}
                className="mt-3 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-900 text-xs font-semibold rounded"
              >
                Back to Profile
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate(`/app/patients/${targetPatientId}`)}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Edit Patient Profile</h1>
              <p className="text-xs text-slate-500 font-mono">MRN: {selectedPatient?.mrn || 'Loading...'}</p>
            </div>
          </div>
        </div>

        {editError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{editError}</span>
          </div>
        )}

        <form onSubmit={handleUpdateProfile} className="bg-white rounded-xl border border-slate-200 shadow-xs divide-y divide-slate-100 p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">First Name *</label>
              <input
                type="text"
                required
                value={editForm.firstName}
                onChange={e => setEditForm({ ...editForm, firstName: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Last Name *</label>
              <input
                type="text"
                required
                value={editForm.lastName}
                onChange={e => setEditForm({ ...editForm, lastName: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Date of Birth *</label>
              <input
                type="date"
                required
                value={editForm.dateOfBirth}
                onChange={e => setEditForm({ ...editForm, dateOfBirth: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Gender</label>
              <select
                value={editForm.gender}
                onChange={e => setEditForm({ ...editForm, gender: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
                <option value="UNKNOWN">Unknown</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Blood Group</label>
              <input
                type="text"
                value={editForm.bloodGroup}
                onChange={e => setEditForm({ ...editForm, bloodGroup: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Preferred Language</label>
              <select
                value={editForm.preferredLanguage}
                onChange={e => setEditForm({ ...editForm, preferredLanguage: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="en">English (en)</option>
                <option value="es">Spanish (es)</option>
                <option value="fr">French (fr)</option>
                <option value="de">German (de)</option>
                <option value="ar">Arabic (ar)</option>
                <option value="zh">Mandarin (zh)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Preference</label>
              <select
                value={editForm.contactPreference}
                onChange={e => setEditForm({ ...editForm, contactPreference: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="EMAIL">Email</option>
                <option value="PHONE">Phone</option>
                <option value="SMS">SMS</option>
                <option value="POSTAL">Postal</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={editForm.email}
                onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone</label>
              <input
                type="tel"
                value={editForm.phone}
                onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Street Address</label>
              <input
                type="text"
                value={editForm.addressLine1}
                onChange={e => setEditForm({ ...editForm, addressLine1: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
              <input
                type="text"
                value={editForm.city}
                onChange={e => setEditForm({ ...editForm, city: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Postal Code</label>
              <input
                type="text"
                value={editForm.postalCode}
                onChange={e => setEditForm({ ...editForm, postalCode: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Allergies Summary</label>
              <input
                type="text"
                value={editForm.allergiesSummary}
                onChange={e => setEditForm({ ...editForm, allergiesSummary: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="pt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onNavigate(`/app/patients/${targetPatientId}`)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={editSubmitting}
              className="px-5 py-2 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors"
            >
              {editSubmitting ? 'Saving...' : 'Save Profile Changes'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW: INDIVIDUAL PATIENT 360 PROFILE (/app/patients/:patientId)
  // -------------------------------------------------------------
  if (isProfileRoute) {
    if (profileLoading) {
      return (
        <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
          <div className="w-6 h-6 border-2 border-teal-700 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-semibold">Resolving organization-scoped patient chart...</span>
        </div>
      );
    }

    if (profileError || !selectedPatient) {
      return (
        <div className="p-8 max-w-3xl mx-auto space-y-4">
          <div className="p-6 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-red-900">Patient Not Available</h3>
              <p className="text-xs text-red-700 mt-1">
                {profileError || 'The requested patient could not be resolved within your active organization.'}
              </p>
              <p className="text-[11px] text-red-600 mt-2">
                Under Clinilync multi-tenant policy, patient records belonging to foreign organizations are strictly concealed.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('/app/patients')}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Directory</span>
          </button>
        </div>
      );
    }

    const isArchived = selectedPatient.status === 'ARCHIVED';

    return (
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Top Breadcrumb & Action Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate('/app/patients')}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              title="Back to patient roster"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  {selectedPatient.first_name} {selectedPatient.last_name}
                </h1>
                <span className="font-mono text-xs px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-200 rounded">
                  {selectedPatient.mrn}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  isArchived
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : selectedPatient.status === 'ACTIVE'
                    ? 'bg-teal-100 text-teal-800 border border-teal-300'
                    : 'bg-slate-100 text-slate-700'
                }`}>
                  {selectedPatient.status || 'ACTIVE'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Patient Identifier: <span className="font-mono text-[11px]">{selectedPatient.id}</span> · Organization: {activeOrganization?.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate(`/app/patients/${selectedPatient.id}/medical-record`)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg shadow-xs transition-colors"
            >
              <FileText className="w-3.5 h-3.5 text-teal-700" />
              <span>Medical Record</span>
            </button>

            {hasPermission('problem_list.view') && (
              <button
                onClick={() => onNavigate(`/app/patients/${selectedPatient.id}/problems`)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg shadow-xs transition-colors"
              >
                <AlertCircle className="w-3.5 h-3.5 text-amber-700" />
                <span>Problem List</span>
              </button>
            )}

            {hasPermission('care_plan.view') && (
              <button
                onClick={() => onNavigate(`/app/patients/${selectedPatient.id}/care-plans`)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-800 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-lg shadow-xs transition-colors"
              >
                <ClipboardList className="w-3.5 h-3.5 text-indigo-700" />
                <span>Care Plans</span>
              </button>
            )}

            <button
              onClick={() => onNavigate(`/app/encounters/new?patientId=${selectedPatient.id}`)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Encounter</span>
            </button>

            {hasPermission('patient.update') && (
              <button
                onClick={() => onNavigate(`/app/patients/${selectedPatient.id}/edit`)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-xs transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                <span>Edit Profile</span>
              </button>
            )}

            {hasPermission('patient.archive') && (
              <button
                onClick={() => {
                  setStatusUpdateTarget(isArchived ? 'ACTIVE' : 'ARCHIVED');
                  setShowStatusModal(true);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg shadow-xs transition-colors ${
                  isArchived
                    ? 'text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100'
                    : 'text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100'
                }`}
              >
                <Archive className="w-3.5 h-3.5" />
                <span>{isArchived ? 'Restore Patient' : 'Archive Record'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Archival Notice Banner if Archived */}
        {isArchived && (
          <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-3">
            <Archive className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <span className="font-bold text-amber-900 block">Patient Record is Archived</span>
              <p className="text-amber-800">
                Reason: <strong>{selectedPatient.archived_reason || 'Administrative Archival'}</strong>
              </p>
              <div className="text-[11px] text-amber-700 font-mono">
                Archived at: {selectedPatient.archived_at ? new Date(selectedPatient.archived_at).toLocaleString() : 'Recent'} · By Officer: {selectedPatient.archived_by || 'Staff'}
              </div>
            </div>
          </div>
        )}

        {/* Top Demographics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Birth & Biology</span>
            <div className="text-sm font-semibold text-slate-900">DOB: {selectedPatient.date_of_birth}</div>
            <div className="text-xs text-slate-500">
              Gender: {selectedPatient.gender} · Blood: <strong className="text-teal-800">{selectedPatient.blood_group || 'Unrecorded'}</strong>
            </div>
          </div>

          <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Contact Coordinates</span>
            <div className="text-xs font-semibold text-slate-900 truncate">{selectedPatient.email || 'No email on file'}</div>
            <div className="text-xs text-slate-500">{selectedPatient.phone || 'No phone recorded'}</div>
          </div>

          <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Language & Preferences</span>
            <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-teal-600" />
              <span>Language: {selectedPatient.preferred_language?.toUpperCase() || 'EN'}</span>
            </div>
            <div className="text-xs text-slate-500">
              Preference: <strong className="text-slate-700">{selectedPatient.contact_preference || 'EMAIL'}</strong>
            </div>
          </div>

          <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Attending Provider</span>
            <div className="text-xs font-semibold text-slate-900">
              {primaryProvider ? `Dr. ${primaryProvider.first_name} ${primaryProvider.last_name}` : 'Unassigned'}
            </div>
            <div className="text-xs text-slate-500">
              {primaryProvider?.specialization || 'General Care'}
            </div>
          </div>
        </div>

        {/* Two Column Section: Left = Emergency Contacts, Right = Consents */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Card: Emergency Contacts */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-teal-700" />
                <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Emergency Contacts & Guardians
                </h2>
              </div>
              {hasPermission('patient.update') && (
                <button
                  onClick={() => setShowAddContactModal(true)}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded border border-teal-200 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Contact</span>
                </button>
              )}
            </div>

            <div className="p-5 flex-1 space-y-3">
              {contacts.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">
                  No emergency contacts registered for this patient.
                </div>
              ) : (
                contacts.map((c) => (
                  <div key={c.id} className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900">{c.name}</span>
                        <span className="text-[10px] px-2 py-0.5 bg-slate-200 text-slate-700 rounded-full font-medium">
                          {c.relationship}
                        </span>
                        {c.has_legal_authority && (
                          <span className="text-[10px] px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full font-medium">
                            Legal POA
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-600 flex items-center gap-3">
                        <span className="font-mono">{c.phone}</span>
                        {c.email && <span>· {c.email}</span>}
                      </div>
                    </div>

                    {hasPermission('patient.update') && (
                      <button
                        onClick={() => handleDeleteContact(c.id)}
                        className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                        title="Delete contact"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Card: Informed Consents */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-teal-700" />
                <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Informed Consent Records
                </h2>
              </div>
              {hasPermission('patient.update') && (
                <button
                  onClick={() => setShowAddConsentModal(true)}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded border border-teal-200 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  <span>Record Consent</span>
                </button>
              )}
            </div>

            <div className="p-5 flex-1 space-y-3">
              {consents.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">
                  No consent records on file.
                </div>
              ) : (
                consents.map((cs) => {
                  const isRevoked = cs.status === 'REVOKED';
                  return (
                    <div key={cs.id} className={`p-3.5 rounded-lg border flex items-start justify-between ${
                      isRevoked ? 'bg-red-50/30 border-red-200' : 'bg-teal-50/30 border-teal-200'
                    }`}>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900">{cs.consent_type}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                            isRevoked ? 'bg-red-100 text-red-800' : 'bg-teal-100 text-teal-800'
                          }`}>
                            {cs.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700">{cs.purpose}</p>
                        <div className="text-[10px] text-slate-500 font-mono">
                          Recorded: {new Date(cs.granted_at).toLocaleDateString()} · By Officer: {cs.recorded_by_user_id}
                          {isRevoked && cs.revoked_at && ` · Revoked: ${new Date(cs.revoked_at).toLocaleDateString()}`}
                        </div>
                      </div>

                      {!isRevoked && hasPermission('patient.update') && (
                        <button
                          onClick={() => handleRevokeConsent(cs.id)}
                          className="px-2 py-1 text-[11px] font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded border border-red-200 transition-colors"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Modal: Status Change / Archiving */}
        {showStatusModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="font-bold text-sm text-slate-900">
                  {statusUpdateTarget === 'ARCHIVED' ? 'Archive Patient Record' : 'Update Lifecycle Status'}
                </h3>
                <button onClick={() => setShowStatusModal(false)} className="text-slate-400 hover:text-slate-600">
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Target Status</label>
                  <select
                    value={statusUpdateTarget}
                    onChange={e => setStatusUpdateTarget(e.target.value as any)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="ACTIVE">ACTIVE (Patient receiving ongoing care)</option>
                    <option value="INACTIVE">INACTIVE (Dormant outpatient record)</option>
                    <option value="ARCHIVED">ARCHIVED (Permanently preserved historical chart)</option>
                    <option value="DECEASED">DECEASED (Deceased patient)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Clinical / Operational Justification *
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={statusReason}
                    onChange={e => setStatusReason(e.target.value)}
                    placeholder="Provide mandatory reason for status mutation (recorded in HIPAA audit trail)..."
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowStatusModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateStatus}
                  disabled={statusSubmitting || !statusReason.trim()}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors disabled:opacity-50"
                >
                  {statusSubmitting ? 'Mutating Status...' : 'Confirm Status Mutation'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Add Emergency Contact */}
        {showAddContactModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="font-bold text-sm text-slate-900">Add Emergency Contact</h3>
                <button onClick={() => setShowAddContactModal(false)} className="text-slate-400 hover:text-slate-600">
                  ✕
                </button>
              </div>

              <form onSubmit={handleAddContact} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Full Legal Name *</label>
                  <input
                    type="text"
                    required
                    value={newContact.name}
                    onChange={e => setNewContact({ ...newContact, name: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Relationship *</label>
                  <select
                    value={newContact.relationship}
                    onChange={e => setNewContact({ ...newContact, relationship: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Spouse">Spouse / Partner</option>
                    <option value="Parent">Parent / Guardian</option>
                    <option value="Child">Adult Child</option>
                    <option value="Sibling">Sibling</option>
                    <option value="Caregiver">Caregiver</option>
                    <option value="Legal Guardian">Legal Guardian</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Telephone *</label>
                  <input
                    type="tel"
                    required
                    value={newContact.phone}
                    onChange={e => setNewContact({ ...newContact, phone: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email (Optional)</label>
                  <input
                    type="email"
                    value={newContact.email}
                    onChange={e => setNewContact({ ...newContact, email: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="pt-1 flex items-center gap-4 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newContact.isEmergencyContact}
                      onChange={e => setNewContact({ ...newContact, isEmergencyContact: e.target.checked })}
                    />
                    <span>Primary Emergency Contact</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newContact.hasLegalAuthority}
                      onChange={e => setNewContact({ ...newContact, hasLegalAuthority: e.target.checked })}
                    />
                    <span>Medical Power of Attorney</span>
                  </label>
                </div>

                <div className="pt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddContactModal(false)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={contactSubmitting}
                    className="px-4 py-1.5 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors"
                  >
                    {contactSubmitting ? 'Saving...' : 'Add Contact'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Add Consent */}
        {showAddConsentModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="font-bold text-sm text-slate-900">Record Informed Consent</h3>
                <button onClick={() => setShowAddConsentModal(false)} className="text-slate-400 hover:text-slate-600">
                  ✕
                </button>
              </div>

              <form onSubmit={handleAddConsent} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Consent Domain *</label>
                  <select
                    value={newConsent.consentType}
                    onChange={e => setNewConsent({ ...newConsent, consentType: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="GENERAL_TREATMENT">GENERAL_TREATMENT (Inpatient/Outpatient Care)</option>
                    <option value="TELEHEALTH">TELEHEALTH (Remote Consultations)</option>
                    <option value="DATA_SHARING">DATA_SHARING (HIE / Health Systems)</option>
                    <option value="RESEARCH">RESEARCH (Clinical Trials)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Specific Purpose *</label>
                  <textarea
                    rows={3}
                    required
                    value={newConsent.purpose}
                    onChange={e => setNewConsent({ ...newConsent, purpose: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Clinical Notes (Optional)</label>
                  <input
                    type="text"
                    value={newConsent.notes}
                    onChange={e => setNewConsent({ ...newConsent, notes: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="pt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddConsentModal(false)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={consentSubmitting}
                    className="px-4 py-1.5 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors"
                  >
                    {consentSubmitting ? 'Recording...' : 'Record Consent'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW: PATIENT DIRECTORY & ROSTER LIST (/app/patients)
  // -------------------------------------------------------------
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner / Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Patient Directory & Registration</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Organization Scoped · {activeOrganization?.name} ({activeOrganization?.id})
          </p>
        </div>

        <div className="flex items-center gap-3">
          {hasPermission('patient.create') && (
            <button
              onClick={() => onNavigate('/app/patients/new')}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Register New Patient</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search by patient name, MRN, email, or telephone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 pl-9 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-semibold">Status:</span>
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs font-semibold">
            {(['ACTIVE', 'INACTIVE', 'ARCHIVED', 'ALL'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-md transition-colors ${
                  statusFilter === s ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Patients Table Roster */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Patient Records</span>
          <span className="text-xs text-slate-500 font-mono tabular-nums">{totalCount} Found in Active Organization</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
            <div className="w-5 h-5 border-2 border-teal-700 border-t-transparent rounded-full animate-spin" />
            <span>Retrieving patient roster...</span>
          </div>
        ) : patients.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400 space-y-2">
            <Users className="w-8 h-8 text-slate-300 mx-auto" />
            <p>No patient records found matching query criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="px-5 py-3">Patient Name</th>
                  <th className="px-4 py-3">MRN</th>
                  <th className="px-4 py-3">Birth & Sex</th>
                  <th className="px-4 py-3">Contact Coordinates</th>
                  <th className="px-4 py-3">Language & Pref</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {patients.map((p) => {
                  const isArchived = p.status === 'ARCHIVED';
                  return (
                    <tr
                      key={p.id}
                      onClick={() => onNavigate(`/app/patients/${p.id}`)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    >
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-900 group-hover:text-teal-700 transition-colors">
                          {p.first_name} {p.last_name}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">{p.id}</div>
                      </td>

                      <td className="px-4 py-3.5 font-mono text-slate-700 font-medium">
                        {p.mrn}
                      </td>

                      <td className="px-4 py-3.5 text-slate-600">
                        <div>{p.date_of_birth}</div>
                        <div className="text-[11px] text-slate-400">{p.gender} · {p.blood_group || 'Blood N/A'}</div>
                      </td>

                      <td className="px-4 py-3.5 text-slate-600">
                        <div>{p.phone || 'No phone'}</div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[150px]">{p.email || 'No email'}</div>
                      </td>

                      <td className="px-4 py-3.5 text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-700">
                            {p.preferred_language?.toUpperCase() || 'EN'}
                          </span>
                          <span className="text-[11px] text-slate-500">{p.contact_preference || 'EMAIL'}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          isArchived
                            ? 'bg-amber-100 text-amber-800'
                            : p.status === 'ACTIVE'
                            ? 'bg-teal-100 text-teal-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {p.status || (p.is_active ? 'ACTIVE' : 'INACTIVE')}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 group-hover:translate-x-0.5 transition-transform">
                          <span>View Chart</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
