import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Briefcase, Plus, Search, Archive, Edit2, Mail, Phone, Building2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  PageHeader,
  Modal,
  ConfirmDialog,
  TableSkeleton,
  EmptyState,
  InlineAlert,
  StatusBadge,
  PaginationBar,
  SortableHeader,
} from '../components/UiPrimitives';
import type { Client } from '../types';

export default function ClientsPage() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const canManage = hasRole(['owner', 'admin']);

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [showArchived, setShowArchived] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'door_count' | 'open_deficiency_count'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Client | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    company_code: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    billing_address: '',
    service_tier: 'Annual Inspection',
    notes: '',
  });

  const loadClients = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Client[]>(
        `/api/portfolio?entity=clients&include_archived=${showArchived}`
      );
      setClients(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
  }, [showArchived]);

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: '',
      company_code: '',
      contact_name: '',
      contact_email: '',
      contact_phone: '',
      billing_address: '',
      service_tier: 'Annual Inspection',
      notes: '',
    });
    setModalOpen(true);
  };

  const openEdit = (client: Client) => {
    setEditing(client);
    setForm({
      name: client.name,
      company_code: client.company_code || '',
      contact_name: client.contact_name || '',
      contact_email: client.contact_email || '',
      contact_phone: client.contact_phone || '',
      billing_address: client.billing_address || '',
      service_tier: client.service_tier || 'Annual Inspection',
      notes: client.notes || '',
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await apiFetch('/api/portfolio', {
          method: 'PUT',
          body: JSON.stringify({ entity: 'clients', id: editing.id, ...form }),
        });
        toast({ tone: 'success', title: 'Client updated', description: form.name });
      } else {
        await apiFetch('/api/portfolio', {
          method: 'POST',
          body: JSON.stringify({ entity: 'clients', ...form }),
        });
        toast({ tone: 'success', title: 'Client registered', description: form.name });
      }
      setModalOpen(false);
      await loadClients();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmArchive = async () => {
    if (!archiveTarget) return;
    setSaving(true);
    try {
      await apiFetch('/api/portfolio', {
        method: 'PUT',
        body: JSON.stringify({
          entity: 'clients',
          id: archiveTarget.id,
          archived: !archiveTarget.archived,
        }),
      });
      toast({
        tone: 'info',
        title: archiveTarget.archived ? 'Client restored' : 'Client archived',
        description: archiveTarget.name,
      });
      setArchiveTarget(null);
      await loadClients();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const filtered = clients
    .filter(
      (c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.contact_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.company_code || '').toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1;
      if (sortBy === 'name') return a.name.localeCompare(b.name) * mul;
      return (((a[sortBy] as number) || 0) - ((b[sortBy] as number) || 0)) * mul;
    });

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Manage commercial property owners, healthcare networks, and service contracts."
        actions={
          canManage && (
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-xl dp-btn-primary"
            >
              <Plus className="w-4 h-4" />
              New Client
            </button>
          )
        }
      />

      {error && <InlineAlert type="error" message={error} onDismiss={() => setError(null)} />}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search clients, code, or contact..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl dp-input"
          />
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="rounded border-slate-300"
          />
          Show archived clients
        </label>
      </div>

      {loading ? (
        <TableSkeleton rows={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No clients found"
          description="Register a commercial client portfolio to track buildings, fire doors, and isolated client portal handovers."
          action={
            canManage && (
              <button onClick={openCreate} className="px-4 py-2 text-xs font-medium rounded-xl dp-btn-primary">
                Add First Client
              </button>
            )
          }
        />
      ) : (
        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/75 border-b border-slate-200/70 text-slate-500 font-medium">
                <tr>
                  <th className="px-4 py-3">
                    <SortableHeader
                      label="Client / Code"
                      active={sortBy === 'name'}
                      direction={sortDir}
                      onClick={() => toggleSort('name')}
                    />
                  </th>
                  <th className="px-4 py-3">Primary Contact</th>
                  <th className="px-4 py-3">Service Program</th>
                  <th className="px-4 py-3">
                    <SortableHeader
                      label="Portfolio"
                      active={sortBy === 'door_count'}
                      direction={sortDir}
                      onClick={() => toggleSort('door_count')}
                    />
                  </th>
                  <th className="px-4 py-3">
                    <SortableHeader
                      label="Open Deficiencies"
                      active={sortBy === 'open_deficiency_count'}
                      direction={sortDir}
                      onClick={() => toggleSort('open_deficiency_count')}
                    />
                  </th>
                  {canManage && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50">
                {paged.map((client) => (
                  <tr key={client.id} className="hover:bg-white/75 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-slate-950 flex items-center gap-2">
                        {client.name}
                        {client.archived && <StatusBadge status="Closed" />}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                        {client.company_code}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-slate-800 font-medium">{client.contact_name || '-'}</div>
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                        {client.contact_email && (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {client.contact_email}
                          </span>
                        )}
                        {client.contact_phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {client.contact_phone}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">{client.service_tier}</td>
                    <td className="px-4 py-3.5">
                      <div className="inline-flex items-center gap-3 text-slate-700 font-mono">
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          {client.building_count || 0} bldgs
                        </span>
                        <span>• {client.door_count || 0} doors</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`font-mono font-semibold ${
                          (client.open_deficiency_count || 0) > 0
                            ? 'text-rose-600'
                            : 'text-emerald-600'
                        }`}
                      >
                        {client.open_deficiency_count || 0}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3.5 text-right whitespace-nowrap space-x-1">
                        <button
                          onClick={() => openEdit(client)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 rounded-lg"
                          title="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setArchiveTarget(client)}
                          className="p-1.5 text-slate-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg"
                          title={client.archived ? 'Restore' : 'Archive'}
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar page={page} totalItems={filtered.length} pageSize={pageSize} onPageChange={setPage} />
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Client Account' : 'Register Commercial Client'}
        subtitle="Clients isolate buildings, fire doors, and client portal reporting."
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Client Name *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Mercy Health Systems"
                className="w-full px-3 py-2 text-sm rounded-xl dp-input"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Client Code</label>
              <input
                type="text"
                value={form.company_code}
                onChange={(e) => setForm({ ...form, company_code: e.target.value })}
                placeholder="CL-1040"
                className="w-full px-3 py-2 text-sm rounded-xl dp-input"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Primary Contact</label>
              <input
                type="text"
                value={form.contact_name}
                onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                placeholder="Elena Vasquez, Facilities Dir."
                className="w-full px-3 py-2 text-sm rounded-xl dp-input"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Service Program</label>
              <select
                value={form.service_tier}
                onChange={(e) => setForm({ ...form, service_tier: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-xl dp-input"
              >
                <option>Annual Inspection</option>
                <option>Semi-Annual Healthcare</option>
                <option>Quarterly Enterprise SLA</option>
                <option>Remediation Only</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Contact Email</label>
              <input
                type="email"
                value={form.contact_email}
                onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                placeholder="facilities@mercyhealth.org"
                className="w-full px-3 py-2 text-sm rounded-xl dp-input"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Contact Phone</label>
              <input
                type="text"
                value={form.contact_phone}
                onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                placeholder="(312) 555-0148"
                className="w-full px-3 py-2 text-sm rounded-xl dp-input"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Billing Address</label>
            <input
              type="text"
              value={form.billing_address}
              onChange={(e) => setForm({ ...form, billing_address: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-xl dp-input"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Service Notes</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-xl dp-input"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-xs font-medium rounded-xl dp-btn-glass">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-xs font-medium rounded-xl dp-btn-primary">
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Client'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
        title={archiveTarget?.archived ? 'Restore Client Account?' : 'Archive Client Account?'}
        message={
          archiveTarget?.archived
            ? `Restore "${archiveTarget.name}" back to active operations?`
            : `Archive "${archiveTarget?.name}"? Historical inspections, deficiencies, and audit records will be retained safely.`
        }
        confirmLabel={archiveTarget?.archived ? 'Restore Client' : 'Archive Client'}
        danger={!archiveTarget?.archived}
        loading={saving}
      />
    </div>
  );
}
