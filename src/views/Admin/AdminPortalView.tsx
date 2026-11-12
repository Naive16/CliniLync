/**
 * CLINILYNC Administration & Immutable Audit Log Console (/admin)
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../api/client.js';
import { Shield, ShieldAlert, Users, FileText, CheckCircle2, RefreshCw, KeyRound, Lock, Search } from 'lucide-react';

export const AdminPortalView: React.FC = () => {
  const { activeOrganization, hasPermission } = useAuth();
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'AUDIT' | 'USERS'>('AUDIT');
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  useEffect(() => {
    loadAdminData();
  }, [activeOrganization?.id]);

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [logsRes, usersRes] = await Promise.all([
        api.getAuditLogs(100),
        api.getAdminUsers()
      ]);
      setAuditLogs(logsRes.logs || []);
      setUsers(usersRes.users || []);
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cl-ui-page space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">System Administration & Audit Trail</h1>
          <p className="text-xs text-slate-500">
            {activeOrganization?.name} · Immutable append-only audit records & role assignments
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs">
          <button
            onClick={() => setActiveTab('AUDIT')}
            className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
              activeTab === 'AUDIT' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Audit Logs ({auditLogs.length})
          </button>
          <button
            onClick={() => setActiveTab('USERS')}
            className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
              activeTab === 'USERS' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            User Accounts ({users.length})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400">Loading administrative records...</div>
      ) : activeTab === 'AUDIT' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Logs Table (7 cols) */}
          <div className="lg:col-span-8 bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Immutable Event Stream
              </span>
              <button
                onClick={loadAdminData}
                className="text-slate-500 hover:text-slate-800 text-xs flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Refresh</span>
              </button>
            </div>

            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/50 text-slate-500 border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Timestamp (UTC)</th>
                    <th className="px-4 py-2.5 font-medium">Action</th>
                    <th className="px-4 py-2.5 font-medium">Actor</th>
                    <th className="px-4 py-2.5 font-medium">Resource</th>
                    <th className="px-4 py-2.5 font-medium">Severity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.map((log) => {
                    const isSelected = selectedLog?.id === log.id;
                    const time = new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                    return (
                      <tr
                        key={log.id}
                        onClick={() => setSelectedLog(log)}
                        className={`cursor-pointer hover:bg-slate-50/80 transition-colors ${
                          isSelected ? 'bg-teal-50/80' : ''
                        }`}
                      >
                        <td className="px-4 py-2.5 font-mono text-[11px] tabular-nums text-slate-600">
                          {time}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[11px] text-teal-900 font-semibold truncate max-w-[150px]">
                          {log.action}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700 font-mono text-[11px]">
                          {log.actor_role}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 truncate max-w-[120px]">
                          {log.resource_type}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            log.severity === 'CRITICAL' ? 'bg-rose-100 text-rose-800' :
                            log.severity === 'WARNING' ? 'bg-amber-100 text-amber-800' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {log.severity}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Log Inspector Detail (4 cols) */}
          <div className="lg:col-span-4 bg-white rounded-lg border border-slate-200 shadow-xs p-5 space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Audit Record Inspector</h3>
              <p className="text-[11px] text-slate-400">Cryptographic audit payload details</p>
            </div>

            {selectedLog ? (
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">Audit ID:</span>
                  <span className="font-mono text-slate-800 text-[11px] break-all">{selectedLog.id}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Action / Event:</span>
                  <span className="font-semibold text-teal-800 font-mono">{selectedLog.action}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Actor:</span>
                    <span className="font-medium text-slate-800 font-mono text-[11px]">{selectedLog.actor_id}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">IP Address:</span>
                    <span className="font-mono text-slate-800 text-[11px]">{selectedLog.ip_address}</span>
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px] mb-1">Sanitized Metadata:</span>
                  <pre className="p-3 bg-slate-900 text-emerald-400 rounded-lg text-[10px] font-mono overflow-x-auto max-h-48">
                    {JSON.stringify(
                      typeof selectedLog.metadata === 'string'
                        ? JSON.parse(selectedLog.metadata)
                        : selectedLog.metadata || {},
                      null,
                      2
                    )}
                  </pre>
                </div>

                <div className="pt-2 text-[10px] text-slate-400 border-t border-slate-100">
                  Logged at: {selectedLog.created_at} · Verified append-only
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-xs text-slate-400">
                Click any log event from the stream to inspect details.
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Users List Tab */
        <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50">
            <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Assigned Staff Accounts & RBAC Roles
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/50 text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="px-5 py-2.5 font-medium">User Profile</th>
                  <th className="px-5 py-2.5 font-medium">Email Address</th>
                  <th className="px-5 py-2.5 font-medium">Assigned System Role</th>
                  <th className="px-5 py-2.5 font-medium">Account Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3 font-semibold text-slate-900">
                      {u.first_name} {u.last_name}
                    </td>
                    <td className="px-5 py-3 text-slate-600 font-mono text-[11px]">
                      {u.email}
                    </td>
                    <td className="px-5 py-3">
                      <span className="font-mono text-xs text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200 font-semibold">
                        {u.role_name}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-emerald-700 font-medium text-xs flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Active
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
