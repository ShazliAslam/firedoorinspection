import React, { useEffect, useState } from 'react';
import {
  Images,
  Lock,
  Trash2,
  Camera,
  SlidersHorizontal,
  ExternalLink,
  Search,
} from 'lucide-react';
import { apiFetch, fileToBase64 } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  PageHeader,
  Modal,
  ConfirmDialog,
  CardGridSkeleton,
  EmptyState,
  InlineAlert,
  StatusBadge,
} from '../components/UiPrimitives';
import type { EvidenceFile, FireDoor } from '../types';

export default function EvidenceGalleryPage() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const canUpload = hasRole(['owner', 'admin', 'inspector', 'technician']);
  const canDelete = hasRole(['owner', 'admin']);

  const [files, setFiles] = useState<EvidenceFile[]>([]);
  const [doors, setDoors] = useState<FireDoor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');

  // Before/After comparison slider state
  const [compareDoorId, setCompareDoorId] = useState<string | null>(null);
  const [sliderPos, setSliderPos] = useState(50);

  // Upload & delete modals
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    fire_door_id: '',
    evidence_type: 'before_repair' as EvidenceFile['evidence_type'],
    caption: '',
  });
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EvidenceFile | null>(null);
  const [lightbox, setLightbox] = useState<EvidenceFile | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ev, drs] = await Promise.all([
        apiFetch<EvidenceFile[]>('/api/evidence'),
        apiFetch<FireDoor[]>('/api/portfolio?entity=doors'),
      ]);
      setFiles(ev);
      setDoors(drs);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const doorMap = Object.fromEntries(doors.map((d) => [d.id, d]));

  // Find doors that have BOTH (original or before_repair) AND after_repair images for side-by-side slider comparison
  const comparableDoors = doors.filter((d) => {
    const dImgs = files.filter((f) => f.fire_door_id === d.id && (f.mime_type || '').startsWith('image/'));
    const hasBefore = dImgs.some((f) => f.evidence_type === 'before_repair' || f.evidence_type === 'inspection_original');
    const hasAfter = dImgs.some((f) => f.evidence_type === 'after_repair');
    return hasBefore && hasAfter;
  });

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const base64 = await fileToBase64(file);
      await apiFetch('/api/evidence', {
        method: 'POST',
        body: JSON.stringify({
          fileName: file.name,
          fileBase64: base64,
          contentType: file.type,
          evidence_type: uploadForm.evidence_type,
          fire_door_id: uploadForm.fire_door_id || null,
          caption: uploadForm.caption || file.name,
        }),
      });
      toast({ tone: 'success', title: 'Evidence uploaded to private vault' });
      setUploadOpen(false);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch('/api/evidence', {
        method: 'DELETE',
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      toast({ tone: 'info', title: 'Evidence file removed' });
      setDeleteTarget(null);
      await loadData();
    } catch (err: any) {
      setError(err.message);
      setDeleteTarget(null);
    }
  };

  const filtered = files.filter((f) => {
    if (typeFilter && f.evidence_type !== typeFilter) return false;
    const door = f.fire_door_id ? doorMap[f.fire_door_id] : null;
    const q = search.toLowerCase();
    return (
      f.file_name.toLowerCase().includes(q) ||
      (f.caption || '').toLowerCase().includes(q) ||
      (door?.door_code || '').toLowerCase().includes(q)
    );
  });

  const activeCompareBefore = compareDoorId
    ? files.find(
        (f) =>
          f.fire_door_id === compareDoorId &&
          (f.evidence_type === 'before_repair' || f.evidence_type === 'inspection_original') &&
          f.signed_url
      )
    : null;
  const activeCompareAfter = compareDoorId
    ? files.find(
        (f) => f.fire_door_id === compareDoorId && f.evidence_type === 'after_repair' && f.signed_url
      )
    : null;

  return (
    <div>
      <PageHeader
        title="Evidence Gallery"
        description="Private, signed-URL vault of immutable original inspection photos, before/after remediation proof, and documents."
        actions={
          canUpload && (
            <button
              onClick={() => {
                setUploadForm({
                  fire_door_id: doors[0]?.id || '',
                  evidence_type: 'before_repair',
                  caption: '',
                });
                setUploadOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-xl dp-btn-primary"
            >
              <Camera className="w-4 h-4" />
              Upload Evidence
            </button>
          )
        }
      />

      {error && <InlineAlert type="error" message={error} onDismiss={() => setError(null)} />}

      {/* Interactive Before/After Comparison Banner when pairs exist */}
      {comparableDoors.length > 0 && (
        <div className="glass-panel rounded-2xl p-4 mb-5 flex flex-wrap items-center justify-between gap-3 border-blue-200/80">
          <div className="flex items-center gap-2.5 text-xs">
            <div className="w-8 h-8 rounded-xl bg-blue-600/10 flex items-center justify-center text-blue-600">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-slate-900">Before & After Visual Comparison Available</div>
              <div className="text-[11px] text-slate-500">
                Inspect interactive slider proof for {comparableDoors.length} remediated fire door(s).
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {comparableDoors.map((d) => (
              <button
                key={d.id}
                onClick={() => {
                  setCompareDoorId(d.id);
                  setSliderPos(50);
                }}
                className="px-3 py-1.5 text-xs font-mono font-semibold rounded-xl dp-btn-blue"
              >
                Compare {d.door_code}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-2.5 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search caption, file name, Door ID..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl dp-input"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: '', label: 'All Evidence' },
            { id: 'inspection_original', label: 'Original Inspection' },
            { id: 'before_repair', label: 'Before Repair' },
            { id: 'after_repair', label: 'After Repair' },
            { id: 'document', label: 'Documents' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTypeFilter(t.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-xl transition-all ${
                typeFilter === t.id ? 'bg-slate-950 text-white' : 'dp-btn-glass'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <CardGridSkeleton count={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Images}
          title="No evidence files in vault"
          description="Upload original inspection photos, before/after repair documentation, or door schedules into private Supabase Storage."
          action={
            canUpload && (
              <button onClick={() => setUploadOpen(true)} className="px-4 py-2 text-xs font-medium rounded-xl dp-btn-primary">
                Upload First Evidence File
              </button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((ev) => {
            const door = ev.fire_door_id ? doorMap[ev.fire_door_id] : null;
            const isImg = (ev.mime_type || '').startsWith('image/');
            return (
              <div key={ev.id} className="glass-panel glass-panel-hover rounded-2xl overflow-hidden flex flex-col">
                <div
                  onClick={() => setLightbox(ev)}
                  className="relative h-44 bg-slate-100 cursor-pointer overflow-hidden"
                >
                  {isImg && ev.signed_url ? (
                    <img src={ev.signed_url} alt={ev.file_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-slate-500 px-4 text-center">
                      {ev.file_name}
                    </div>
                  )}
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                    <StatusBadge status={ev.evidence_type.replace('_', ' ')} />
                    {ev.immutable && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-slate-950/80 text-white rounded-md backdrop-blur-xs">
                        <Lock className="w-2.5 h-2.5" /> Immutable
                      </span>
                    )}
                  </div>
                </div>
                <div className="p-3.5 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-semibold text-slate-900 truncate">
                      {ev.caption || ev.file_name}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {door ? `${door.door_code} • ${door.building_name}` : 'Organization Evidence'}
                    </div>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-400">
                    <span>{new Date(ev.created_at).toLocaleDateString()}</span>
                    <div className="flex items-center gap-1">
                      {ev.signed_url && (
                        <a
                          href={ev.signed_url}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1 text-slate-500 hover:text-blue-600 rounded"
                          title="Open signed URL"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {canDelete && !ev.immutable && (
                        <button
                          onClick={() => setDeleteTarget(ev)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded"
                          title="Delete non-immutable file"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Interactive Before/After Comparison Modal */}
      <Modal
        open={Boolean(compareDoorId && activeCompareBefore && activeCompareAfter)}
        onClose={() => setCompareDoorId(null)}
        title={`Before & After Comparison — ${compareDoorId ? doorMap[compareDoorId]?.door_code : ''}`}
        subtitle="Drag the comparison slider to verify remediation workmanship"
        maxWidth="max-w-2xl"
      >
        {activeCompareBefore && activeCompareAfter && (
          <div className="space-y-4">
            <div className="relative w-full h-80 sm:h-96 rounded-2xl overflow-hidden border border-slate-200 select-none bg-slate-900">
              <img
                src={activeCompareAfter.signed_url || ''}
                alt="After repair"
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div
                className="absolute inset-y-0 left-0 overflow-hidden"
                style={{ width: `${sliderPos}%` }}
              >
                <img
                  src={activeCompareBefore.signed_url || ''}
                  alt="Before repair"
                  className="w-full h-full object-cover max-w-none"
                  style={{ width: '620px' }}
                />
              </div>
              <div
                className="absolute inset-y-0 w-0.5 bg-white shadow-lg"
                style={{ left: `${sliderPos}%` }}
              />
              <span className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-slate-950/75 text-white text-[11px] font-semibold backdrop-blur-xs">
                BEFORE
              </span>
              <span className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-emerald-600/90 text-white text-[11px] font-semibold backdrop-blur-xs">
                AFTER
              </span>
            </div>
            <input
              type="range"
              min={5}
              max={95}
              value={sliderPos}
              onChange={(e) => setSliderPos(Number(e.target.value))}
              className="w-full accent-blue-600"
            />
          </div>
        )}
      </Modal>

      {/* Lightbox Modal */}
      <Modal
        open={Boolean(lightbox)}
        onClose={() => setLightbox(null)}
        title={lightbox?.caption || lightbox?.file_name || 'Evidence Preview'}
        subtitle={lightbox ? `Uploaded by ${lightbox.uploaded_by_name} • ${new Date(lightbox.created_at).toLocaleString()}` : ''}
        maxWidth="max-w-2xl"
      >
        {lightbox?.signed_url && (lightbox.mime_type || '').startsWith('image/') ? (
          <img src={lightbox.signed_url} alt={lightbox.file_name} className="w-full max-h-[65vh] object-contain rounded-xl bg-slate-950" />
        ) : (
          <div className="text-center py-8">
            <a href={lightbox?.signed_url || '#'} target="_blank" rel="noreferrer" className="px-4 py-2 text-xs font-medium rounded-xl dp-btn-blue">
              Open Document in New Tab
            </a>
          </div>
        )}
      </Modal>

      {/* Upload Modal */}
      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload Evidence to Private Vault">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Fire Door</label>
            <select
              value={uploadForm.fire_door_id}
              onChange={(e) => setUploadForm({ ...uploadForm, fire_door_id: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-xl dp-input"
            >
              <option value="">General Organization Document</option>
              {doors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.door_code} — {d.building_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Evidence Type</label>
            <select
              value={uploadForm.evidence_type}
              onChange={(e) => setUploadForm({ ...uploadForm, evidence_type: e.target.value as any })}
              className="w-full px-3 py-2 text-sm rounded-xl dp-input"
            >
              <option value="inspection_original">Original Inspection (Immutable)</option>
              <option value="before_repair">Before Repair Photo</option>
              <option value="after_repair">After Repair Photo</option>
              <option value="document">Door Schedule / Certificate PDF</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Caption / Label</label>
            <input
              type="text"
              value={uploadForm.caption}
              onChange={(e) => setUploadForm({ ...uploadForm, caption: e.target.value })}
              placeholder="e.g. Hinge jamb smoke seal after installation"
              className="w-full px-3 py-2 text-sm rounded-xl dp-input"
            />
          </div>
          <label className="block w-full py-6 border-2 border-dashed border-slate-300 rounded-2xl text-center cursor-pointer hover:border-blue-500 transition-colors">
            <Camera className="w-5 h-5 text-slate-400 mx-auto mb-1.5" />
            <span className="text-xs font-medium text-slate-700">
              {uploading ? 'Uploading to private bucket...' : 'Choose JPEG, PNG, WebP, or PDF (max 10 MB)'}
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              capture="environment"
              className="hidden"
              onChange={handleUploadFile}
              disabled={uploading}
            />
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete Evidence File?"
        message={`Permanently remove "${deleteTarget?.file_name}" from private storage? Original inspection evidence is immutable and cannot be deleted.`}
        confirmLabel="Delete File"
        danger
      />
    </div>
  );
}
