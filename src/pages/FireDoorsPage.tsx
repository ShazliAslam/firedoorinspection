import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DoorClosed,
  Plus,
  Search,
  QrCode,
  ScanLine,
  Edit2,
  Download,
  Upload,
  CheckSquare,
  Archive,
  Calendar,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { exportToCsv, parseCsvText } from '../lib/csv';
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
import QrCodeModal, { QrScannerModal } from '../components/QrCodeModal';
import type { Building, FireDoor } from '../types';

export default function FireDoorsPage() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const canEdit = hasRole(['owner', 'admin', 'inspector']);

  const [doors, setDoors] = useState<FireDoor[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [buildingFilter, setBuildingFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState<'door_code' | 'building_name' | 'status'>('door_code');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Bulk selection & modals
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDueDate, setBulkDueDate] = useState('');
  const [confirmBulkArchive, setConfirmBulkArchive] = useState(false);

  const [qrDoor, setQrDoor] = useState<FireDoor | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importBuildingId, setImportBuildingId] = useState('');
  const [importRows, setImportRows] = useState<Array<Record<string, string>>>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FireDoor | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    building_id: '',
    door_code: '',
    floor: 'Floor 1',
    room_location: '',
    door_reference: '',
    manufacturer: 'Steelcraft',
    door_type: 'Hollow Metal',
    fire_rating: '90-Min',
    frame_material: 'Hollow Metal Steel',
    installation_date: '',
    next_inspection_due: '',
    notes: '',
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [dData, bData] = await Promise.all([
        apiFetch<FireDoor[]>('/api/portfolio?entity=doors'),
        apiFetch<Building[]>('/api/portfolio?entity=buildings'),
      ]);
      setDoors(dData);
      setBuildings(bData);
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

  const openCreate = () => {
    setEditing(null);
    setForm({
      building_id: buildings[0]?.id || '',
      door_code: `FD-${Math.floor(1000 + Math.random() * 9000)}`,
      floor: 'Floor 1',
      room_location: '',
      door_reference: '',
      manufacturer: 'Steelcraft',
      door_type: 'Hollow Metal',
      fire_rating: '90-Min',
      frame_material: 'Hollow Metal Steel',
      installation_date: '',
      next_inspection_due: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
      notes: '',
    });
    setModalOpen(true);
  };

  const openEdit = (door: FireDoor) => {
    setEditing(door);
    setForm({
      building_id: door.building_id,
      door_code: door.door_code,
      floor: door.floor || '',
      room_location: door.room_location,
      door_reference: door.door_reference || '',
      manufacturer: door.manufacturer || '',
      door_type: door.door_type || 'Hollow Metal',
      fire_rating: door.fire_rating || '90-Min',
      frame_material: door.frame_material || '',
      installation_date: door.installation_date || '',
      next_inspection_due: door.next_inspection_due || '',
      notes: door.notes || '',
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
          body: JSON.stringify({ entity: 'doors', id: editing.id, ...form }),
        });
        toast({ tone: 'success', title: 'Fire door updated', description: form.door_code });
      } else {
        await apiFetch('/api/portfolio', {
          method: 'POST',
          body: JSON.stringify({ entity: 'doors', ...form }),
        });
        toast({ tone: 'success', title: 'Fire door registered', description: form.door_code });
      }
      setModalOpen(false);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const runBulkAction = async (operation: 'update_status' | 'schedule_due' | 'archive', payload: any = {}) => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<{ updated: number }>('/api/portfolio', {
        method: 'POST',
        body: JSON.stringify({ entity: 'doors_bulk', operation, ids: selectedIds, ...payload }),
      });
      toast({ tone: 'success', title: `Updated ${res.updated} fire doors` });
      setConfirmBulkArchive(false);
      setBulkDueDate('');
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleExportCsv = () => {
    exportToCsv(
      'doorproof-fire-doors.csv',
      ['door_code', 'building_name', 'floor', 'room_location', 'door_type', 'fire_rating', 'manufacturer', 'status', 'next_inspection_due', 'qr_token'],
      filtered.map((d) => [
        d.door_code,
        d.building_name,
        d.floor,
        d.room_location,
        d.door_type,
        d.fire_rating,
        d.manufacturer,
        d.status,
        d.next_inspection_due,
        d.qr_token,
      ])
    );
    toast({ tone: 'success', title: 'Fire doors exported', description: `${filtered.length} records.` });
  };

  const handleImportCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImportRows(parseCsvText(String(reader.result || '')));
    reader.readAsText(file);
  };

  const handleImportSubmit = async () => {
    if (!importBuildingId || importRows.length === 0) return;
    setSaving(true);
    try {
      const res = await apiFetch<{ imported: number }>('/api/portfolio', {
        method: 'POST',
        body: JSON.stringify({
          entity: 'doors_bulk',
          operation: 'import_csv',
          building_id: importBuildingId,
          rows: importRows,
        }),
      });
      toast({ tone: 'success', title: 'CSV Import Complete', description: `Registered ${res.imported} fire doors with QR tags.` });
      setImportOpen(false);
      setImportRows([]);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const filtered = doors
    .filter((d) => {
      if (buildingFilter && d.building_id !== buildingFilter) return false;
      if (statusFilter && d.status !== statusFilter) return false;
      const q = search.toLowerCase();
      return (
        d.door_code.toLowerCase().includes(q) ||
        d.room_location.toLowerCase().includes(q) ||
        (d.building_name || '').toLowerCase().includes(q) ||
        (d.qr_token || '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1;
      return String(a[sortBy] || '').localeCompare(String(b[sortBy] || '')) * mul;
    });

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const toggleSelectAllPage = () => {
    const pageIds = paged.map((d) => d.id);
    const allSelected = pageIds.every((id) => selectedIds.includes(id));
    if (allSelected) setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    else setSelectedIds((prev) => [...new Set([...prev, ...pageIds])]);
  };

  return (
    <div>
      <PageHeader
        title="Fire Door Registry"
        description="Asset register of rated fire door assemblies with QR scanning, CSV import/export, and bulk scheduling."
        actions={
          <>
            <button onClick={() => setScannerOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl dp-btn-glass">
              <ScanLine className="w-3.5 h-3.5 text-blue-600" /> Scan QR
            </button>
            <button onClick={handleExportCsv} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl dp-btn-glass">
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
            {canEdit && (
              <>
                <button
                  onClick={() => {
                    setImportBuildingId(buildings[0]?.id || '');
                    setImportRows([]);
                    setImportOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl dp-btn-glass"
                >
                  <Upload className="w-3.5 h-3.5" /> Import CSV
                </button>
                <button onClick={openCreate} className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-xl dp-btn-primary">
                  <Plus className="w-4 h-4" /> Register Door
                </button>
              </>
            )}
          </>
        }
      />

      {error && <InlineAlert type="error" message={error} onDismiss={() => setError(null)} />}

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-2.5 mb-4">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search Door ID, room, QR token..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl dp-input"
          />
        </div>
        <select
          value={buildingFilter}
          onChange={(e) => {
            setBuildingFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 text-xs rounded-xl dp-input"
        >
          <option value="">All Buildings</option>
          {buildings.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 text-xs rounded-xl dp-input"
        >
          <option value="">All Statuses</option>
          <option value="Pass">Pass</option>
          <option value="Deficient">Deficient</option>
          <option value="In Remediation">In Remediation</option>
          <option value="Needs Inspection">Needs Inspection</option>
        </select>
      </div>

      {/* Bulk Action Bar */}
      {canEdit && selectedIds.length > 0 && (
        <div className="mb-4 glass-surface rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 border-blue-300/60 bg-blue-50/70">
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-950">
            <CheckSquare className="w-4 h-4 text-blue-600" />
            {selectedIds.length} door{selectedIds.length > 1 ? 's' : ''} selected
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <input
                type="date"
                value={bulkDueDate}
                onChange={(e) => setBulkDueDate(e.target.value)}
                className="px-2 py-1 text-xs rounded-lg dp-input"
              />
              <button
                disabled={!bulkDueDate || saving}
                onClick={() => runBulkAction('schedule_due', { next_inspection_due: bulkDueDate })}
                className="px-2.5 py-1 text-xs font-medium rounded-lg dp-btn-blue disabled:opacity-40"
              >
                Set Next Due
              </button>
            </div>
            <button
              onClick={() => runBulkAction('update_status', { status: 'Needs Inspection' })}
              className="px-2.5 py-1 text-xs font-medium rounded-lg dp-btn-glass"
            >
              Mark Needs Inspection
            </button>
            <button
              onClick={() => setConfirmBulkArchive(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100"
            >
              <Archive className="w-3.5 h-3.5" /> Archive
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={DoorClosed}
          title="No fire doors match your filter"
          description="Register fire door assemblies individually or bulk-import a door schedule CSV."
          action={
            canEdit && (
              <button onClick={openCreate} className="px-4 py-2 text-xs font-medium rounded-xl dp-btn-primary">
                Register Fire Door
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
                  {canEdit && (
                    <th className="px-4 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={paged.length > 0 && paged.every((d) => selectedIds.includes(d.id))}
                        onChange={toggleSelectAllPage}
                        className="rounded border-slate-300"
                      />
                    </th>
                  )}
                  <th className="px-4 py-3">
                    <SortableHeader label="Door ID" active={sortBy === 'door_code'} direction={sortDir} onClick={() => toggleSort('door_code')} />
                  </th>
                  <th className="px-4 py-3">
                    <SortableHeader label="Building & Location" active={sortBy === 'building_name'} direction={sortDir} onClick={() => toggleSort('building_name')} />
                  </th>
                  <th className="px-4 py-3">Assembly Spec</th>
                  <th className="px-4 py-3">Inspection Schedule</th>
                  <th className="px-4 py-3">
                    <SortableHeader label="Status" active={sortBy === 'status'} direction={sortDir} onClick={() => toggleSort('status')} />
                  </th>
                  <th className="px-4 py-3 text-right">QR / Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50">
                {paged.map((door) => (
                  <tr key={door.id} className="hover:bg-white/75 transition-colors">
                    {canEdit && (
                      <td className="px-4 py-3.5">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(door.id)}
                          onChange={() =>
                            setSelectedIds((prev) =>
                              prev.includes(door.id)
                                ? prev.filter((x) => x !== door.id)
                                : [...prev, door.id]
                            )
                          }
                          className="rounded border-slate-300"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="font-mono font-semibold text-slate-950">{door.door_code}</div>
                      {door.door_reference && (
                        <div className="text-[11px] text-slate-400">{door.door_reference}</div>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-slate-900">{door.building_name}</div>
                      <div className="text-[11px] text-slate-500">
                        {door.floor} • {door.room_location}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-slate-800">
                        {door.door_type} •{' '}
                        <span className="font-mono font-semibold text-blue-700">{door.fire_rating}</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {door.manufacturer} ({door.frame_material || 'Steel frame'})
                      </div>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-slate-600">
                      <div>
                        Last:{' '}
                        {door.last_inspection_date
                          ? new Date(door.last_inspection_date).toLocaleDateString()
                          : 'Pending'}
                      </div>
                      {door.next_inspection_due && (
                        <div className="text-[11px] text-blue-700 font-mono">
                          Next: {door.next_inspection_due}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <StatusBadge status={door.status} />
                      {(door.open_deficiencies || 0) > 0 && (
                        <div className="text-[11px] text-rose-600 font-medium mt-0.5">
                          {door.open_deficiencies} open def.
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap space-x-1">
                      <button
                        onClick={() => setQrDoor(door)}
                        className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg"
                        title="View QR Label"
                      >
                        <QrCode className="w-4 h-4" />
                      </button>
                      {canEdit && (
                        <button
                          onClick={() => openEdit(door)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 rounded-lg"
                          title="Edit Door"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar page={page} totalItems={filtered.length} pageSize={pageSize} onPageChange={setPage} />
        </div>
      )}

      {/* Door Register/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit Fire Door ${editing.door_code}` : 'Register Fire Door Assembly'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Building *</label>
              <select
                required
                disabled={Boolean(editing)}
                value={form.building_id}
                onChange={(e) => setForm({ ...form, building_id: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-xl dp-input disabled:opacity-60"
              >
                <option value="">Select building...</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.client_name})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Door ID / Tag *</label>
              <input
                type="text"
                required
                value={form.door_code}
                onChange={(e) => setForm({ ...form, door_code: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono rounded-xl dp-input"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Floor</label>
              <input type="text" value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} className="w-full px-3 py-2 text-sm rounded-xl dp-input" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Room / Location *</label>
              <input type="text" required value={form.room_location} onChange={(e) => setForm({ ...form, room_location: e.target.value })} className="w-full px-3 py-2 text-sm rounded-xl dp-input" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Fire Rating</label>
              <select value={form.fire_rating} onChange={(e) => setForm({ ...form, fire_rating: e.target.value })} className="w-full px-3 py-2 text-sm rounded-xl dp-input">
                <option>20-Min</option>
                <option>45-Min</option>
                <option>60-Min</option>
                <option>90-Min</option>
                <option>180-Min</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Door Type</label>
              <select value={form.door_type} onChange={(e) => setForm({ ...form, door_type: e.target.value })} className="w-full px-3 py-2 text-sm rounded-xl dp-input">
                <option>Hollow Metal</option>
                <option>Wood Fire-Rated</option>
                <option>Pair / Double Leaf</option>
                <option>Aluminum Glazed</option>
                <option>Roll-Up Fire Door</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Manufacturer</label>
              <input type="text" value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} className="w-full px-3 py-2 text-sm rounded-xl dp-input" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Install Date</label>
              <input type="date" value={form.installation_date} onChange={(e) => setForm({ ...form, installation_date: e.target.value })} className="w-full px-3 py-2 text-sm rounded-xl dp-input" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Next Inspection Due</label>
              <input type="date" value={form.next_inspection_due} onChange={(e) => setForm({ ...form, next_inspection_due: e.target.value })} className="w-full px-3 py-2 text-sm rounded-xl dp-input" />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-xs font-medium rounded-xl dp-btn-glass">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-xs font-medium rounded-xl dp-btn-primary">
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Register Door'}
            </button>
          </div>
        </form>
      </Modal>

      {/* CSV Import Modal */}
      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Bulk Import Fire Doors via CSV"
        subtitle="Supported columns: door_code, floor, room_location, door_type, fire_rating, manufacturer, next_inspection_due"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Target Building *</label>
            <select value={importBuildingId} onChange={(e) => setImportBuildingId(e.target.value)} className="w-full px-3 py-2 text-sm rounded-xl dp-input">
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.client_name})
                </option>
              ))}
            </select>
          </div>
          <input type="file" accept=".csv,text/csv" onChange={handleImportCsvFile} className="text-xs" />
          {importRows.length > 0 && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
              Parsed <strong>{importRows.length}</strong> door rows. Unique QR tokens will be generated automatically.
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => setImportOpen(false)} className="px-4 py-2 text-xs rounded-xl dp-btn-glass">Cancel</button>
            <button disabled={saving || importRows.length === 0} onClick={handleImportSubmit} className="px-4 py-2 text-xs font-medium rounded-xl dp-btn-blue disabled:opacity-50">
              {saving ? 'Importing...' : `Import ${importRows.length} Doors`}
            </button>
          </div>
        </div>
      </Modal>

      <QrCodeModal door={qrDoor} onClose={() => setQrDoor(null)} />
      <QrScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        doors={doors}
        onMatch={(door) => {
          setSearch(door.door_code);
          setQrDoor(door);
          toast({ tone: 'success', title: `Matched Door ${door.door_code}`, description: door.room_location });
        }}
      />
      <ConfirmDialog
        open={confirmBulkArchive}
        onClose={() => setConfirmBulkArchive(false)}
        onConfirm={() => runBulkAction('archive')}
        title={`Archive ${selectedIds.length} Selected Fire Doors?`}
        message="Archived fire doors are hidden from active inspection queues while retaining historical compliance data."
        confirmLabel="Archive Doors"
        danger
        loading={saving}
      />
    </div>
  );
}
