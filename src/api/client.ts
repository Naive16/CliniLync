/**
 * CLINILYNC Unified API Client
 * 
 * Interacts with the backend /api/* routes, maintaining token authorization
 * and organization tenancy context headers.
 */

export interface ApiResponse<T> {
  data?: T;
  error?: {
    code: string;
    message: string;
    status?: number;
  };
}

class ApiClient {
  private token: string | null = null;
  private organizationId: string | null = null;

  constructor() {
    this.token = localStorage.getItem('clinilync_token');
    this.organizationId = localStorage.getItem('clinilync_org_id');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('clinilync_token', token);
    } else {
      localStorage.removeItem('clinilync_token');
    }
  }

  setOrganizationId(orgId: string | null) {
    this.organizationId = orgId;
    if (orgId) {
      localStorage.setItem('clinilync_org_id', orgId);
    } else {
      localStorage.removeItem('clinilync_org_id');
    }
  }

  getToken(): string | null {
    return this.token;
  }

  getOrganizationId(): string | null {
    return this.organizationId;
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers || {});
    headers.set('Content-Type', 'application/json');

    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }

    if (this.organizationId && !headers.has('X-Organization-Id')) {
      headers.set('X-Organization-Id', this.organizationId);
    }

    const res = await fetch(endpoint, {
      credentials: 'include',
      ...options,
      headers
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      const err = new Error(body?.error?.message || `API error (${res.status})`);
      (err as unknown as { status: number; code?: string }).status = res.status;
      (err as unknown as { status: number; code?: string }).code = body?.error?.code || 'UNKNOWN_ERROR';
      throw err;
    }

    // Support both direct responses and standard { data, meta } envelopes
    return (body && typeof body === 'object' && 'data' in body && !('token' in body && !body.data) ? body.data : body) as T;
  }

  // Version 1 Core Protected Endpoints
  async v1Login(email: string, password: string, organizationId?: string) {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, organizationId })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body?.error?.message || 'Login failed');
      (err as unknown as { status: number; code?: string }).status = res.status;
      (err as unknown as { status: number; code?: string }).code = body?.error?.code || 'INVALID_CREDENTIALS';
      throw err;
    }
    return body.data;
  }

  async v1Logout() {
    const res = await fetch('/api/v1/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
      }
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body?.error?.message || 'Logout failed');
      (err as unknown as { status: number; code?: string }).status = res.status;
      throw err;
    }
    return body.data;
  }

  async v1GetSession() {
    return this.request<{
      active: boolean;
      user: { id: string; email: string; firstName: string; lastName: string; isSuperAdmin: boolean };
      activeOrganization: { id: string; name: string };
      roles: { id: string; name: string; code: string }[];
      permissions: string[];
      expiresAt: string;
    }>('/api/v1/auth/session');
  }

  async v1GetMe() {
    return this.request<{
      user: { id: string; email: string; firstName: string; lastName: string; isSuperAdmin: boolean; avatarUrl?: string };
      activeOrganization: { id: string; name: string; currency_code: string; timezone: string; country_code?: string };
      roles: { id: string; name: string; code: string }[];
      permissions: string[];
      availableOrganizations: { id: string; name: string; currency_code: string; timezone: string }[];
    }>('/api/v1/me');
  }

  async v1SwitchOrg(organizationId: string) {
    return this.request<{ activeOrganizationId: string; message: string }>('/api/v1/auth/switch-org', {
      method: 'POST',
      body: JSON.stringify({ organizationId })
    });
  }

  async v1GetOrganizations() {
    return this.request<{ organizations: { id: string; name: string; slug: string; currency_code: string; timezone: string; country_code: string }[] }>('/api/v1/organizations');
  }

  async v1GetMembership(organizationId: string) {
    const res = await fetch(`/api/v1/organizations/${encodeURIComponent(organizationId)}/membership`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
      }
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body?.error?.message || 'Membership query failed');
      (err as unknown as { status: number; code?: string }).status = res.status;
      (err as unknown as { status: number; code?: string }).code = body?.error?.code || 'FORBIDDEN';
      throw err;
    }
    return body.data;
  }

  async v1VerifyAccess(permission?: string, organizationId?: string, resource?: Record<string, unknown>) {
    const res = await fetch('/api/v1/diagnostic/verify-access', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
      },
      body: JSON.stringify({ permission, organizationId, resource })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        allowed: false,
        status: res.status,
        code: body?.error?.code || 'FORBIDDEN',
        message: body?.error?.message || 'Access denied'
      };
    }
    return {
      allowed: true,
      status: 200,
      data: body.data
    };
  }

  async v1GetAuditTrail(limit: number = 30) {
    const res = await fetch(`/api/v1/diagnostic/audit-trail?limit=${limit}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
      }
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body?.error?.message || 'Audit trail query failed');
      (err as unknown as { status: number; code?: string }).status = res.status;
      (err as unknown as { status: number; code?: string }).code = body?.error?.code || 'FORBIDDEN';
      throw err;
    }
    return body.data;
  }

  async v1GetPermissionsMatrix() {
    return this.request<{
      roles: Record<string, string>;
      permissions: Record<string, string>;
      matrix: Record<string, string[]>;
    }>('/api/v1/diagnostic/permissions-matrix');
  }

  // Auth Endpoints (legacy aliases)
  async login(email: string, password: string, organizationId?: string) {
    return this.request<{
      token: string;
      user: { id: string; email: string; firstName: string; lastName: string; isSuperAdmin: boolean; avatarUrl?: string };
      activeOrganization: { id: string; name: string; currency_code: string; timezone: string };
      availableOrganizations: { id: string; name: string }[];
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, organizationId })
    });
  }

  async logout() {
    return this.request<{ success: boolean }>('/api/auth/logout', { method: 'POST' });
  }

  async getMe() {
    return this.request<{
      user: { id: string; email: string; firstName: string; lastName: string; isSuperAdmin: boolean; avatarUrl?: string };
      activeOrganization: { id: string; name: string; currency_code: string; timezone: string; country_code: string };
      roles: { id: string; name: string; code: string }[];
      permissions: string[];
      availableOrganizations: { id: string; name: string; currency_code: string }[];
    }>('/api/auth/me');
  }

  async switchOrg(organizationId: string) {
    return this.request<{ success: boolean; activeOrganizationId: string }>('/api/auth/switch-org', {
      method: 'POST',
      body: JSON.stringify({ organizationId })
    });
  }

  // Patients (v1 Primary Endpoints)
  async v1GetPatients(options: { search?: string; status?: string; page?: number; limit?: number } = {}) {
    const params = new URLSearchParams();
    if (options.search) params.set('search', options.search);
    if (options.status) params.set('status', options.status);
    if (options.page) params.set('page', String(options.page));
    if (options.limit) params.set('limit', String(options.limit));

    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<{
      patients: any[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(`/api/v1/patients${qs}`);
  }

  async v1GetPatient(id: string) {
    return this.request<{
      patient: any;
      contacts: any[];
      consents: any[];
      primaryProvider: any | null;
    }>(`/api/v1/patients/${encodeURIComponent(id)}`);
  }

  async v1CreatePatient(payload: Record<string, unknown>) {
    return this.request<{
      patient: any;
      contacts: any[];
      consents: any[];
    }>('/api/v1/patients', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async v1UpdatePatient(id: string, payload: Record<string, unknown>) {
    return this.request<{ patient: any }>(`/api/v1/patients/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  }

  async v1UpdatePatientStatus(id: string, status: string, reason?: string) {
    return this.request<{ patient: any }>(`/api/v1/patients/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, reason })
    });
  }

  async v1AddPatientContact(id: string, payload: Record<string, unknown>) {
    return this.request<{ contact: any }>(`/api/v1/patients/${encodeURIComponent(id)}/contacts`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async v1DeletePatientContact(id: string, contactId: string) {
    return this.request<{ success: boolean }>(`/api/v1/patients/${encodeURIComponent(id)}/contacts/${encodeURIComponent(contactId)}`, {
      method: 'DELETE'
    });
  }

  async v1AddPatientConsent(id: string, payload: Record<string, unknown>) {
    return this.request<{ consent: any }>(`/api/v1/patients/${encodeURIComponent(id)}/consents`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async v1RevokePatientConsent(id: string, consentId: string) {
    return this.request<{ consent: any }>(`/api/v1/patients/${encodeURIComponent(id)}/consents/${encodeURIComponent(consentId)}/revoke`, {
      method: 'PATCH'
    });
  }

  // Patients (Backward-compatible aliases)
  async getPatients(search?: string) {
    const res = await this.v1GetPatients({ search, status: 'ALL' });
    return {
      patients: res.patients,
      total: res.pagination?.total ?? res.patients.length
    };
  }

  async getPatient(id: string) {
    const res = await this.v1GetPatient(id);
    return {
      patient: res.patient,
      contacts: res.contacts,
      consents: res.consents,
      primaryProvider: res.primaryProvider,
      clinicalSummary: {
        encounters: [],
        diagnoses: [],
        allergies: [],
        recentVitals: []
      }
    };
  }

  async createPatient(payload: Record<string, unknown>) {
    return this.v1CreatePatient(payload);
  }

  // Phase 7: Providers API
  async v1GetProviders(options: { search?: string; specialtyId?: string; departmentId?: string; status?: string } = {}) {
    const params = new URLSearchParams();
    if (options.search) params.set('search', options.search);
    if (options.specialtyId) params.set('specialtyId', options.specialtyId);
    if (options.departmentId) params.set('departmentId', options.departmentId);
    if (options.status) params.set('status', options.status);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<{ providers: any[]; total: number }>(`/api/v1/providers${qs}`);
  }

  async v1GetProvider(id: string) {
    return this.request<{ provider: any; departments: any[]; availability: any[]; exceptions: any[]; specialty: any }>(
      `/api/v1/providers/${encodeURIComponent(id)}`
    );
  }

  async v1CreateProvider(payload: Record<string, unknown>) {
    return this.request<{ provider: any }>('/api/v1/providers', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async v1UpdateProvider(id: string, payload: Record<string, unknown>) {
    return this.request<{ provider: any }>(`/api/v1/providers/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  }

  async v1ArchiveProvider(id: string, reason?: string) {
    return this.request<{ success: boolean; status: string }>(`/api/v1/providers/${encodeURIComponent(id)}/archive`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  }

  async v1GetProviderDepartments(id: string) {
    return this.request<{ departments: any[] }>(`/api/v1/providers/${encodeURIComponent(id)}/departments`);
  }

  async v1AssignProviderDepartment(id: string, departmentId: string, isPrimary: boolean = false) {
    return this.request<{ success: boolean }>(`/api/v1/providers/${encodeURIComponent(id)}/departments`, {
      method: 'POST',
      body: JSON.stringify({ departmentId, isPrimary })
    });
  }

  async v1RemoveProviderDepartment(id: string, departmentId: string) {
    return this.request<{ success: boolean }>(`/api/v1/providers/${encodeURIComponent(id)}/departments/${encodeURIComponent(departmentId)}`, {
      method: 'DELETE'
    });
  }

  async v1GetProviderAvailability(id: string) {
    return this.request<{ availability: any[]; exceptions: any[] }>(`/api/v1/providers/${encodeURIComponent(id)}/availability`);
  }

  async v1SaveProviderAvailability(id: string, schedule: any[]) {
    return this.request<{ success: boolean; count: number }>(`/api/v1/providers/${encodeURIComponent(id)}/availability`, {
      method: 'PUT',
      body: JSON.stringify({ schedule })
    });
  }

  async v1GetProviderAvailableSlots(id: string, date: string, durationMinutes: number = 30) {
    return this.request<{ providerId: string; date: string; slots: any[]; totalSlots: number; availableSlotsCount: number }>(
      `/api/v1/providers/${encodeURIComponent(id)}/available-slots?date=${encodeURIComponent(date)}&durationMinutes=${durationMinutes}`
    );
  }

  // Phase 7: Departments API
  async v1GetDepartments(options: { search?: string; status?: string } = {}) {
    const params = new URLSearchParams();
    if (options.search) params.set('search', options.search);
    if (options.status) params.set('status', options.status);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<{ departments: any[]; total: number }>(`/api/v1/departments${qs}`);
  }

  async v1GetDepartment(id: string) {
    return this.request<{ department: any; assignedProviders: any[] }>(`/api/v1/departments/${encodeURIComponent(id)}`);
  }

  async v1CreateDepartment(payload: Record<string, unknown>) {
    return this.request<{ department: any }>('/api/v1/departments', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async v1UpdateDepartment(id: string, payload: Record<string, unknown>) {
    return this.request<{ department: any }>(`/api/v1/departments/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  }

  async v1DeactivateDepartment(id: string) {
    return this.request<{ success: boolean; isActive: boolean }>(`/api/v1/departments/${encodeURIComponent(id)}/deactivate`, {
      method: 'POST'
    });
  }

  // Phase 7: Appointment Types & Specialties
  async v1GetAppointmentTypes() {
    return this.request<{ appointmentTypes: any[]; total: number }>('/api/v1/appointment-types');
  }

  async v1CreateAppointmentType(payload: Record<string, unknown>) {
    return this.request<{ appointmentType: any }>('/api/v1/appointment-types', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async v1GetSpecialties() {
    return this.request<{ specialties: any[]; total: number }>('/api/v1/specialties');
  }

  // Phase 7: Appointments API (v1 primary)
  async v1GetAppointments(options: {
    startDate?: string;
    endDate?: string;
    providerId?: string;
    departmentId?: string;
    patientId?: string;
    status?: string;
  } = {}) {
    const params = new URLSearchParams();
    if (options.startDate) params.set('startDate', options.startDate);
    if (options.endDate) params.set('endDate', options.endDate);
    if (options.providerId) params.set('providerId', options.providerId);
    if (options.departmentId) params.set('departmentId', options.departmentId);
    if (options.patientId) params.set('patientId', options.patientId);
    if (options.status) params.set('status', options.status);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<{ appointments: any[]; total: number }>(`/api/v1/appointments${qs}`);
  }

  async v1GetAppointment(id: string) {
    return this.request<{ appointment: any; patient: any; provider: any; department: any; appointmentType: any }>(
      `/api/v1/appointments/${encodeURIComponent(id)}`
    );
  }

  async v1CreateAppointment(payload: Record<string, unknown>) {
    return this.request<{ appointment: any }>('/api/v1/appointments', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async v1UpdateAppointment(id: string, payload: Record<string, unknown>) {
    return this.request<{ appointment: any }>(`/api/v1/appointments/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  }

  async v1ConfirmAppointment(id: string) {
    return this.request<{ success: boolean; status: string }>(`/api/v1/appointments/${encodeURIComponent(id)}/confirm`, {
      method: 'POST'
    });
  }

  async v1CheckInAppointment(id: string) {
    return this.request<{ success: boolean; status: string; checkedInAt: string }>(`/api/v1/appointments/${encodeURIComponent(id)}/check-in`, {
      method: 'POST'
    });
  }

  async v1StartAppointment(id: string) {
    return this.request<{ success: boolean; status: string; startedAt: string }>(`/api/v1/appointments/${encodeURIComponent(id)}/start`, {
      method: 'POST'
    });
  }

  async v1CompleteAppointment(id: string) {
    return this.request<{ success: boolean; status: string; completedAt: string }>(`/api/v1/appointments/${encodeURIComponent(id)}/complete`, {
      method: 'POST'
    });
  }

  async v1CancelAppointment(id: string, cancellationReason: string) {
    return this.request<{ success: boolean; status: string; cancellationReason: string }>(`/api/v1/appointments/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ cancellationReason })
    });
  }

  async v1RescheduleAppointment(id: string, payload: { newScheduledTime: string; newProviderId?: string; reason?: string }) {
    return this.request<{ appointment: any }>(`/api/v1/appointments/${encodeURIComponent(id)}/reschedule`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async v1NoShowAppointment(id: string) {
    return this.request<{ success: boolean; status: string; noShowAt: string }>(`/api/v1/appointments/${encodeURIComponent(id)}/no-show`, {
      method: 'POST'
    });
  }

  async v1GetPatientAppointments(patientId: string) {
    return this.request<{ appointments: any[]; total: number }>(`/api/v1/patients/${encodeURIComponent(patientId)}/appointments`);
  }

  // Appointments (Backward-compatible aliases)
  async getAppointments() {
    return this.request<{ appointments: unknown[]; total: number }>('/api/appointments');
  }

  async createAppointment(payload: Record<string, unknown>) {
    return this.request<{ appointment: Record<string, unknown> }>('/api/appointments', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async updateAppointmentStatus(id: string, status: string, cancellationReason?: string) {
    return this.request<{ success: boolean; appointment: Record<string, unknown> }>(`/api/appointments/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, cancellationReason })
    });
  }

  // Clinical EMR
  async getClinicalRecords(patientId?: string) {
    const url = patientId ? `/api/clinical/records?patientId=${patientId}` : '/api/clinical/records';
    return this.request<{ records: unknown[]; total: number }>(url);
  }

  async createClinicalRecord(payload: Record<string, unknown>) {
    return this.request<{ record: Record<string, unknown> }>('/api/clinical/records', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async finalizeClinicalRecord(id: string) {
    return this.request<{ success: boolean; record: Record<string, unknown> }>(`/api/clinical/records/${id}/finalize`, {
      method: 'POST'
    });
  }

  async createPrescription(payload: Record<string, unknown>) {
    return this.request<{ success: boolean; prescriptionId: string }>('/api/clinical/prescriptions', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async createVitals(payload: Record<string, unknown>) {
    return this.request<{ success: boolean; vitalsId: string }>('/api/clinical/vitals', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  // Billing
  async getInvoices(patientId?: string) {
    const url = patientId ? `/api/billing/invoices?patientId=${patientId}` : '/api/billing/invoices';
    return this.request<{ invoices: unknown[]; total: number }>(url);
  }

  async createInvoice(payload: Record<string, unknown>) {
    return this.request<{ invoice: Record<string, unknown> }>('/api/billing/invoices', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async recordPayment(invoiceId: string, payload: Record<string, unknown>) {
    return this.request<{ success: boolean; paymentId: string; newBalanceDue: number; status: string }>(
      `/api/billing/invoices/${invoiceId}/payments`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    );
  }

  // Patient Portal
  async getPortalOverview() {
    return this.request<{
      patient: Record<string, unknown>;
      nextAppointments: unknown[];
      recentEncounters: unknown[];
      activePrescriptions: unknown[];
      latestVitals: Record<string, unknown> | null;
    }>('/api/portal/my-overview');
  }

  async getPortalRecords() {
    return this.request<{
      encounters: unknown[];
      diagnoses: unknown[];
      completedLabOrders: unknown[];
    }>('/api/portal/my-records');
  }

  async getPortalAppointments() {
    return this.request<{ appointments: unknown[] }>('/api/portal/my-appointments');
  }

  async getPortalInvoices() {
    return this.request<{ invoices: unknown[] }>('/api/portal/my-invoices');
  }

  // Admin & Audit
  async getAuditLogs(limit: number = 50) {
    return this.request<{ logs: unknown[]; total: number }>(`/api/admin/audit-logs?limit=${limit}`);
  }

  async getAdminUsers() {
    return this.request<{ users: unknown[] }>('/api/admin/users');
  }

  async getAdminMetrics() {
    return this.request<{
      activePatients: number;
      totalAppointments: number;
      clinicalEncounters: number;
      financialSummary: { invoicesIssued: number; totalBilled: number; outstandingBalance: number };
    }>('/api/admin/metrics');
  }

  // Phase 8 Clinical Encounters, Notes, Observations & Medical Records
  async v1GetEncounters(params: {
    patientId?: string;
    providerId?: string;
    status?: string;
    encounterType?: string;
    startDate?: string;
    endDate?: string;
  } = {}) {
    const sp = new URLSearchParams();
    if (params.patientId) sp.set('patientId', params.patientId);
    if (params.providerId) sp.set('providerId', params.providerId);
    if (params.status) sp.set('status', params.status);
    if (params.encounterType) sp.set('encounterType', params.encounterType);
    if (params.startDate) sp.set('startDate', params.startDate);
    if (params.endDate) sp.set('endDate', params.endDate);
    const query = sp.toString() ? `?${sp.toString()}` : '';
    return this.request<{ encounters: any[]; total: number }>(`/api/v1/encounters${query}`);
  }

  async v1CreateEncounter(data: {
    patientId: string;
    providerId: string;
    appointmentId?: string | null;
    encounterType?: string;
    reasonForVisit?: string;
    timezone?: string;
  }) {
    return this.request<{ encounter: any }>('/api/v1/encounters', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async v1GetEncounter(encounterId: string) {
    return this.request<{ encounter: any; patient: any; provider: any; appointment: any }>(
      `/api/v1/encounters/${encounterId}`
    );
  }

  async v1UpdateEncounter(encounterId: string, data: { reasonForVisit?: string; encounterType?: string }) {
    return this.request<{ encounter: any }>(`/api/v1/encounters/${encounterId}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  async v1StartEncounter(encounterId: string) {
    return this.request<{ encounter: any }>(`/api/v1/encounters/${encounterId}/start`, {
      method: 'POST'
    });
  }

  async v1CompleteEncounter(encounterId: string) {
    return this.request<{ encounter: any }>(`/api/v1/encounters/${encounterId}/complete`, {
      method: 'POST'
    });
  }

  async v1CancelEncounter(encounterId: string, reason?: string) {
    return this.request<{ encounter: any }>(`/api/v1/encounters/${encounterId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  }

  async v1GetEncounterNotes(encounterId: string) {
    return this.request<{ notes: any[]; total: number }>(`/api/v1/encounters/${encounterId}/notes`);
  }

  async v1CreateEncounterNote(encounterId: string, data: Record<string, unknown>) {
    return this.request<{ note: any }>(`/api/v1/encounters/${encounterId}/notes`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async v1GetClinicalNote(noteId: string) {
    return this.request<{ note: any; author: any; signer: any; versions: any[] }>(
      `/api/v1/clinical-notes/${noteId}`
    );
  }

  async v1UpdateDraftNote(noteId: string, data: Record<string, unknown>) {
    return this.request<{ note: any }>(`/api/v1/clinical-notes/${noteId}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  async v1SignClinicalNote(noteId: string) {
    return this.request<{ note: any }>(`/api/v1/clinical-notes/${noteId}/sign`, {
      method: 'POST'
    });
  }

  async v1AmendClinicalNote(noteId: string, data: { amendmentReason: string; [key: string]: unknown }) {
    return this.request<{ note: any }>(`/api/v1/clinical-notes/${noteId}/amend`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async v1GetNoteVersions(noteId: string) {
    return this.request<{ versions: any[]; total: number }>(`/api/v1/clinical-notes/${noteId}/versions`);
  }

  async v1GetEncounterObservations(encounterId: string) {
    return this.request<{ observations: any[]; total: number }>(
      `/api/v1/encounters/${encounterId}/observations`
    );
  }

  async v1RecordObservation(encounterId: string, data: {
    observationType: string;
    numericValue?: number | null;
    textValue?: string | null;
    unit: string;
    notes?: string;
    measuredAt?: string;
  }) {
    return this.request<{ observation: any }>(`/api/v1/encounters/${encounterId}/observations`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async v1GetPatientObservations(patientId: string) {
    return this.request<{ observations: any[]; total: number }>(`/api/v1/patients/${patientId}/observations`);
  }

  async v1GetPatientMedicalRecord(patientId: string) {
    return this.request<{
      patient: any;
      encounters: any[];
      notes: any[];
      observations: any[];
    }>(`/api/v1/patients/${patientId}/medical-record`);
  }

  // ==========================================
  // Phase 10: Medications & Prescriptions API
  // ==========================================

  async v1GetMedicationCatalog(query?: string, form?: string) {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (form) params.set('form', form);
    const qs = params.toString();
    return this.request<any[]>(`/api/v1/medications/catalog${qs ? `?${qs}` : ''}`);
  }

  async v1CreateCatalogEntry(data: any) {
    return this.request<any>('/api/v1/medications/catalog', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async v1GetPatientMedications(patientId: string, status?: string) {
    const qs = status && status !== 'ALL' ? `?status=${status}` : '';
    return this.request<any[]>(`/api/v1/patients/${patientId}/medications${qs}`);
  }

  async v1RecordPatientMedication(patientId: string, data: any) {
    return this.request<any>(`/api/v1/patients/${patientId}/medications`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async v1UpdatePatientMedication(medicationRecordId: string, data: any) {
    return this.request<any>(`/api/v1/patient-medications/${medicationRecordId}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  async v1DiscontinueMedication(medicationRecordId: string, reason: string) {
    return this.request<any>(`/api/v1/patient-medications/${medicationRecordId}/discontinue`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  }

  async v1ReconcileMedications(patientId: string, data: any) {
    return this.request<any>(`/api/v1/patients/${patientId}/medications/reconcile`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async v1GetPatientAllergies(patientId: string) {
    return this.request<any[]>(`/api/v1/patients/${patientId}/allergies`);
  }

  async v1RecordPatientAllergy(patientId: string, data: any) {
    return this.request<any>(`/api/v1/patients/${patientId}/allergies`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async v1UpdatePatientAllergy(allergyId: string, data: any) {
    return this.request<any>(`/api/v1/allergies/${allergyId}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  async v1GetPrescriptions(filters: { patientId?: string; providerId?: string; status?: string } = {}) {
    const params = new URLSearchParams();
    if (filters.patientId) params.set('patientId', filters.patientId);
    if (filters.providerId) params.set('providerId', filters.providerId);
    if (filters.status && filters.status !== 'ALL') params.set('status', filters.status);
    const qs = params.toString();
    return this.request<any[]>(`/api/v1/prescriptions${qs ? `?${qs}` : ''}`);
  }

  async v1CreatePrescription(data: any) {
    return this.request<{ prescription: any; items: any[]; safetyCheck: any }>('/api/v1/prescriptions', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async v1GetPrescriptionDetails(prescriptionId: string) {
    return this.request<{
      prescription: any;
      items: any[];
      patient: any;
      provider: any;
      pharmacy: any;
      dispensations: any[];
      safetyCheck: any;
    }>(`/api/v1/prescriptions/${prescriptionId}`);
  }

  async v1UpdateDraftPrescription(prescriptionId: string, data: any) {
    return this.request<{ prescription: any; items: any[] }>(`/api/v1/prescriptions/${prescriptionId}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  async v1SignPrescription(prescriptionId: string) {
    return this.request<any>(`/api/v1/prescriptions/${prescriptionId}/sign`, {
      method: 'POST'
    });
  }

  async v1CancelPrescription(prescriptionId: string, reason: string) {
    return this.request<any>(`/api/v1/prescriptions/${prescriptionId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  }

  async v1ReplacePrescription(prescriptionId: string, data: any) {
    return this.request<{ original: any; replacement: any; items: any[] }>(`/api/v1/prescriptions/${prescriptionId}/replace`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async v1DispensePrescription(prescriptionId: string, data: any) {
    return this.request<{ dispensation: any; prescription: any }>(`/api/v1/prescriptions/${prescriptionId}/dispense`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async v1EvaluatePrescriptionSafety(patientId: string, items: any[]) {
    return this.request<any>('/api/v1/prescriptions/safety-check', {
      method: 'POST',
      body: JSON.stringify({ patientId, items })
    });
  }

  async v1RecordSafetyOverride(prescriptionId: string, data: any) {
    return this.request<any>(`/api/v1/prescriptions/${prescriptionId}/safety-override`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async v1GetPharmacies() {
    return this.request<any[]>('/api/v1/pharmacies');
  }

  async v1CreatePharmacy(data: any) {
    return this.request<any>('/api/v1/pharmacies', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // -------------------------------------------------------------
  // Phase 9: Diagnoses, Problems, Care Plans & Decision Support
  // -------------------------------------------------------------

  async v1GetEncounterDiagnoses(encounterId: string) {
    return this.request<{ diagnoses: any[]; total: number }>(`/api/v1/encounters/${encodeURIComponent(encounterId)}/diagnoses`);
  }

  async v1RecordEncounterDiagnosis(encounterId: string, payload: any) {
    return this.request<{ diagnosis: any }>(`/api/v1/encounters/${encodeURIComponent(encounterId)}/diagnoses`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async v1UpdateDiagnosis(diagnosisId: string, payload: any) {
    return this.request<{ diagnosis: any }>(`/api/v1/diagnoses/${encodeURIComponent(diagnosisId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  }

  async v1ResolveDiagnosis(diagnosisId: string) {
    return this.request<{ diagnosis: any }>(`/api/v1/diagnoses/${encodeURIComponent(diagnosisId)}/resolve`, {
      method: 'POST'
    });
  }

  async v1GetPatientProblems(patientId: string) {
    return this.request<{ problems: any[]; total: number }>(`/api/v1/patients/${encodeURIComponent(patientId)}/problems`);
  }

  async v1AddPatientProblem(patientId: string, payload: any) {
    return this.request<{ problem: any }>(`/api/v1/patients/${encodeURIComponent(patientId)}/problems`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async v1UpdatePatientProblem(patientId: string, problemId: string, payload: any) {
    return this.request<{ problem: any }>(`/api/v1/patients/${encodeURIComponent(patientId)}/problems/${encodeURIComponent(problemId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  }

  async v1ResolvePatientProblem(patientId: string, problemId: string, payload: { resolutionNotes?: string; resolvedDate?: string }) {
    return this.request<{ problem: any }>(`/api/v1/patients/${encodeURIComponent(patientId)}/problems/${encodeURIComponent(problemId)}/resolve`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async v1GetPatientCarePlans(patientId: string) {
    return this.request<{ carePlans: any[]; total: number }>(`/api/v1/patients/${encodeURIComponent(patientId)}/care-plans`);
  }

  async v1CreateCarePlan(patientId: string, payload: any) {
    return this.request<{ carePlan: any }>(`/api/v1/patients/${encodeURIComponent(patientId)}/care-plans`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async v1GetCarePlan(carePlanId: string) {
    return this.request<{ carePlan: any }>(`/api/v1/care-plans/${encodeURIComponent(carePlanId)}`);
  }

  async v1UpdateCarePlan(carePlanId: string, payload: any) {
    return this.request<{ carePlan: any }>(`/api/v1/care-plans/${encodeURIComponent(carePlanId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  }

  async v1ActivateCarePlan(carePlanId: string) {
    return this.request<{ carePlan: any }>(`/api/v1/care-plans/${encodeURIComponent(carePlanId)}/activate`, {
      method: 'POST'
    });
  }

  async v1CompleteCarePlan(carePlanId: string, statusReason?: string) {
    return this.request<{ carePlan: any }>(`/api/v1/care-plans/${encodeURIComponent(carePlanId)}/complete`, {
      method: 'POST',
      body: JSON.stringify({ statusReason })
    });
  }

  async v1CancelCarePlan(carePlanId: string, statusReason?: string) {
    return this.request<{ carePlan: any }>(`/api/v1/care-plans/${encodeURIComponent(carePlanId)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ statusReason })
    });
  }

  async v1AddCarePlanItem(carePlanId: string, payload: any) {
    return this.request<{ item: any }>(`/api/v1/care-plans/${encodeURIComponent(carePlanId)}/items`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async v1UpdateCarePlanItem(carePlanId: string, itemId: string, payload: any) {
    return this.request<{ item: any }>(`/api/v1/care-plans/${encodeURIComponent(carePlanId)}/items/${encodeURIComponent(itemId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  }

  async v1CompleteCarePlanItem(carePlanId: string, itemId: string, completionNotes?: string) {
    return this.request<{ item: any }>(`/api/v1/care-plans/${encodeURIComponent(carePlanId)}/items/${encodeURIComponent(itemId)}/complete`, {
      method: 'POST',
      body: JSON.stringify({ completionNotes })
    });
  }

  async v1GetEncounterFollowUp(encounterId: string) {
    return this.request<{ followUps: any[]; total: number }>(`/api/v1/encounters/${encodeURIComponent(encounterId)}/follow-up`);
  }

  async v1RecordFollowUp(encounterId: string, payload: any) {
    return this.request<{ followUp: any }>(`/api/v1/encounters/${encodeURIComponent(encounterId)}/follow-up`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async v1UpdateFollowUp(followUpId: string, payload: any) {
    return this.request<{ followUp: any }>(`/api/v1/follow-up/${encodeURIComponent(followUpId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  }

  async v1GetClinicalAlerts(filters: { patientId?: string; encounterId?: string } = {}) {
    const params = new URLSearchParams();
    if (filters.patientId) params.set('patientId', filters.patientId);
    if (filters.encounterId) params.set('encounterId', filters.encounterId);
    const qs = params.toString();
    return this.request<{ alerts: any[]; total: number }>(`/api/v1/clinical-alerts${qs ? `?${qs}` : ''}`);
  }

  async v1GetClinicalAlert(alertId: string) {
    return this.request<{ alert: any }>(`/api/v1/clinical-alerts/${encodeURIComponent(alertId)}`);
  }

  async v1ReviewClinicalAlert(alertId: string, payload: { reviewStatus: string; reviewNotes?: string }) {
    return this.request<{ alert: any }>(`/api/v1/clinical-alerts/${encodeURIComponent(alertId)}/review`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async v1GetClinicalRules() {
    return this.request<{ rules: any[]; total: number }>('/api/v1/clinical-rules');
  }

  async v1ToggleClinicalRule(ruleId: string, targetStatus: string) {
    return this.request<{ rule: any }>(`/api/v1/clinical-rules/${encodeURIComponent(ruleId)}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ targetStatus })
    });
  }

  async v1SearchTerminology(system = 'ICD-10', q?: string) {
    const params = new URLSearchParams();
    if (system) params.set('system', system);
    if (q) params.set('q', q);
    const qs = params.toString();
    return this.request<{ concepts: any[]; total: number }>(`/api/v1/terminology/search${qs ? `?${qs}` : ''}`);
  }

  // Security Verification Helper: intentionally attempts cross-tenant query
  async testCrossTenantAccess(foreignOrgId: string) {
    return fetch('/api/patients', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
        'X-Organization-Id': foreignOrgId // Intentionally tampering with tenant header
      }
    }).then(async r => ({
      status: r.status,
      ok: r.ok,
      data: await r.json()
    }));
  }
}

export const api = new ApiClient();
