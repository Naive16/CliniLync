/**
 * CLINILYNC Department Management View
 * Route: /app/departments
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../api/client.js';
import {
  Building2,
  Search,
  Plus,
  Users,
  Mail,
  Phone,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Edit2,
  Power
} from 'lucide-react';

interface DepartmentsViewProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const DepartmentsView: React.FC<DepartmentsViewProps> = ({ onNavigate }) => {
  const { activeOrganization, hasPermission } = useAuth();
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Create / Edit Modal
  const [showModal, setShowModal] = useState(false);
  const [editingDept, setEditingDept] = useState<any | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    parentDepartmentId: '',
    email: '',
    phone: '',
    isActive: true
  });
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Department Providers Detail Drawer
  const [selectedDept, setSelectedDept] = useState<any | null>(null);
  const [deptProviders, setDeptProviders] = useState<any[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);

  useEffect(() => {
    loadDepartments();
  }, [activeOrganization?.id, search, statusFilter]);

  const loadDepartments = async () => {
    setLoading(true);
    try {
      const res = await api.v1GetDepartments({
        search,
        status: statusFilter
      });
      setDepartments(res.departments || []);
    } catch (err) {
      console.error('Failed to load departments:', err);
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingDept(null);
    setFormData({
      name: '',
      code: '',
      description: '',
      parentDepartmentId: '',
      email: '',
      phone: '',
      isActive: true
    });
    setErrorMsg(null);
    setShowModal(true);
  };

  const openEditModal = (d: any) => {
    setEditingDept(d);
    setFormData({
      name: d.name,
      code: d.code,
      description: d.description || '',
      parentDepartmentId: d.parent_department_id || '',
      email: d.email || '',
      phone: d.phone || '',
      isActive: d.is_active
    });
    setErrorMsg(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      if (editingDept) {
        await api.v1UpdateDepartment(editingDept.id, formData);
      } else {
        await api.v1CreateDepartment(formData);
      }
      setShowModal(false);
      await loadDepartments();
    } catch (err: any) {
      setErrorMsg(err.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm('Are you sure you want to deactivate this department?')) return;
    try {
      await api.v1DeactivateDepartment(id);
      await loadDepartments();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const viewProviders = async (dept: any) => {
    setSelectedDept(dept);
    setLoadingProviders(true);
    try {
      const res = await api.v1GetDepartment(dept.id);
      setDeptProviders(res.assignedProviders || []);
    } catch (err) {
      console.error('Failed to load department details:', err);
    } finally {
      setLoadingProviders(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Clinical Departments & Units</h1>
          <p className="text-xs text-slate-500">
            {activeOrganization?.name} · Organizational hierarchy and service division management
          </p>
        </div>

        {hasPermission('department.create') && (
          <button
            onClick={openCreateModal}
            className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors self-start sm:self-center"
          >
            <Plus className="w-4 h-4" />
            <span>Create Department</span>
          </button>
        )}
      </div>

      {/* Search and Status Filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 flex flex-col sm:flex-row gap-3 text-xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search department name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-teal-600 focus:outline-none"
          />
        </div>

        <div className="sm:w-48">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-teal-600 focus:outline-none"
          >
            <option value="ALL">All Departments</option>
            <option value="ACTIVE">Active Units</option>
            <option value="INACTIVE">Deactivated</option>
          </select>
        </div>
      </div>

      {/* Departments Grid */}
      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400">Loading clinical departments...</div>
      ) : departments.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-3">
          <Building2 className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="text-sm font-bold text-slate-700">No Departments Found</h3>
          <p className="text-xs text-slate-400">No organizational departments match the filter parameters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map((d) => (
            <div
              key={d.id}
              className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center font-bold text-xs">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-bold text-slate-900 text-sm">{d.name}</h2>
                      <span className="font-mono text-[11px] text-teal-700 font-semibold">[{d.code}]</span>
                    </div>
                  </div>

                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    d.is_active ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {d.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                  {d.description || 'General hospital clinical care service unit.'}
                </p>

                {(d.email || d.phone) && (
                  <div className="text-[11px] text-slate-500 space-y-0.5 pt-1">
                    {d.email && <div className="flex items-center gap-1.5"><Mail className="w-3 h-3 text-slate-400" /> {d.email}</div>}
                    {d.phone && <div className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-slate-400" /> {d.phone}</div>}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <button
                  onClick={() => viewProviders(d)}
                  className="inline-flex items-center gap-1 text-teal-700 hover:text-teal-900 font-semibold"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>{d.assignedProvidersCount || 0} Clinicians</span>
                </button>

                <div className="flex items-center gap-1.5">
                  {hasPermission('department.update') && (
                    <button
                      onClick={() => openEditModal(d)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100"
                      title="Edit Department"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {hasPermission('department.update') && d.is_active && (
                    <button
                      onClick={() => handleDeactivate(d.id)}
                      className="p-1.5 text-rose-400 hover:text-rose-700 rounded hover:bg-rose-50"
                      title="Deactivate Department"
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Assigned Providers Modal / Drawer */}
      {selectedDept && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">{selectedDept.name}</h3>
                <span className="text-xs text-teal-700 font-mono">Assigned Clinical Providers</span>
              </div>
              <button onClick={() => setSelectedDept(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {loadingProviders ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading roster...</div>
            ) : deptProviders.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No healthcare providers currently assigned to this department.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {deptProviders.map((p) => (
                  <div key={p.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-slate-900">{p.display_name || `${p.title} ${p.first_name} ${p.last_name}`}</div>
                      <div className="text-slate-500 text-[11px]">{p.specialization} · License: {p.license_number}</div>
                    </div>
                    <button
                      onClick={() => onNavigate(`/app/providers/${p.id}`)}
                      className="text-teal-700 hover:text-teal-900 font-semibold text-xs"
                    >
                      View Profile →
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setSelectedDept(null)}
                className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Department Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {editingDept ? 'Edit Clinical Department' : 'Create Clinical Department'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Department Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Cardiology & Vascular Center"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Department Code *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CARD"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Parent Department (Hierarchy)</label>
                <select
                  value={formData.parentDepartmentId}
                  onChange={(e) => setFormData({ ...formData, parentDepartmentId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                >
                  <option value="">-- No Parent (Root Level) --</option>
                  {departments
                    .filter(d => !editingDept || d.id !== editingDept.id)
                    .map((d) => (
                      <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Clinical objectives and patient scope..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Contact Email</label>
                  <input
                    type="email"
                    placeholder="dept@clinic.org"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Phone Ext.</label>
                  <input
                    type="tel"
                    placeholder="+44 20..."
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold rounded-lg shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingDept ? 'Update Department' : 'Create Department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
