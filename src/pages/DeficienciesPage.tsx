import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Plus,
  Search,
  UserCheck,
  History,
  Camera,
  CheckSquare,
} from 'lucide-react';
import { apiFetch, fileToBase64 } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  PageHeader,
  Modal,
  TableSkeleton,
  EmptyState,
  InlineAlert,
  StatusBadge,
  PaginationBar,
  SortableHeader,
} from '../components/UiPrimitives';
import type { Deficiency, FireDoor, Client, Building, EvidenceFile } from '../types';

const STATUSES = [
  'Open',
  'Assigned',
  'In Progress',
  'Awaiting Parts',
  'Ready for Verification',
  'Verified',
  'Closed',
];

const CATEGORIES = [
  'Door Leaf',
  'Frame',
  'Hinges',
  'Closers',
  'Latching',
  'Seals',
  'Glazing',
  'Gaps',
  'Signage',
  'Other Observations',
];

export default function DeficienciesPage() {
  const { workspace, hasRole } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const canCreateOrAssign = hasRole(['owner', 'admin', 'inspector']);

  const [deficiencies, setDeficiencies] = useState<Deficiency[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [doors, setDoors] = useState<FireDoor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters, sorting, pagination
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [clientFilter, setClientFilter] = useState('');
  const [buildingFilter, setBuildingFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState<'deficiency_code' | 'due_date' | 'severity' | 'status'>('due_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Bulk selection & actions
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkTechId, setBulkTechId] = useState('');
  const [bulkPriority, setBulkPriority] = useState('');

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    fire_door_id: '',
    category: 'Closers',
    title: '',
    description: '',
    severity: 'High',
    priority: 'P2',
    due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    assigned_technician_id: '',
  });

  // Detail modal
  const [selected, setSelected] = useState<Deficiency | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceFile[]>([]);
  const [assignTechId, setAssignTechId] = useState('');
  const [assignDueDate, setAssignDueDate] = useState('');
  const [uploading, setUploading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [defs, cls, blds, drs] = await Promise.all([
        apiFetch<Deficiency[]>('/api/deficiencies'),
        apiFetch<Client[]>('/api/portfolio?entity=clients'),
        apiFetch<Building[]>('/api/portfolio?entity=buildings'),
        apiFetch<FireDoor[]>('/api/portfolio?entity=doors'),
      ]);
      setDeficiencies(defs);
      setClients(cls);
      setBuildings(blds);
      setDoors(drs);
      setSelectedIds([]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  const openDetail = async (def: Deficiency) => {
    setSelected(def);
    setAssignTechId(def.assigned_technician_id || '');
    setAssignDueDate(def.due_date || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
    try {
      const ev = await apiFetch<EvidenceFile[]>(`/api/evidence?deficiency_id=${def.id}`);
      setSelectedEvidence(ev);
    } catch {
      setSelectedEvidence([]);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/deficiencies', { method: 'POST', body: JSON.stringify(form) });
      setCreateOpen(false);
      toast({ tone: 'success', title: 'Deficiency logged', description: form.title });
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleBulkUpdate = async () => {
    if (selectedIds.length === 0 || (!bulkTechId && !bulkPriority)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<{ updated: number }>('/api/deficiencies', {
        method: 'PUT',
        body: JSON.stringify({
          action: 'bulk_update',
          ids: selectedIds,
          assigned_technician_id: bulkTechId || undefined,
          priority: bulkPriority || undefined,
        }),
      });
      toast({ tone: 'success', title: `Updated ${res.updated} deficiencies` });
      setBulkTechId('');
      setBulkPriority('');
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAssignTechnician = async () => {
    if (!selected || !assignTechId) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/deficiencies', {
        method: 'PUT',
        body: JSON.stringify({
          action: 'assign_technician',
          id: selected.id,
          assigned_technician_id: assignTechId,
          due_date: assignDueDate,
        }),
      });
      toast({ tone: 'success', title: `Assigned ${selected.deficiency_code}`, description: 'Remediation task queued.' });
      setSelected(null);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUploadEvidence = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      await apiFetch('/api/evidence', {
        method: 'POST',
        body: JSON.stringify({
          fileName: file.name,
          fileBase64: base64,
          contentType: file.type,
          evidence_type: 'before_repair',
          deficiency_id: selected.id,
          fire_door_id: selected.fire_door_id,
          caption: `Deficiency ${selected.deficiency_code} documentation`,
        }),
      });
      const ev = await apiFetch<EvidenceFile[]>(`/api/evidence?deficiency_id=${selected.id}`);
      setSelectedEvidence(ev);
      toast({ tone: 'success', title: 'Evidence uploaded' });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const technicians = (workspace?.members || []).filter((m) =>
    ['technician', 'inspector', 'admin', 'owner'].includes(m.role)
  );

  const filtered = deficiencies
    .filter((d) => {
      if (clientFilter && d.client_id !== clientFilter) return false;
      if (buildingFilter && d.building_id !== buildingFilter) return false;
      if (severityFilter && d.severity !== severityFilter) return false;
      if (statusFilter && d.status !== statusFilter) return false;
      const q = search.toLowerCase();
      return (
        d.deficiency_code.toLowerCase().includes(q) ||
        d.title.toLowerCase().includes(q) ||
        (d.door_code || '').toLowerCase().includes(q) ||
        (d.building_name || '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1;
      return String(a[sortBy] || '9999').localeCompare(String(b[sortBy] || '9999')) * mul;
    });

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div>
      <PageHeader
        title="Deficiency Management"
        description="Track non-conforming fire-door findings with bulk technician dispatch, priority filters, and chronological audit history."
        actions={
          canCreateOrAssign && (
            <button
              onClick={() => {
                setForm({
                  fire_door_id: doors[0]?.id || '',
                  category: 'Closers',
                  title: '',
                  description: '',
                  severity: 'High',
                  priority: 'P2',
                  due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
                  assigned_technician_id: '',
                });
                setCreateOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-xl dp-btn-primary"
            >
              <Plus className="w-4 h-4" />
              Log Deficiency
            </button>
          )
        }
      />

      {error && <InlineAlert type="error" message={error} onDismiss={() => setError(null)} />}

      {/* Multi-Facet Filter Bar */}
      <div className="flex flex-wrap gap-2.5 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search DEF code, door, issue..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl dp-input"
          />
        </div>
        <select value={clientFilter} onChange={(e) => { setClientFilter(e.target.value); setPage(1); }} className="px-3 py-2 text-xs rounded-xl dp-input">
          <option value="">All Clients</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={buildingFilter} onChange={(e) => { setBuildingFilter(e.target.value); setPage(1); }} className="px-3 py-2 text-xs rounded-xl dp-input">
          <option value="">All Buildings</option>
          {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={severityFilter} onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }} className="px-3 py-2 text-xs rounded-xl dp-input">
          <option value="">All Severities</option>
          {['Critical', 'High', 'Medium', 'Low'].map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="px-3 py-2 text-xs rounded-xl dp-input">
          <option value="">All Statuses</option>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* Bulk Deficiency Action Bar */}
      {canCreateOrAssign && selectedIds.length > 0 && (
        <div className="mb-4 glass-surface rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 border-blue-300/60 bg-blue-50/70">
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-950">
            <CheckSquare className="w-4 h-4 text-blue-600" />
            {selectedIds.length} deficiencies selected
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={bulkTechId}
              onChange={(e) => setBulkTechId(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg dp-input"
            >
              <option value="">Assign technician...</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.user_id || t.id}>
                  {t.full_name || t.email}
                </option>
              ))}
            </select>
            <select
              value={bulkPriority}
              onChange={(e) => setBulkPriority(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg dp-input"
            >
              <option value="">Set priority...</option>
              <option value="P1">P1 (Urgent)</option>
              <option value="P2">P2 (High)</option>
              <option value="P3">P3 (Standard)</option>
              <option value="P4">P4 (Low)</option>
            </select>
            <button
              disabled={saving || (!bulkTechId && !bulkPriority)}
              onClick={handleBulkUpdate}
              className="px-3 py-1.5 text-xs font-medium rounded-lg dp-btn-blue disabled:opacity-40"
            >
              Apply Bulk Update
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="No deficiencies found"
          description="Failed inspection checklist items automatically create deficiencies here, or log one manually."
        />
      ) : (
        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/75 border-b border-slate-200/70 text-slate-500 font-medium">
                <tr>
                  {canCreateOrAssign && (
                    <th className="px-4 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={paged.length > 0 && paged.every((d) => selectedIds.includes(d.id))}
                        onChange={() => {
                          const ids = paged.map((d) => d.id);
                          const all = ids.every((x) => selectedIds.includes(x));
                          setSelectedIds(all ? selectedIds.filter((x) => !ids.includes(x)) : [...new Set([...selectedIds, ...ids])]);
                        }}
                        className="rounded border-slate-300"
                      />
                    </th>
                  )}
                  <th className="px-4 py-3">
                    <SortableHeader label="Code / Category" active={sortBy === 'deficiency_code'} direction={sortDir} onClick={() => toggleSort('deficiency_code')} />
                  </th>
                  <th className="px-4 py-3">Door & Facility</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">
                    <SortableHeader label="Severity" active={sortBy === 'severity'} direction={sortDir} onClick={() => toggleSort('severity')} />
                  </th>
                  <th className="px-4 py-3">
                    <SortableHeader label="Technician / Due" active={sortBy === 'due_date'} direction={sortDir} onClick={() => toggleSort('due_date')} />
                  </th>
                  <th className="px-4 py-3">
                    <SortableHeader label="Status" active={sortBy === 'status'} direction={sortDir} onClick={() => toggleSort('status')} />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50">
                {paged.map((def) => (
                  <tr
                    key={def.id}
                    onClick={() => openDetail(def)}
                    className="hover:bg-white/80 cursor-pointer transition-colors"
                  >
                    {canCreateOrAssign && (
                      <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(def.id)}
                          onChange={() =>
                            setSelectedIds((prev) =>
                              prev.includes(def.id) ? prev.filter((x) => x !== def.id) : [...prev, def.id]
                            )
                          }
                          className="rounded border-slate-300"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="font-mono font-semibold text-slate-950">{def.deficiency_code}</div>
                      <div className="text-[11px] text-blue-700 font-medium">{def.category}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-mono font-semibold text-slate-800">{def.door_code}</div>
                      <div className="text-[11px] text-slate-500">{def.building_name}</div>
                    </td>
                    <td className="px-4 py-3.5 max-w-xs">
                      <div className="font-medium text-slate-900 truncate">{def.title}</div>
                      <div className="text-[11px] text-slate-500 line-clamp-1">{def.description}</div>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <StatusBadge status={def.severity} />
                        <StatusBadge status={def.priority} />
                      </div>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="text-slate-800">
                        {def.assigned_technician_name || <span className="text-slate-400 italic">Unassigned</span>}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">Due: {def.due_date || '-'}</div>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <StatusBadge status={def.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar page={page} totalItems={filtered.length} pageSize={pageSize} onPageChange={setPage} />
        </div>
      )}

      {/* Detail & Assignment Modal */}
      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.deficiency_code} — ${selected.title}` : ''}
        subtitle={selected ? `${selected.client_name} • ${selected.building_name} • Door ${selected.door_code}` : ''}
        maxWidth="max-w-2xl"
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={selected.status} />
              <StatusBadge status={selected.severity} />
              <StatusBadge status={selected.priority} />
              <span className="text-xs text-slate-500 ml-auto">
                Category: <strong>{selected.category}</strong>
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-700 leading-relaxed">
              {selected.description}
            </div>

            {canCreateOrAssign && !['Verified', 'Closed'].includes(selected.status) && (
              <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/50 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                  <UserCheck className="w-4 h-4 text-blue-600" />
                  Assign Remediation Technician & Deadline
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <select value={assignTechId} onChange={(e) => setAssignTechId(e.target.value)} className="px-3 py-2 text-xs rounded-xl dp-input">
                    <option value="">Select technician...</option>
                    {technicians.map((t) => (
                      <option key={t.id} value={t.user_id || t.id}>
                        {t.full_name || t.email} ({t.role})
                      </option>
                    ))}
                  </select>
                  <input type="date" value={assignDueDate} onChange={(e) => setAssignDueDate(e.target.value)} className="px-3 py-2 text-xs rounded-xl dp-input" />
                  <button
                    onClick={handleAssignTechnician}
                    disabled={saving || !assignTechId}
                    className="px-3 py-2 text-xs font-medium rounded-xl dp-btn-blue disabled:opacity-50"
                  >
                    {saving ? 'Assigning...' : 'Assign Repair'}
                  </button>
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-slate-800">Attached Evidence ({selectedEvidence.length})</h4>
                <label className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg dp-btn-glass cursor-pointer">
                  <Camera className="w-3.5 h-3.5" />
                  {uploading ? 'Uploading...' : 'Add Photo'}
                  <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" className="hidden" onChange={handleUploadEvidence} />
                </label>
              </div>
              {selectedEvidence.length === 0 ? (
                <div className="text-xs text-slate-400 py-5 text-center border border-dashed border-slate-200 rounded-xl">
                  No evidence photos uploaded yet.
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2.5">
                  {selectedEvidence.map((ev) => (
                    <a key={ev.id} href={ev.signed_url || '#'} target="_blank" rel="noreferrer" className="border border-slate-200 rounded-xl overflow-hidden block bg-white">
                      {ev.signed_url && (ev.mime_type || '').startsWith('image/') ? (
                        <img src={ev.signed_url} alt={ev.file_name} className="w-full h-24 object-cover" />
                      ) : (
                        <div className="h-24 bg-slate-100 flex items-center justify-center text-[11px] text-slate-500">{ev.file_name}</div>
                      )}
                      <div className="px-2 py-1 text-[10px] bg-slate-50 text-slate-600 truncate">{ev.evidence_type.replace('_', ' ')}</div>
                    </a>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 mb-2">
                <History className="w-3.5 h-3.5 text-blue-600" />
                Chronological Status Timeline
              </div>
              <div className="space-y-3 border-l-2 border-slate-200 pl-4 ml-1">
                {(selected.status_history || []).map((entry, idx) => (
                  <div key={idx} className="text-xs relative">
                    <span className="w-2 h-2 rounded-full bg-blue-600 ring-4 ring-white absolute -left-[21px] top-1" />
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={entry.status} />
                      <span className="font-semibold text-slate-800">{entry.changed_by}</span>
                      <span className="text-[11px] text-slate-400 font-mono">{new Date(entry.at).toLocaleString()}</span>
                    </div>
                    <p className="text-slate-600 mt-0.5">{entry.note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Log Deficiency Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Log Fire Door Deficiency">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Fire Door *</label>
              <select required value={form.fire_door_id} onChange={(e) => setForm({ ...form, fire_door_id: e.target.value })} className="w-full px-3 py-2 text-sm rounded-xl dp-input">
                <option value="">Select door...</option>
                {doors.map((d) => <option key={d.id} value={d.id}>{d.door_code} — {d.building_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Category *</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 text-sm rounded-xl dp-input">
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Title *</label>
            <input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full px-3 py-2 text-sm rounded-xl dp-input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Detailed Observation *</label>
            <textarea rows={3} required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 text-sm rounded-xl dp-input" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Severity</label>
              <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} className="w-full px-3 py-2 text-sm rounded-xl dp-input">
                <option>Critical</option><option>High</option><option>Medium</option><option>Low</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Priority</label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full px-3 py-2 text-sm rounded-xl dp-input">
                <option>P1</option><option>P2</option><option>P3</option><option>P4</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Due Date</label>
              <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="w-full px-3 py-2 text-sm rounded-xl dp-input" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Assign Technician (Optional)</label>
            <select value={form.assigned_technician_id} onChange={(e) => setForm({ ...form, assigned_technician_id: e.target.value })} className="w-full px-3 py-2 text-sm rounded-xl dp-input">
              <option value="">Leave Open / Unassigned</option>
              {technicians.map((t) => <option key={t.id} value={t.user_id || t.id}>{t.full_name || t.email} ({t.role})</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 text-xs font-medium rounded-xl dp-btn-glass">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-xs font-medium rounded-xl dp-btn-primary">
              {saving ? 'Logging...' : 'Log Deficiency'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
