import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Building2,
  Plus,
  Search,
  MapPin,
  Layers,
  Archive,
  Edit2,
  Trash2,
  Download,
  Upload,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { exportToCsv, parseCsvText } from '../lib/csv';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  PageHeader,
  Modal,
  ConfirmDialog,
  CardGridSkeleton,
  EmptyState,
  InlineAlert,
} from '../components/UiPrimitives';
import type { Building, Client } from '../types';

export default function BuildingsPage() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const canManage = hasRole(['owner', 'admin']);

  const [buildings, setBuildings] = useState<Building[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [clientFilter, setClientFilter] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importClientId, setImportClientId] = useState('');
  const [importRows, setImportRows] = useState<Array<Record<string, string>>>([]);
  const [editing, setEditing] = useState<Building | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Building | null>(null);
  const [floorModalBld, setFloorModalBld] = useState<Building | null>(null);
  const [floorForm, setFloorForm] = useState({ name: '', floor_number: '1', area_type: 'Corridor' });
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    client_id: '',
    name: '',
    building_code: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    building_type: 'Healthcare',
    total_floors: 4,
    contact_name: '',
    contact_phone: '',
    contact_email: '',
    notes: '',
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [bData, cData] = await Promise.all([
        apiFetch<Building[]>('/api/portfolio?entity=buildings'),
        apiFetch<Client[]>('/api/portfolio?entity=clients'),
      ]);
      setBuildings(bData);
      setClients(cData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({
      client_id: clients[0]?.id || '',
      name: '',
      building_code: '',
      address: '',
      city: '',
      state: '',
      zip: '',
      building_type: 'Commercial Office',
      total_floors: 3,
      contact_name: '',
      contact_phone: '',
      contact_email: '',
      notes: '',
    });
    setModalOpen(true);
  };

  const openEdit = (b: Building) => {
    setEditing(b);
    setForm({
      client_id: b.client_id,
      name: b.name,
      building_code: b.building_code || '',
      address: b.address,
      city: b.city || '',
      state: b.state || '',
      zip: b.zip || '',
      building_type: b.building_type || 'Commercial Office',
      total_floors: b.total_floors || 1,
      contact_name: b.contact_name || '',
      contact_phone: b.contact_phone || '',
      contact_email: b.contact_email || '',
      notes: b.notes || '',
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await apiFetch('/api/portfolio', {
          method: 'PUT',
          body: JSON.stringify({ entity: 'buildings', id: editing.id, ...form }),
        });
        toast({ tone: 'success', title: 'Building updated', description: form.name });
      } else {
        await apiFetch('/api/portfolio', {
          method: 'POST',
          body: JSON.stringify({ entity: 'buildings', ...form }),
        });
        toast({ tone: 'success', title: 'Building registered', description: form.name });
      }
      setModalOpen(false);
      await loadData();
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
        body: JSON.stringify({ entity: 'buildings', id: archiveTarget.id, archived: true }),
      });
      toast({ tone: 'info', title: 'Building archived', description: archiveTarget.name });
      setArchiveTarget(null);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleExportCsv = () => {
    exportToCsv(
      'doorproof-buildings.csv',
      ['building_code', 'name', 'client_name', 'address', 'city', 'state', 'zip', 'building_type', 'total_floors', 'contact_name', 'contact_phone'],
      filtered.map((b) => [
        b.building_code,
        b.name,
        b.client_name,
        b.address,
        b.city,
        b.state,
        b.zip,
        b.building_type,
        b.total_floors,
        b.contact_name,
        b.contact_phone,
      ])
    );
    toast({ tone: 'success', title: 'Buildings exported', description: `${filtered.length} records downloaded.` });
  };

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsvText(String(reader.result || ''));
      setImportRows(parsed);
    };
    reader.readAsText(file);
  };

  const handleImportSubmit = async () => {
    if (!importClientId || importRows.length === 0) return;
    setSaving(true);
    try {
      const res = await apiFetch<{ imported: number }>('/api/portfolio', {
        method: 'POST',
        body: JSON.stringify({ entity: 'buildings_bulk', client_id: importClientId, rows: importRows }),
      });
      toast({ tone: 'success', title: 'CSV Import Complete', description: `Imported ${res.imported} buildings.` });
      setImportOpen(false);
      setImportRows([]);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddFloor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!floorModalBld || !floorForm.name.trim()) return;
    await apiFetch('/api/portfolio', {
      method: 'POST',
      body: JSON.stringify({ entity: 'floors', building_id: floorModalBld.id, ...floorForm }),
    });
    setFloorForm({ name: '', floor_number: '1', area_type: 'Corridor' });
    const updated = await apiFetch<Building[]>('/api/portfolio?entity=buildings');
    setBuildings(updated);
    setFloorModalBld(updated.find((x) => x.id === floorModalBld.id) || null);
    toast({ tone: 'success', title: 'Floor / area added' });
  };

  const handleDeleteFloor = async (floorId: string) => {
    await apiFetch('/api/portfolio', {
      method: 'DELETE',
      body: JSON.stringify({ entity: 'floors', id: floorId }),
    });
    const updated = await apiFetch<Building[]>('/api/portfolio?entity=buildings');
    setBuildings(updated);
    if (floorModalBld) setFloorModalBld(updated.find((x) => x.id === floorModalBld.id) || null);
  };

  const filtered = buildings.filter((b) => {
    if (clientFilter && b.client_id !== clientFilter) return false;
    const q = search.toLowerCase();
    return (
      b.name.toLowerCase().includes(q) ||
      b.address.toLowerCase().includes(q) ||
      (b.client_name || '').toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <PageHeader
        title="Buildings & Facilities"
        description="Register commercial properties, smoke compartments, floors, and site contacts."
        actions={
          <>
            <button onClick={handleExportCsv} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl dp-btn-glass">
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
            {canManage && (
              <>
                <button
                  onClick={() => {
                    setImportClientId(clients[0]?.id || '');
                    setImportRows([]);
                    setImportOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl dp-btn-glass"
                >
                  <Upload className="w-3.5 h-3.5" /> Import CSV
                </button>
                <button onClick={openCreate} className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-xl dp-btn-primary">
                  <Plus className="w-4 h-4" /> Add Building
                </button>
              </>
            )}
          </>
        }
      />

      {error && <InlineAlert type="error" message={error} onDismiss={() => setError(null)} />}

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search buildings, address, client..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl dp-input"
          />
        </div>
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="px-3 py-2 text-xs rounded-xl dp-input"
        >
          <option value="">All Clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <CardGridSkeleton count={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No buildings registered"
          description="Register a building or import a facility CSV list to start registering fire doors."
          action={
            canManage && (
              <button onClick={openCreate} className="px-4 py-2 text-xs font-medium rounded-xl dp-btn-primary">
                Register Building
              </button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((b) => (
            <div
              key={b.id}
              className="glass-panel glass-panel-hover rounded-2xl p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-semibold text-blue-700">{b.client_name}</span>
                    <h3 className="text-sm font-semibold text-slate-950 mt-0.5">{b.name}</h3>
                  </div>
                  <span className="text-[11px] font-mono px-2 py-0.5 bg-slate-100/90 border border-slate-200/70 text-slate-600 rounded-md">
                    {b.building_code}
                  </span>
                </div>

                <div className="flex items-start gap-1.5 text-xs text-slate-500 mt-2">
                  <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
                  <span>
                    {b.address}
                    {b.city ? `, ${b.city}` : ''}
                    {b.state ? `, ${b.state}` : ''} {b.zip || ''}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-4 pt-3.5 border-t border-slate-200/60 text-center">
                  <div className="bg-white/75 border border-slate-200/60 rounded-xl p-2">
                    <div className="text-sm font-mono font-semibold text-slate-900">
                      {b.door_count || 0}
                    </div>
                    <div className="text-[10px] text-slate-500">Fire Doors</div>
                  </div>
                  <div className="bg-white/75 border border-slate-200/60 rounded-xl p-2">
                    <div
                      className={`text-sm font-mono font-semibold ${
                        (b.open_deficiency_count || 0) > 0 ? 'text-rose-600' : 'text-emerald-600'
                      }`}
                    >
                      {b.open_deficiency_count || 0}
                    </div>
                    <div className="text-[10px] text-slate-500">Open Defs</div>
                  </div>
                  <div className="bg-white/75 border border-slate-200/60 rounded-xl p-2">
                    <div className="text-sm font-mono font-semibold text-slate-900">
                      {b.inspection_count || 0}
                    </div>
                    <div className="text-[10px] text-slate-500">Inspections</div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs">
                <button
                  onClick={() => setFloorModalBld(b)}
                  className="inline-flex items-center gap-1.5 text-slate-600 hover:text-blue-700 font-medium"
                >
                  <Layers className="w-3.5 h-3.5" />
                  {b.floors?.length || 0} Floors / Areas
                </button>
                {canManage && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(b)}
                      className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-200/60 rounded-lg"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setArchiveTarget(b)}
                      className="p-1.5 text-slate-400 hover:text-amber-700 hover:bg-amber-50 rounded-lg"
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Building Create/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Building' : 'Register Building'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Client *</label>
              <select
                required
                value={form.client_id}
                onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-xl dp-input"
              >
                <option value="">Select client...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Building Name *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-xl dp-input"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Street Address *</label>
            <input
              type="text"
              required
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-xl dp-input"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">City</label>
              <input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="w-full px-3 py-2 text-sm rounded-xl dp-input" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">State</label>
              <input type="text" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="w-full px-3 py-2 text-sm rounded-xl dp-input" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">ZIP</label>
              <input type="text" value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} className="w-full px-3 py-2 text-sm rounded-xl dp-input" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Building Type</label>
              <select
                value={form.building_type}
                onChange={(e) => setForm({ ...form, building_type: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-xl dp-input"
              >
                <option>Healthcare</option>
                <option>Commercial Office</option>
                <option>Hospitality</option>
                <option>Educational</option>
                <option>Multi-Family</option>
                <option>Industrial</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Total Floors</label>
              <input
                type="number"
                min={1}
                value={form.total_floors}
                onChange={(e) => setForm({ ...form, total_floors: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm rounded-xl dp-input"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-xs font-medium rounded-xl dp-btn-glass">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-xs font-medium rounded-xl dp-btn-primary">
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Register Building'}
            </button>
          </div>
        </form>
      </Modal>

      {/* CSV Import Modal */}
      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Buildings via CSV"
        subtitle="Columns supported: name, building_code, address, city, state, zip, building_type, total_floors"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Assign to Client *</label>
            <select
              value={importClientId}
              onChange={(e) => setImportClientId(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl dp-input"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <input type="file" accept=".csv,text/csv" onChange={handleCsvFile} className="text-xs" />
          </div>
          {importRows.length > 0 && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
              Parsed <strong>{importRows.length}</strong> building rows ready to import into Supabase.
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => setImportOpen(false)} className="px-4 py-2 text-xs rounded-xl dp-btn-glass">Cancel</button>
            <button
              disabled={saving || importRows.length === 0}
              onClick={handleImportSubmit}
              className="px-4 py-2 text-xs font-medium rounded-xl dp-btn-blue disabled:opacity-50"
            >
              {saving ? 'Importing...' : `Import ${importRows.length} Buildings`}
            </button>
          </div>
        </div>
      </Modal>

      {/* Floors Modal */}
      <Modal
        open={Boolean(floorModalBld)}
        onClose={() => setFloorModalBld(null)}
        title={`Floors & Areas — ${floorModalBld?.name || ''}`}
      >
        <div className="space-y-4">
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {(floorModalBld?.floors || []).length === 0 ? (
              <div className="p-4 text-xs text-slate-400 text-center">No floors or areas defined yet.</div>
            ) : (
              floorModalBld?.floors?.map((f) => (
                <div key={f.id} className="px-3.5 py-2.5 flex items-center justify-between text-xs bg-white">
                  <div>
                    <span className="font-semibold text-slate-900">{f.name}</span>
                    <span className="ml-2 text-slate-500">
                      Floor {f.floor_number} • {f.area_type}
                    </span>
                  </div>
                  <button onClick={() => handleDeleteFloor(f.id)} className="p-1 text-slate-400 hover:text-rose-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
          <form onSubmit={handleAddFloor} className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
            <input
              type="text"
              required
              placeholder="Area name (e.g. North Stairwell)"
              value={floorForm.name}
              onChange={(e) => setFloorForm({ ...floorForm, name: e.target.value })}
              className="px-3 py-2 text-xs rounded-xl dp-input"
            />
            <input
              type="text"
              placeholder="Floor #"
              value={floorForm.floor_number}
              onChange={(e) => setFloorForm({ ...floorForm, floor_number: e.target.value })}
              className="px-3 py-2 text-xs rounded-xl dp-input"
            />
            <button type="submit" className="px-3 py-2 text-xs font-medium rounded-xl dp-btn-primary">
              Add Area
            </button>
          </form>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
        title="Archive Building?"
        message={`Archive "${archiveTarget?.name}"? Associated fire door and inspection history will remain preserved for audits.`}
        confirmLabel="Archive Building"
        danger
        loading={saving}
      />
    </div>
  );
}
