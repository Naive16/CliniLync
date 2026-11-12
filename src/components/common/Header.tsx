/** CLINILYNC responsive application top bar. */
import React, { useEffect, useRef, useState } from 'react';
import { Bell, Menu, Search, X } from 'lucide-react';
import { api } from '../../api/client.js';

interface HeaderProps {
  currentPath: string;
  onOpenMobileNav: () => void;
}

const titles: Record<string, string> = {
  '/app': 'Dashboard', '/app/patients': 'Patients', '/app/appointments': 'Appointments',
  '/app/clinical': 'Clinical workspace', '/app/encounters': 'Encounters', '/app/prescriptions': 'Prescriptions',
  '/app/billing': 'Billing', '/app/analytics': 'Analytics', '/app/settings': 'Settings'
};

export const Header: React.FC<HeaderProps> = ({ currentPath, onOpenMobileNav }) => {
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const title = Object.entries(titles).find(([path]) => currentPath === path || (path !== '/app' && currentPath.startsWith(path)))?.[1] || 'Clinilync';

  const loadNotifications = async () => {
    setNotificationLoading(true);
    setNotificationError(null);
    try {
      const result = await api.v1GetNotifications();
      setNotifications(result.notifications || []);
      setUnreadCount(result.unreadCount || 0);
    } catch (error) {
      setNotificationError((error as Error).message || 'Notifications could not be loaded.');
    } finally {
      setNotificationLoading(false);
    }
  };

  useEffect(() => { void loadNotifications(); }, []);

  useEffect(() => {
    if (!showNotifications) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setShowNotifications(false); };
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) setShowNotifications(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('mousedown', closeOnOutsideClick);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('mousedown', closeOnOutsideClick);
    };
  }, [showNotifications]);

  const markRead = async (notificationId: string) => {
    try {
      await api.v1MarkNotificationRead(notificationId);
      setNotifications((current) => current.map((item) => item.id === notificationId ? { ...item, read_at: new Date().toISOString() } : item));
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch (error) {
      setNotificationError((error as Error).message || 'Notification could not be updated.');
    }
  };

  const markAllRead = async () => {
    try {
      await api.v1MarkAllNotificationsRead();
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at || readAt })));
      setUnreadCount(0);
    } catch (error) {
      setNotificationError((error as Error).message || 'Notifications could not be updated.');
    }
  };

  return <header className="clinilync-topbar">
    <button type="button" className="clinilync-mobile-menu-button" onClick={onOpenMobileNav} aria-label="Open navigation"><Menu size={21} /></button>
    <div className="clinilync-topbar-heading"><h1>{title}</h1></div>
    <div className={`clinilync-topbar-search ${showMobileSearch ? 'is-mobile-open' : ''}`}><Search size={16} aria-hidden="true" /><input aria-label="Search workspace" placeholder="Search patients, appointments..." /><button type="button" className="clinilync-search-close" onClick={() => setShowMobileSearch(false)} aria-label="Close search"><X size={17} /></button></div>
    <div className="clinilync-topbar-actions">
      <button type="button" className="clinilync-icon-button clinilync-mobile-search-button" onClick={() => setShowMobileSearch(true)} aria-label="Search"><Search size={18} /></button>
      <div className="clinilync-notification-wrap" ref={notificationRef}>
        <button type="button" className="clinilync-icon-button" aria-label="Notifications" aria-expanded={showNotifications} aria-controls="clinilync-notification-panel" onClick={() => { setShowNotifications((open) => !open); if (!showNotifications) void loadNotifications(); }}>
          <Bell size={18} />{unreadCount > 0 && <span className="clinilync-notification-dot" aria-label={`${unreadCount} unread notifications`} />}
        </button>
        {showNotifications && <div id="clinilync-notification-panel" className="clinilync-notification-panel" role="dialog" aria-label="Notifications">
          <div className="clinilync-notification-panel-header"><strong>Notifications</strong>{unreadCount > 0 && <button type="button" onClick={() => void markAllRead()}>Mark all read</button>}</div>
          {notificationLoading ? <div className="clinilync-notification-state">Loading notifications...</div>
            : notificationError ? <div className="clinilync-notification-state clinilync-notification-error">{notificationError}</div>
              : notifications.length === 0 ? <div className="clinilync-notification-state">You have no notifications.</div>
                : <div className="clinilync-notification-list">{notifications.map((notification) => <button type="button" key={notification.id} className={`clinilync-notification-item ${notification.read_at ? '' : 'is-unread'}`} onClick={() => !notification.read_at && void markRead(notification.id)}>
                  <span><strong>{notification.title}</strong><small>{notification.message}</small><time>{new Date(notification.created_at).toLocaleString()}</time></span>
                </button>)}</div>}
        </div>}
      </div>
    </div>
  </header>;
};
