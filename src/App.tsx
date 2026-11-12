/**
 * CLINILYNC - Global Healthcare Management Platform
 * Phase 6 Master Application & Routing Architecture
 * 
 * Supports:
 * - /app/patients: Patient directory & roster
 * - /app/patients/new: Patient intake registration
 * - /app/patients/:patientId: Patient profile 360 view
 * - /app/patients/:patientId/edit: Patient profile editor
 * - /patient, /patient/profile: Future Patient Portal Foundations
 * - /login: Authentication surface
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { LoginView } from './views/LoginView.js';
import { LandingView } from './views/LandingView.js';
import { PatientsView } from './views/StaffApp/PatientsView.js';
import { DashboardView } from './views/StaffApp/DashboardView.js';
import { ClinicalView } from './views/StaffApp/ClinicalView.js';
import { BillingView } from './views/StaffApp/BillingView.js';
import { AnalyticsView } from './views/StaffApp/AnalyticsView.js';
import { SettingsView } from './views/StaffApp/SettingsView.js';
import { AdminPortalView } from './views/Admin/AdminPortalView.js';
import { ProvidersView } from './views/StaffApp/ProvidersView.js';
import { DepartmentsView } from './views/StaffApp/DepartmentsView.js';
import { AppointmentsView } from './views/StaffApp/AppointmentsView.js';
import { EncountersView } from './views/StaffApp/EncountersView.js';
import { PatientMedicalRecordView } from './views/StaffApp/PatientMedicalRecordView.js';
import { PatientProblemsView } from './views/StaffApp/PatientProblemsView.js';
import { CarePlansView } from './views/StaffApp/CarePlansView.js';
import { PatientMedicationsView } from './views/StaffApp/PatientMedicationsView.js';
import { PrescriptionsView } from './views/StaffApp/PrescriptionsView.js';
import { PatientLoginView } from './views/PatientPortal/PatientLoginView.js';
import { PatientPortalShell } from './views/PatientPortal/PatientPortalShell.js';
import { PatientActivationView } from './views/PatientPortal/PatientActivationView.js';
import { Header } from './components/common/Header.js';
import { Sidebar } from './components/common/Sidebar.js';
import { ClinicOnboardingView, ClinicSetupView, InvitationAcceptView, VerifyEmailView } from './views/ClinicOnboardingView.js';

const getRequiredPermission = (path: string): string | null => {
  if (path.startsWith('/app/billing')) return 'billing.view';
  if (path.startsWith('/app/analytics')) return 'report.view';
  if (path.startsWith('/app/prescriptions')) return 'prescription.view';
  if (path.startsWith('/app/encounters') || path.startsWith('/app/clinical')) return 'clinical.view';
  if (path.startsWith('/app/providers')) return 'provider.view';
  if (path.startsWith('/app/departments')) return 'department.view';
  if (path.startsWith('/app/appointments')) return 'appointment.view';
  if (path.startsWith('/app')) return 'patient.view';
  return null;
};

const AccessDeniedView: React.FC<{ permission: string }> = ({ permission }) => (
  <div className="p-6 sm:p-10 max-w-3xl mx-auto">
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
      <h1 className="text-xl font-bold text-slate-900">This page is not available</h1>
      <p className="mt-2 text-sm text-slate-600">
        Your account does not have access to this page. Contact your administrator if you need access.
      </p>
    </div>
  </div>
);

const PortalAccessBoundary: React.FC<{ onNavigate: (path: string) => void }> = ({ onNavigate }) => (
  <div className="min-h-screen bg-slate-50 p-6 sm:p-10">
    <div className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
      <h1 className="text-xl font-bold text-slate-900">This portal is not available for your account</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">Use the sign-in page for the account type that belongs to you. Patient records are only available to their verified patient account.</p>
      <button type="button" onClick={() => onNavigate('/app')} className="mt-5 rounded-lg bg-teal-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-teal-800">Return to clinic workspace</button>
    </div>
  </div>
);

const PatientWorkspaceRedirect: React.FC<{ onNavigate: (path: string) => void }> = ({ onNavigate }) => {
  React.useEffect(() => {
    onNavigate('/patient');
  }, [onNavigate]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-slate-600">
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-xs font-semibold shadow-xs">Opening your patient portal…</div>
    </div>
  );
};

function AppContent() {
  const { user, activeOrganization, roles, isLoading, hasPermission, refreshSession } = useAuth();
  const [currentPath, setCurrentPath] = useState<string>(() => {
    const p = window.location.pathname;
    return p.startsWith('/verification') ? '/app' : p;
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => localStorage.getItem('clinilync_sidebar_collapsed') === 'true');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // Sync with browser back/forward history
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (window.location.pathname.startsWith('/verification')) {
      window.history.replaceState({}, '', '/app');
    }
  }, []);

  useEffect(() => {
    if (!isMobileNavOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMobileNavOpen(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isMobileNavOpen]);

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    setIsMobileNavOpen(false);
    window.scrollTo(0, 0);
  };

  const toggleSidebar = () => {
    setIsSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      localStorage.setItem('clinilync_sidebar_collapsed', String(next));
      return next;
    });
  };

  // Public marketing site is the default route; staff and patient workspaces stay separate.\n  if (currentPath === '/') {\n    return <LandingView onNavigate={navigate} />;\n  }\n\n  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-slate-600">
        <div className="flex items-center gap-3 bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
          <div className="w-5 h-5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-semibold">Checking your session...</span>
        </div>
      </div>
    );
  }

  // Public onboarding routes stay outside the authenticated shell.
  if (currentPath === '/register') {
    return <ClinicOnboardingView onNavigate={navigate} />;
  }
  if (currentPath === '/verify-email') {
    return <VerifyEmailView onNavigate={navigate} />;
  }
  if (currentPath === '/invite') {
    return <InvitationAcceptView onNavigate={navigate} />;
  }

  if (currentPath === '/patient/login') {
    return <PatientLoginView onNavigate={navigate} />;
  }
  if (currentPath === '/patient/activate') {
    return <PatientActivationView onNavigate={navigate} />;
  }

  // Unauthenticated users are sent to the login surface for the route they requested.
  if (!user) {
    return currentPath.startsWith('/patient')
      ? <PatientLoginView onNavigate={navigate} />
      : <LoginView onNavigate={navigate} />;
  }

  if (currentPath === '/login') {
    return <LoginView onNavigate={navigate} />;
  }

  if (activeOrganization?.onboarding_status && activeOrganization.onboarding_status !== 'ACTIVE') {
    return <ClinicSetupView onNavigate={navigate} onActivated={async () => { await refreshSession(); navigate('/app'); }} />;
  }

  const isPatientAccount = roles.some((role) => role.code === 'PATIENT');
  if (isPatientAccount && !currentPath.startsWith('/patient')) {
    return <PatientWorkspaceRedirect onNavigate={navigate} />;
  }
  if (!isPatientAccount && currentPath.startsWith('/patient')) {
    return <PortalAccessBoundary onNavigate={navigate} />;
  }

  if (isPatientAccount && currentPath.startsWith('/patient')) {
    return <PatientPortalShell onNavigate={navigate} />;
  }

  const requiredPermission = getRequiredPermission(currentPath);

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
    <div className={`clinilync-shell ${isSidebarCollapsed ? 'is-sidebar-collapsed' : ''}`}>
      <Sidebar
        currentPath={currentPath}
        onNavigate={navigate}
        isMobileOpen={isMobileNavOpen}
        onCloseMobile={() => setIsMobileNavOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapsed={toggleSidebar}
      />
      <div className={`clinilync-main ${isSidebarCollapsed ? 'is-sidebar-collapsed' : ''}`}>
        <Header
          currentPath={currentPath}
          onOpenMobileNav={() => setIsMobileNavOpen(true)}
        />
        <main className="clinilync-content">
        {requiredPermission && !hasPermission(requiredPermission) ? (
          <AccessDeniedView permission={requiredPermission} />
        ) : currentPath === '/app' ? (
          <DashboardView onNavigate={navigate} />
        ) : currentPath.startsWith('/admin') ? (
          <AdminPortalView />
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
        ) : currentPath.startsWith('/app/clinical') ? (
          <ClinicalView />
        ) : currentPath.startsWith('/app/billing') ? (
          <BillingView />
        ) : currentPath.startsWith('/app/analytics') ? (
          <AnalyticsView />
        ) : currentPath.startsWith('/app/settings') ? (
          <SettingsView />
        ) : (
          <PatientsView
            currentPath={currentPath}
            patientIdParam={patientId}
            onNavigate={navigate}
          />
        )}
        </main>
      </div>

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
