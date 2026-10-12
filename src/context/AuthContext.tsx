/**
 * CLINILYNC Authentication Context
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client.js';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isSuperAdmin: boolean;
  avatarUrl?: string;
}

export interface AuthOrganization {
  id: string;
  name: string;
  currency_code: string;
  timezone: string;
  country_code?: string;
}

export interface AuthRole {
  id: string;
  name: string;
  code: string;
}

export interface AuthContextType {
  user: AuthUser | null;
  activeOrganization: AuthOrganization | null;
  roles: AuthRole[];
  permissions: string[];
  availableOrganizations: AuthOrganization[];
  isLoading: boolean;
  login: (email: string, password: string, organizationId?: string) => Promise<void>;
  logout: () => Promise<void>;
  switchOrganization: (organizationId: string) => Promise<void>;
  switchDemoUser: (personaKey: DemoPersonaKey) => Promise<void>;
  hasPermission: (permissionCode: string) => boolean;
  refreshSession: () => Promise<void>;
}

export type DemoPersonaKey = 
  | 'superadmin'
  | 'owner_olivia'
  | 'admin_rachel'
  | 'dr_sarah' 
  | 'nurse_marcus' 
  | 'reception_elena' 
  | 'billing_james' 
  | 'support_sam'
  | 'dr_robert'
  | 'patient_david'
  | 'revoked_staff';

export const DEMO_PERSONAS: Record<DemoPersonaKey, { email: string; name: string; role: string; org: string; orgName: string; isExpectedToFail?: boolean }> = {
  superadmin: {
    email: 'superadmin@clinilync.com',
    name: 'Alexander Vance',
    role: 'Platform Super Admin',
    org: 'org_st_jude',
    orgName: 'System-wide Governance'
  },
  patient_david: {
    email: 'patient.david@clinilync.com',
    name: 'David Miller',
    role: 'Patient (Self-Service Portal)',
    org: 'org_st_jude',
    orgName: 'St. Jude Global Health'
  },
  owner_olivia: {
    email: 'owner.olivia@clinilync.com',
    name: 'Olivia Sterling',
    role: 'Organization Owner',
    org: 'org_st_jude',
    orgName: 'St. Jude Global Health'
  },
  admin_rachel: {
    email: 'admin.rachel@clinilync.com',
    name: 'Rachel Kim',
    role: 'Org Administrator',
    org: 'org_st_jude',
    orgName: 'St. Jude Global Health'
  },
  dr_sarah: {
    email: 'dr.sarah@clinilync.com',
    name: 'Dr. Sarah Chen, MD',
    role: 'Doctor (Multi-Org: St. Jude & Metro)',
    org: 'org_st_jude',
    orgName: 'St. Jude Global Health'
  },
  nurse_marcus: {
    email: 'nurse.marcus@clinilync.com',
    name: 'Marcus Vance, RN',
    role: 'Nurse',
    org: 'org_st_jude',
    orgName: 'St. Jude Global Health'
  },
  reception_elena: {
    email: 'elena.reception@clinilync.com',
    name: 'Elena Ramos',
    role: 'Receptionist',
    org: 'org_st_jude',
    orgName: 'St. Jude Global Health'
  },
  billing_james: {
    email: 'billing.james@clinilync.com',
    name: 'James Thornton',
    role: 'Billing Staff',
    org: 'org_st_jude',
    orgName: 'St. Jude Global Health'
  },
  support_sam: {
    email: 'support.sam@clinilync.com',
    name: 'Sam Taylor',
    role: 'Support Staff',
    org: 'org_st_jude',
    orgName: 'St. Jude Global Health'
  },
  dr_robert: {
    email: 'dr.robert@metrohealth.com',
    name: 'Dr. Robert Thorne',
    role: 'Doctor (Metro Health Tenant)',
    org: 'org_metro_health',
    orgName: 'Metro Health Specialty Inst.'
  },
  revoked_staff: {
    email: 'revoked.staff@clinilync.com',
    name: 'Arthur Pendelton',
    role: 'Revoked Membership',
    org: 'org_st_jude',
    orgName: 'St. Jude (Membership Revoked)',
    isExpectedToFail: true
  }
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeOrganization, setActiveOrganization] = useState<AuthOrganization | null>(null);
  const [roles, setRoles] = useState<AuthRole[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [availableOrganizations, setAvailableOrganizations] = useState<AuthOrganization[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshSession = async () => {
    try {
      const me = await api.v1GetMe();
      setUser(me.user);
      setActiveOrganization(me.activeOrganization);
      setRoles(me.roles);
      setPermissions(me.permissions);
      setAvailableOrganizations(me.availableOrganizations as AuthOrganization[]);
      api.setOrganizationId(me.activeOrganization.id);
    } catch {
      setUser(null);
      setActiveOrganization(null);
      setRoles([]);
      setPermissions([]);
    }
  };

  // Restore session on mount
  useEffect(() => {
    async function initSession() {
      try {
        const session = await api.v1GetSession();
        if (session && session.active) {
          await refreshSession();
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }

    initSession();
  }, []);

  const login = async (email: string, password: string, organizationId?: string) => {
    setIsLoading(true);
    try {
      const res = await api.v1Login(email, password, organizationId);
      if (res.token) {
        api.setToken(res.token);
      }
      if (res.activeOrganization) {
        api.setOrganizationId(res.activeOrganization.id);
      }
      await refreshSession();
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await api.v1Logout();
    } catch {
      // Ignore network errors on logout
    }
    api.setToken(null);
    api.setOrganizationId(null);
    setUser(null);
    setActiveOrganization(null);
    setRoles([]);
    setPermissions([]);
    setAvailableOrganizations([]);
  };

  const switchOrganization = async (organizationId: string) => {
    setIsLoading(true);
    try {
      await api.v1SwitchOrg(organizationId);
      api.setOrganizationId(organizationId);
      await refreshSession();
    } finally {
      setIsLoading(false);
    }
  };

  const switchDemoUser = async (personaKey: DemoPersonaKey) => {
    setIsLoading(true);
    const persona = DEMO_PERSONAS[personaKey];
    try {
      const res = await api.v1Login(persona.email, 'Password123!', persona.org);
      if (res.token) {
        api.setToken(res.token);
      }
      if (res.activeOrganization) {
        api.setOrganizationId(res.activeOrganization.id);
      }
      await refreshSession();
    } finally {
      setIsLoading(false);
    }
  };

  const hasPermission = (permissionCode: string): boolean => {
    if (user?.isSuperAdmin) return true;
    return permissions.includes(permissionCode);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        activeOrganization,
        roles,
        permissions,
        availableOrganizations,
        isLoading,
        login,
        logout,
        switchOrganization,
        switchDemoUser,
        hasPermission,
        refreshSession
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
