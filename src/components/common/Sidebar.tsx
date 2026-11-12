/**
 * CLINILYNC responsive staff navigation.
 *
 * Navigation remains presentation-only: every item is gated by the
 * server-backed permission set exposed by AuthContext.
 */
import React, { useEffect, useRef } from 'react';
import { Activity, BarChart3, Building2, Calendar, ChevronDown, LayoutDashboard, LogOut, PanelLeftClose, PanelLeftOpen, Pill, Receipt, Settings, Stethoscope, Users, UserRoundCog, X } from 'lucide-react';
import { DEMO_PERSONAS, DemoPersonaKey, useAuth } from '../../context/AuthContext.js';

interface SidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
}

const navItems = [
  { label: 'Dashboard', path: '/app', icon: LayoutDashboard, perm: 'patient.view' },
  { label: 'Patients', path: '/app/patients', icon: Users, perm: 'patient.view' },
  { label: 'Appointments', path: '/app/appointments', icon: Calendar, perm: 'appointment.view' },
  { label: 'Clinical workspace', path: '/app/clinical', icon: Stethoscope, perm: 'clinical.view' },
  { label: 'Providers', path: '/app/providers', icon: UserRoundCog, perm: 'provider.view' },
  { label: 'Departments', path: '/app/departments', icon: Building2, perm: 'department.view' },
  { label: 'Prescriptions', path: '/app/prescriptions', icon: Pill, perm: 'prescription.view' },
  { label: 'Billing', path: '/app/billing', icon: Receipt, perm: 'billing.view' },
  { label: 'Analytics', path: '/app/analytics', icon: BarChart3, perm: 'report.view' },
  { label: 'Settings', path: '/app/settings', icon: Settings, perm: null }
];

const isItemActive = (currentPath: string, path: string) => path === '/app' ? currentPath === '/app' : currentPath.startsWith(path);

export const Sidebar: React.FC<SidebarProps> = ({ currentPath, onNavigate, isMobileOpen = false, onCloseMobile, isCollapsed = false, onToggleCollapsed }) => {
  const { user, activeOrganization, roles, availableOrganizations, hasPermission, switchOrganization, switchDemoUser, logout } = useAuth();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const [showRoleSwitcher, setShowRoleSwitcher] = React.useState(false);
  const primaryRole = roles[0]?.name || (user?.isSuperAdmin ? 'Super Admin' : 'Staff');
  const canSwitchRoles = user?.isSuperAdmin === true;

  useEffect(() => {
    if (isMobileOpen) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
      window.requestAnimationFrame(() => closeButtonRef.current?.focus());
      return;
    }

    previouslyFocusedRef.current?.focus();
    previouslyFocusedRef.current = null;
  }, [isMobileOpen]);

  const navigate = (path: string) => { onNavigate(path); onCloseMobile?.(); };

  const renderItem = (item: typeof navItems[number], compact = false) => {
    const Icon = item.icon;
    const active = isItemActive(currentPath, item.path);
    const allowed = item.perm ? hasPermission(item.perm) : true;
    return (
      <button type="button" key={item.path} onClick={() => navigate(item.path)} disabled={!allowed}
        aria-current={active ? 'page' : undefined} aria-label={compact ? item.label : undefined}
        className={`clinilync-nav-item ${active ? 'is-active' : ''} ${!allowed ? 'is-locked' : ''} ${compact ? 'is-compact' : ''}`}>
        <Icon className="clinilync-nav-icon" aria-hidden="true" />
        {!compact && <span>{item.label}</span>}
        {!compact && !allowed && <span className="clinilync-nav-lock">Locked</span>}
        {compact && <span className="clinilync-nav-tooltip">{item.label}</span>}
      </button>
    );
  };

  return <>
    <aside className={`clinilync-sidebar ${isCollapsed ? 'is-collapsed' : ''}`} aria-label="Primary navigation">
      <div className="clinilync-sidebar-brand-row">
        <button type="button" className="clinilync-sidebar-brand" onClick={() => navigate('/app')}>
          <span className="clinilync-brand-mark"><Activity size={19} aria-hidden="true" /></span>
          <span><strong>Clinilync</strong><small>Healthcare workspace</small></span>
        </button>
        {onToggleCollapsed && <button type="button" className="clinilync-sidebar-collapse-toggle" onClick={onToggleCollapsed} aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {isCollapsed ? <PanelLeftOpen size={17} aria-hidden="true" /> : <PanelLeftClose size={17} aria-hidden="true" />}<span className="sr-only">{isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}</span>
        </button>}
      </div>
      <div className="clinilync-sidebar-section-label">Workspace</div>
      <nav className="clinilync-sidebar-nav">{navItems.map((item) => renderItem(item, isCollapsed))}</nav>

      <div className="clinilync-sidebar-account">
        <div className="clinilync-sidebar-user"><span className="clinilync-avatar">{user?.firstName?.[0] || 'C'}</span><span className="clinilync-sidebar-user-copy"><strong>{user ? `${user.firstName} ${user.lastName}` : 'Clinilync user'}</strong><small>{primaryRole}</small></span></div>
        {!isCollapsed && <div className="clinilync-sidebar-account-organization">
          <div className="clinilync-sidebar-context-label">Organization</div>
          {availableOrganizations.length > 1 ? (
            <label className="clinilync-sidebar-org-select">
              <span className="sr-only">Active organization</span>
              <select value={activeOrganization?.id || ''} onChange={(event) => switchOrganization(event.target.value)}>
                {availableOrganizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
              </select>
              <ChevronDown size={13} aria-hidden="true" />
            </label>
          ) : <strong className="clinilync-sidebar-org-name">{activeOrganization?.name || 'Your organization'}</strong>}
        </div>}
        {!isCollapsed && canSwitchRoles && <div className="clinilync-sidebar-role-switcher">
          <button type="button" className="clinilync-sidebar-role-toggle" onClick={() => setShowRoleSwitcher((open) => !open)} aria-expanded={showRoleSwitcher}>
            <span>Switch test user</span><ChevronDown size={13} aria-hidden="true" />
          </button>
          {showRoleSwitcher && <div className="clinilync-sidebar-role-list">
            {(Object.keys(DEMO_PERSONAS) as DemoPersonaKey[]).map((key) => {
              const persona = DEMO_PERSONAS[key];
              const isCurrent = user?.email === persona.email;
              return <button type="button" key={key} className={`clinilync-sidebar-role-option ${isCurrent ? 'is-selected' : ''}`} onClick={() => { switchDemoUser(key); setShowRoleSwitcher(false); }}>
                <strong>{persona.name}</strong><small>{persona.role}</small>
              </button>;
            })}
          </div>}
        </div>}
        <button type="button" className="clinilync-sidebar-signout" onClick={async () => { await logout(); onNavigate('/login'); }} title="Sign out" aria-label="Sign out"><span className="clinilync-signout-icon"><LogOut size={14} aria-hidden="true" /></span><span className="clinilync-signout-label">Sign out</span></button>
      </div>
    </aside>

    <aside className="clinilync-tablet-rail" aria-label="Compact navigation">
      <button type="button" className="clinilync-rail-brand" onClick={() => navigate('/app')} aria-label="Clinilync dashboard"><Activity size={18} aria-hidden="true" /></button>
      {navItems.map((item) => renderItem(item, true))}
    </aside>

    <div className={`clinilync-mobile-drawer-backdrop ${isMobileOpen ? 'is-open' : ''}`} onClick={onCloseMobile} />
    <aside className={`clinilync-mobile-drawer ${isMobileOpen ? 'is-open' : ''}`} aria-label="Mobile navigation" aria-hidden={!isMobileOpen} inert={!isMobileOpen}>
      <div className="clinilync-mobile-drawer-header"><span className="clinilync-brand-mark"><Activity size={18} aria-hidden="true" /></span><strong>Clinilync</strong><button ref={closeButtonRef} type="button" onClick={onCloseMobile} aria-label="Close navigation"><X size={20} /></button></div>
      <nav className="clinilync-sidebar-nav">{navItems.map((item) => renderItem(item))}</nav>
      <div className="clinilync-mobile-drawer-account">
        <div className="clinilync-sidebar-user"><span className="clinilync-avatar">{user?.firstName?.[0] || 'C'}</span><span className="clinilync-sidebar-user-copy"><strong>{user ? `${user.firstName} ${user.lastName}` : 'Clinilync user'}</strong><small>{primaryRole}</small></span></div>
        {availableOrganizations.length > 1 && <label className="clinilync-sidebar-org-select"><span className="sr-only">Active organization</span><select value={activeOrganization?.id || ''} onChange={(event) => switchOrganization(event.target.value)}>{availableOrganizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select><ChevronDown size={13} aria-hidden="true" /></label>}
        {canSwitchRoles && <div className="clinilync-sidebar-role-switcher clinilync-mobile-role-switcher">
          <button type="button" className="clinilync-sidebar-role-toggle" onClick={() => setShowRoleSwitcher((open) => !open)} aria-expanded={showRoleSwitcher}><span>Switch test user</span><ChevronDown size={13} aria-hidden="true" /></button>
          {showRoleSwitcher && <div className="clinilync-sidebar-role-list">{(Object.keys(DEMO_PERSONAS) as DemoPersonaKey[]).map((key) => { const persona = DEMO_PERSONAS[key]; const isCurrent = user?.email === persona.email; return <button type="button" key={key} className={`clinilync-sidebar-role-option ${isCurrent ? 'is-selected' : ''}`} onClick={() => { switchDemoUser(key); setShowRoleSwitcher(false); }}><strong>{persona.name}</strong><small>{persona.role}</small></button>; })}</div>}
        </div>}
        <button type="button" className="clinilync-sidebar-signout" onClick={async () => { await logout(); onNavigate('/login'); }} title="Sign out" aria-label="Sign out"><span className="clinilync-signout-icon"><LogOut size={14} aria-hidden="true" /></span><span className="clinilync-signout-label">Sign out</span></button>
      </div>
    </aside>
  </>;
};
