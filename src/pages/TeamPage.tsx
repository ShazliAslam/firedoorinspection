import React, { useEffect, useState } from 'react';
import { UserPlus, Shield, Power, History, BarChart3 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  PageHeader,
  Modal,
  ConfirmDialog,
  InlineAlert,
  RoleBadge,
  StatusBadge,
} from '../components/UiPrimitives';
import type { Client, AuditLog, Role, OrganizationMember } from '../types';

export default function TeamPage() {
  const { workspace, refreshWorkspace, hasRole } = useAuth();
  const { toast } = useToast();
  const canManage = hasRole(['owner', 'admin']);
  const members = workspace?.members || [];

  const [clients, setClients] = useState<Client[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [workload, setWorkload] = useState<any[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<OrganizationMember | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    email: '',
    full_name: '',
    role: 'inspector' as Role,
    client_id: '',
  });

  useEffect(() => {
    apiFetch<Client[]>('/api/portfolio?entity=clients').then(setClients).catch(() => {});
    apiFetch<AuditLog[]>('/api/notifications?action=audit_logs').then(setAuditLogs).catch(() => {});
    apiFetch<any>('/api/dashboard?range=all')
      .then((d) => setWorkload(d.workload || []))
      .catch(() => {});
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/workspace', {
        method: 'POST',
        body: JSON.stringify({ action: 'invite_member', ...form }),
      });
      setInviteOpen(false);
      toast({ tone: 'success', title: `Invited ${form.email}`, description: `Role: ${form.role}` });
      await refreshWorkspace();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const updateMember = async (id: string, patch: { role?: string; status?: string }) => {
    setError(null);
    try {
      await apiFetch('/api/workspace', {
        method: 'PUT',
        body: JSON.stringify({ action: 'update_member', id, ...patch }),
      });
      toast({ tone: 'success', title: 'Member updated' });
      setToggleTarget(null);
      await refreshWorkspace();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Team, Workload & Audit Trail"
        description="Manage RBAC roles, monitor inspector and technician capacity, and review chronological audit events."
        actions={
          canManage && (
            <button onClick={() => setInviteOpen(true)} className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-xl dp-btn-primary">
              <UserPlus className="w-4 h-4" />
              Invite User
            </button>
          )
        }
      />

      {error && <InlineAlert type="error" message={error} onDismiss={() => setError(null)} />}

      {/* Inspector & Technician Workload Management */}
      {workload.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 mb-3">
            <BarChart3 className="w-4 h-4 text-blue-600" />
            Field Capacity & Workload Distribution
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {workload.map((w) => (
              <div key={w.id} className="glass-panel rounded-2xl p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-950 truncate">{w.name}</div>
                  <RoleBadge role={w.role} />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3.5 text-center">
                  <div className="p-2.5 rounded-xl bg-white/75 border border-slate-200/60">
                    <div className="text-base font-mono font-semibold text-blue-700">{w.activeInspections}</div>
                    <div className="text-[10px] text-slate-500">Active Inspections</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{w.completedInspections} completed</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/75 border border-slate-200/60">
                    <div className="text-base font-mono font-semibold text-amber-700">{w.activeRepairs}</div>
                    <div className="text-[10px] text-slate-500">Active Repairs</div>
                    <div className="text-[10px] text-emerald-600 mt-0.5">{w.verifiedRepairs} verified</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team Directory Table */}
      <div className="glass-panel rounded-2xl overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/75 border-b border-slate-200/70 text-slate-500 font-medium">
              <tr>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Client Scope</th>
                <th className="px-4 py-3">Status</th>
                {canManage && <th className="px-4 py-3 text-right">Manage</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/50">
              {members.map((m) => {
                const scopedClient = clients.find((c) => c.id === m.client_id);
                const isSelf = m.id === workspace?.member?.id;
                return (
                  <tr key={m.id} className="hover:bg-white/75">
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-slate-950">
                        {m.full_name || m.email} {isSelf && <span className="text-slate-400">(You)</span>}
                      </div>
                      <div className="text-[11px] text-slate-500">{m.email}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      {canManage && !isSelf && m.role !== 'owner' ? (
                        <select
                          value={m.role}
                          onChange={(e) => updateMember(m.id, { role: e.target.value })}
                          className="px-2.5 py-1 text-xs rounded-lg dp-input"
                        >
                          <option value="admin">Admin</option>
                          <option value="inspector">Inspector</option>
                          <option value="technician">Technician</option>
                          <option value="client">Client</option>
                        </select>
                      ) : (
                        <RoleBadge role={m.role} />
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">
                      {m.role === 'client' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                          <Shield className="w-3.5 h-3.5" />
                          {scopedClient?.name || 'Assigned Client Only'}
                        </span>
                      ) : (
                        <span className="text-slate-400">Organization Wide</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={m.status} />
                    </td>
                    {canManage && (
                      <td className="px-4 py-3.5 text-right">
                        {!isSelf && m.role !== 'owner' && (
                          <button
                            onClick={() => setToggleTarget(m)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg dp-btn-glass"
                          >
                            <Power className="w-3 h-3" />
                            {m.status === 'active' ? 'Deactivate' : 'Activate'}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Complete Chronological Security & Operational Audit Timeline */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200/70 bg-white/40 flex items-center gap-2">
          <History className="w-4 h-4 text-blue-600" />
          <h2 className="text-sm font-semibold text-slate-950">Complete Chronological Audit Timeline</h2>
        </div>
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/75 border-b border-slate-200/70 text-slate-500 font-medium">
              <tr>
                <th className="px-4 py-2.5">Timestamp</th>
                <th className="px-4 py-2.5">Actor</th>
                <th className="px-4 py-2.5">Event Action</th>
                <th className="px-4 py-2.5">Entity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/50">
              {auditLogs.map((log) => (
                <tr key={log.id} className="hover:bg-white/60">
                  <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-semibold text-slate-900">{log.actor_name}</span>{' '}
                    <span className="text-[10px] uppercase text-slate-400">({log.actor_role})</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-blue-700">{log.action}</td>
                  <td className="px-4 py-2.5 text-slate-500">{log.entity_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite Organization Member">
        <form onSubmit={handleInvite} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Full Name *</label>
            <input type="text" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="w-full px-3 py-2 text-sm rounded-xl dp-input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Work Email *</label>
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 text-sm rounded-xl dp-input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Role *</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} className="w-full px-3 py-2 text-sm rounded-xl dp-input">
              <option value="admin">Admin — Manage operations & team</option>
              <option value="inspector">Inspector — Inspections & verification</option>
              <option value="technician">Technician — Repairs & evidence</option>
              <option value="client">Client — Isolated Client Portal</option>
            </select>
          </div>
          {form.role === 'client' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Assigned Client Portfolio *</label>
              <select required value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} className="w-full px-3 py-2 text-sm rounded-xl dp-input">
                <option value="">Select client...</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setInviteOpen(false)} className="px-4 py-2 text-xs font-medium rounded-xl dp-btn-glass">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-xs font-medium rounded-xl dp-btn-primary">
              {saving ? 'Inviting...' : 'Send Invitation'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(toggleTarget)}
        onClose={() => setToggleTarget(null)}
        onConfirm={() =>
          toggleTarget &&
          updateMember(toggleTarget.id, {
            status: toggleTarget.status === 'active' ? 'inactive' : 'active',
          })
        }
        title={toggleTarget?.status === 'active' ? 'Deactivate Team Member?' : 'Reactivate Team Member?'}
        message={
          toggleTarget?.status === 'active'
            ? `Deactivating ${toggleTarget.full_name || toggleTarget.email} immediately revokes their API access to this organization.`
            : `Restore active access for ${toggleTarget?.full_name || toggleTarget?.email}?`
        }
        confirmLabel={toggleTarget?.status === 'active' ? 'Deactivate User' : 'Activate User'}
        danger={toggleTarget?.status === 'active'}
      />
    </div>
  );
}
