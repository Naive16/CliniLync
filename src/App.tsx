/**
 * CLINILYNC - Global Healthcare Management Platform
 * Phase 6 Master Application & Routing Architecture
 * 
 * Supports:
 * - /app/patients: Patient directory & roster
 * - /app/patients/new: Patient intake registration
 * - /app/patients/:patientId: Patient profile 360 view
 * - /app/patients/:patientId/edit: Patient profile editor
 * - /verification: Comprehensive Security & RBAC Verification Console
 * - /patient, /patient/profile: Future Patient Portal Foundations
 * - /login: Authentication surface
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { LoginView } from './views/LoginView.js';
import { PatientsView } from './views/StaffApp/PatientsView.js';
import { ProvidersView } from './views/StaffApp/ProvidersView.js';
import { DepartmentsView } from './views/StaffApp/DepartmentsView.js';
import { AppointmentsView } from './views/StaffApp/AppointmentsView.js';
import { EncountersView } from './views/StaffApp/EncountersView.js';
import { PatientMedicalRecordView } from './views/StaffApp/PatientMedicalRecordView.js';
import { PatientProblemsView } from './views/StaffApp/PatientProblemsView.js';
import { CarePlansView } from './views/StaffApp/CarePlansView.js';
import { PatientMedicationsView } from './views/StaffApp/PatientMedicationsView.js';
import { PrescriptionsView } from './views/StaffApp/PrescriptionsView.js';
import { Phase5VerificationView } from './views/Phase5VerificationView.js';
import { PatientPortalView } from './views/PatientPortal/PatientPortalView.js';
import { Header } from './components/common/Header.js';
import { SecurityTesterModal } from './components/common/SecurityTesterModal.js';

function AppContent() {
  const { user, isLoading } = useAuth();
  const [currentPath, setCurrentPath] = useState<string>(() => {
    const p = window.location.pathname;
    return p === '/' ? '/app/patients' : p;
  });
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);

  // Sync with browser back/forward history
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    window.scrollTo(0, 0);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-slate-600">
        <div className="flex items-center gap-3 bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
          <div className="w-5 h-5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-semibold">Validating session security context...</span>
        </div>
      </div>
    );
  }

  // Unauthenticated -> Login View
  if (!user || currentPath === '/login') {
    return <LoginView onNavigate={navigate} />;
  }

  // Parse ID parameters from path if present
  const patientIdMatch = currentPath.match(/\/app\/patients\/([a-zA-Z0-9_]+)/);
  const patientId = patientIdMatch && patientIdMatch[1] !== 'new' ? patientIdMatch[1] : null;

  const providerIdMatch = currentPath.match(/\/app\/providers\/([a-zA-Z0-9_]+)/);
  const providerId = providerIdMatch ? providerIdMatch[1] : null;

  const appointmentIdMatch = currentPath.match(/\/app\/appointments\/([a-zA-Z0-9_]+)/);
  const appointmentId = appointmentIdMatch && appointmentIdMatch[1] !== 'new' ? appointmentIdMatch[1] : null;

  const encounterIdMatch = currentPath.match(/\/app\/encounters\/([a-zA-Z0-9_]+)/);
  const encounterId = encounterIdMatch && encounterIdMatch[1] !== 'new' ? encounterIdMatch[1] : null;

  const medicalRecordMatch = currentPath.match(/\/app\/patients\/([a-zA-Z0-9_]+)\/medical-record/);
  const medicalRecordPatientId = medicalRecordMatch ? medicalRecordMatch[1] : null;

  const problemsMatch = currentPath.match(/\/app\/patients\/([a-zA-Z0-9_]+)\/problems/);
  const problemsPatientId = problemsMatch ? problemsMatch[1] : null;

  const carePlansMatch = currentPath.match(/\/app\/patients\/([a-zA-Z0-9_]+)\/care-plans/);
  const carePlansPatientId = carePlansMatch ? carePlansMatch[1] : null;

  const medicationsMatch = currentPath.match(/\/app\/patients\/([a-zA-Z0-9_]+)\/medications/);
  const medicationsPatientId = medicationsMatch ? medicationsMatch[1] : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* 3-Zone Sticky Navigation Header */}
      <Header
        currentPath={currentPath}
        onNavigate={navigate}
        onOpenSecurityModal={() => setIsSecurityModalOpen(true)}
      />

      {/* Main Routed Content */}
      <main className="flex-1 pb-16">
        {currentPath.startsWith('/verification') ? (
          <Phase5VerificationView onNavigate={navigate} />
        ) : currentPath.startsWith('/patient') ? (
          <div className="space-y-4">
            <div className="bg-teal-900 text-teal-100 px-6 py-2.5 text-xs text-center border-b border-teal-800 flex items-center justify-center gap-2">
              <span className="font-semibold">Future Patient Portal Preview:</span>
              <span>Patient profile foundations are connected to linked user identities. Clinical encounters, prescriptions, and billing will unlock in upcoming phases.</span>
            </div>
            <PatientPortalView />
          </div>
        ) : problemsPatientId ? (
          <PatientProblemsView
            patientId={problemsPatientId}
            onNavigate={navigate}
          />
        ) : carePlansPatientId ? (
          <CarePlansView
            patientId={carePlansPatientId}
            onNavigate={navigate}
          />
        ) : medicationsPatientId ? (
          <PatientMedicationsView
            patientId={medicationsPatientId}
            onNavigate={navigate}
          />
        ) : medicalRecordPatientId ? (
          <PatientMedicalRecordView
            patientId={medicalRecordPatientId}
            onNavigate={navigate}
          />
        ) : currentPath.startsWith('/app/prescriptions') ? (
          <PrescriptionsView
            currentPath={currentPath}
            onNavigate={navigate}
          />
        ) : currentPath.startsWith('/app/encounters') ? (
          <EncountersView
            currentPath={currentPath}
            encounterIdParam={encounterId}
            onNavigate={navigate}
          />
        ) : currentPath.startsWith('/app/providers') ? (
          <ProvidersView
            currentPath={currentPath}
            providerIdParam={providerId}
            onNavigate={navigate}
          />
        ) : currentPath.startsWith('/app/departments') ? (
          <DepartmentsView
            currentPath={currentPath}
            onNavigate={navigate}
          />
        ) : currentPath.startsWith('/app/appointments') ? (
          <AppointmentsView
            currentPath={currentPath}
            appointmentIdParam={appointmentId}
            onNavigate={navigate}
          />
        ) : (
          <PatientsView
            currentPath={currentPath}
            patientIdParam={patientId}
            onNavigate={navigate}
          />
        )}
      </main>

      {/* Tenancy & RLAC Tester Modal */}
      <SecurityTesterModal
        isOpen={isSecurityModalOpen}
        onClose={() => setIsSecurityModalOpen(false)}
      />
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
