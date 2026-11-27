import React, { useEffect, useState, useRef } from 'react';
import {
  ClipboardCheck,
  Plus,
  Camera,
  Check,
  X,
  Minus,
  AlertTriangle,
  Send,
  Save,
  ArrowLeft,
  ShieldAlert,
  Lock,
  CloudCheck,
  Loader2,
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
} from '../components/UiPrimitives';
import type { Building, FireDoor, Inspection, InspectionItem, EvidenceFile } from '../types';

export default function InspectionsPage() {
  const { workspace, hasRole } = useAuth();
  const { toast } = useToast();
  const canInspect = hasRole(['owner', 'admin', 'inspector']);

  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [allDoors, setAllDoors] = useState<FireDoor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active inspection runner
  const [activeIns, setActiveIns] = useState<Inspection | null>(null);
  const [activeDoorId, setActiveDoorId] = useState<string>('');
  const [localItems, setLocalItems] = useState<InspectionItem[]>([]);
  const [evidence, setEvidence] = useState<EvidenceFile[]>([]);
  const [summaryNotes, setSummaryNotes] = useState('');
  const [reviewerChecked, setReviewerChecked] = useState(false);
  const [savingProgress, setSavingProgress] = useState(false);
  const [autosaveState, setAutosaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string>('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const dirtyRef = useRef(false);

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    building_id: '',
    template_id: '',
    title: '',
    inspector_id: '',
    scheduled_date: new Date().toISOString().slice(0, 10),
    door_ids: [] as string[],
  });

  const loadList = async () => {
    setLoading(true);
    setError(null);
    try {
      const [insData, bData, dData] = await Promise.all([
        apiFetch<Inspection[]>('/api/inspections'),
        apiFetch<Building[]>('/api/portfolio?entity=buildings'),
        apiFetch<FireDoor[]>('/api/portfolio?entity=doors'),
      ]);
      setInspections(insData);
      setBuildings(bData);
      setAllDoors(dData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadList();
  }, []);

  // Debounced real database autosave + crash-recovery draft backup while conducting an inspection
  useEffect(() => {
    if (!activeIns || activeIns.status === 'Completed' || !canInspect || !dirtyRef.current) return;
    const draftKey = `doorproof_draft_${activeIns.id}`;
    try {
      sessionStorage.setItem(draftKey, JSON.stringify({ items: localItems, summaryNotes }));
    } catch {
      // ignore quota errors
    }

    const timer = setTimeout(async () => {
      setAutosaveState('saving');
      try {
        await apiFetch('/api/inspections', {
          method: 'PUT',
          body: JSON.stringify({
            action: 'save_progress',
            id: activeIns.id,
            items: localItems,
            summary_notes: summaryNotes,
          }),
        });
        dirtyRef.current = false;
        setAutosaveState('saved');
        setLastSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        sessionStorage.removeItem(draftKey);
      } catch {
        setAutosaveState('idle');
      }
    }, 1600);

    return () => clearTimeout(timer);
  }, [localItems, summaryNotes, activeIns?.id]);

  const openInspectionDetail = async (id: string) => {
    setLoading(true);
    setError(null);
    dirtyRef.current = false;
    setAutosaveState('idle');
    try {
      const [detail, evFiles] = await Promise.all([
        apiFetch<Inspection>(`/api/inspections?id=${id}`),
        apiFetch<EvidenceFile[]>(`/api/evidence?inspection_id=${id}`),
      ]);
      setActiveIns(detail);
      setEvidence(evFiles);
      setReviewerChecked(Boolean(detail.reviewer_disclaimer_accepted));
      setActiveDoorId(detail.doors?.[0]?.id || detail.door_ids?.[0] || '');

      // Check for unsaved local recovery draft if browser closed mid-inspection
      const draftKey = `doorproof_draft_${id}`;
      const rawDraft = detail.status !== 'Completed' ? sessionStorage.getItem(draftKey) : null;
      if (rawDraft) {
        try {
          const parsed = JSON.parse(rawDraft);
          setLocalItems(parsed.items || detail.items || []);
          setSummaryNotes(parsed.summaryNotes ?? detail.summary_notes ?? '');
          toast({ tone: 'info', title: 'Draft recovered', description: 'Restored unsaved field checklist edits.' });
        } catch {
          setLocalItems(detail.items || []);
          setSummaryNotes(detail.summary_notes || '');
        }
      } else {
        setLocalItems(detail.items || []);
        setSummaryNotes(detail.summary_notes || '');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    const firstBld = buildings[0]?.id || '';
    const bldDoors = allDoors.filter((d) => d.building_id === firstBld).map((d) => d.id);
    setForm({
      building_id: firstBld,
      template_id: workspace?.templates?.[0]?.id || '',
      title: '',
      inspector_id: workspace?.member?.user_id || '',
      scheduled_date: new Date().toISOString().slice(0, 10),
      door_ids: bldDoors,
    });
    setCreateOpen(true);
  };

  const handleBuildingChange = (bldId: string) => {
    const bldDoors = allDoors.filter((d) => d.building_id === bldId).map((d) => d.id);
    setForm((prev) => ({ ...prev, building_id: bldId, door_ids: bldDoors }));
  };

  const toggleDoorSelect = (doorId: string) => {
    setForm((prev) => ({
      ...prev,
      door_ids: prev.door_ids.includes(doorId)
        ? prev.door_ids.filter((x) => x !== doorId)
        : [...prev.door_ids, doorId],
    }));
  };

  const handleCreateInspection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.door_ids.length === 0) {
      setError('Select at least one fire door for this inspection.');
      return;
    }
    setSavingProgress(true);
    setError(null);
    try {
      const created = await apiFetch<Inspection>('/api/inspections', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setCreateOpen(false);
      toast({ tone: 'success', title: `Scheduled ${created.inspection_code}` });
      await loadList();
      await openInspectionDetail(created.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingProgress(false);
    }
  };

  const updateItemLocal = (itemId: string, patch: Partial<InspectionItem>) => {
    dirtyRef.current = true;
    setLocalItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, ...patch } : it)));
  };

  const saveDraft = async () => {
    if (!activeIns) return;
    setSavingProgress(true);
    setError(null);
    try {
      await apiFetch('/api/inspections', {
        method: 'PUT',
        body: JSON.stringify({
          action: 'save_progress',
          id: activeIns.id,
          items: localItems,
          summary_notes: summaryNotes,
        }),
      });
      dirtyRef.current = false;
      setAutosaveState('saved');
      setLastSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      toast({ tone: 'success', title: 'Draft saved' });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingProgress(false);
    }
  };

  const createDeficiencyFromItem = async (item: InspectionItem) => {
    if (!activeIns) return;
    setSavingProgress(true);
    setError(null);
    try {
      await apiFetch('/api/inspections', {
        method: 'PUT',
        body: JSON.stringify({ action: 'save_progress', id: activeIns.id, items: [item] }),
      });
      const def = await apiFetch<any>('/api/inspections', {
        method: 'PUT',
        body: JSON.stringify({
          action: 'create_deficiency_from_item',
          id: activeIns.id,
          item_id: item.id,
          severity: item.severity_suggested || 'High',
          priority: item.severity_suggested === 'Critical' ? 'P1' : 'P2',
          description: item.observation || `Failed checklist check: ${item.item_label}`,
        }),
      });
      toast({ tone: 'success', title: `Logged ${def.deficiency_code}`, description: item.category });
      await openInspectionDetail(activeIns.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingProgress(false);
    }
  };

  const submitInspection = async () => {
    if (!activeIns) return;
    if (!reviewerChecked) {
      setError('Confirm qualified professional review before submitting this inspection.');
      return;
    }
    setSavingProgress(true);
    setError(null);
    try {
      const result = await apiFetch<any>('/api/inspections', {
        method: 'PUT',
        body: JSON.stringify({
          action: 'submit',
          id: activeIns.id,
          items: localItems,
          summary_notes: summaryNotes,
          reviewer_disclaimer_accepted: true,
          auto_create_deficiencies: true,
        }),
      });
      sessionStorage.removeItem(`doorproof_draft_${activeIns.id}`);
      toast({
        tone: 'success',
        title: `Inspection ${activeIns.inspection_code} Submitted`,
        description: `${result.createdDeficiencies?.length || 0} new deficiencies logged & door statuses synced.`,
      });
      await openInspectionDetail(activeIns.id);
      loadList();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingProgress(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeIns) return;
    setUploadingPhoto(true);
    setError(null);
    try {
      const base64 = await fileToBase64(file);
      await apiFetch('/api/evidence', {
        method: 'POST',
        body: JSON.stringify({
          fileName: file.name,
          fileBase64: base64,
          contentType: file.type,
          evidence_type: 'inspection_original',
          client_id: activeIns.client_id,
          building_id: activeIns.building_id,
          fire_door_id: activeDoorId || null,
          inspection_id: activeIns.id,
          caption: `Inspection ${activeIns.inspection_code} field photo`,
        }),
      });
      toast({ tone: 'success', title: 'Immutable inspection photo uploaded' });
      const evFiles = await apiFetch<EvidenceFile[]>(`/api/evidence?inspection_id=${activeIns.id}`);
      setEvidence(evFiles);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  // ================= MOBILE-FIRST FIELD INSPECTION RUNNER =================
  if (activeIns) {
    const doorItems = localItems.filter((i) => i.fire_door_id === activeDoorId);
    const doorEvidence = evidence.filter((e) => !activeDoorId || e.fire_door_id === activeDoorId);
    const isCompleted = activeIns.status === 'Completed';
    const completedChecks = localItems.filter((i) => i.result !== 'Pending').length;
    const pctDone = localItems.length ? Math.round((completedChecks / localItems.length) * 100) : 0;

    return (
      <div className="pb-20 lg:pb-6">
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={() => {
              setActiveIns(null);
              loadList();
            }}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-950"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Inspections
          </button>

          {/* Autosave status pill */}
          {!isCompleted && canInspect && (
            <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              {autosaveState === 'saving' ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                  Autosaving draft...
                </>
              ) : autosaveState === 'saved' ? (
                <>
                  <CloudCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Saved {lastSavedAt}
                </>
              ) : (
                <span>Draft autosave active</span>
              )}
            </div>
          )}
        </div>

        <PageHeader
          title={`${activeIns.inspection_code} — ${activeIns.title}`}
          description={`${activeIns.client_name} • ${activeIns.building_name} • ${completedChecks}/${localItems.length} checkpoints (${pctDone}%)`}
          actions={
            <div className="flex items-center gap-2">
              <StatusBadge status={activeIns.status} />
              {canInspect && !isCompleted && (
                <>
                  <button
                    onClick={saveDraft}
                    disabled={savingProgress}
                    className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl dp-btn-glass"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save Draft
                  </button>
                  <button
                    onClick={submitInspection}
                    disabled={savingProgress}
                    className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-xl dp-btn-blue"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Submit Inspection
                  </button>
                </>
              )}
            </div>
          }
        />

        {error && <InlineAlert type="error" message={error} onDismiss={() => setError(null)} />}

        {/* Door Switcher Pills */}
        <div className="flex items-center gap-2.5 overflow-x-auto pb-3 mb-5">
          {(activeIns.doors || []).map((door) => {
            const dItems = localItems.filter((it) => it.fire_door_id === door.id);
            const fails = dItems.filter((it) => it.result === 'Fail').length;
            const done = dItems.filter((it) => it.result !== 'Pending').length;
            const selected = door.id === activeDoorId;
            return (
              <button
                key={door.id}
                onClick={() => setActiveDoorId(door.id)}
                className={`shrink-0 px-4 py-2.5 rounded-2xl border text-left transition-all ${
                  selected
                    ? 'bg-slate-950 text-white border-slate-950 shadow-md'
                    : 'glass-panel hover:bg-white text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold">{door.door_code}</span>
                  {fails > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] rounded-md bg-rose-500 text-white font-semibold">
                      {fails} Fail
                    </span>
                  )}
                </div>
                <div className={`text-[11px] mt-0.5 ${selected ? 'text-slate-300' : 'text-slate-500'}`}>
                  {door.room_location} • {done}/{dItems.length}
                </div>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Ergonomic Checklist Cards with Large Touch Targets */}
          <div className="lg:col-span-2 space-y-3">
            {doorItems.map((item) => (
              <div
                key={item.id}
                className={`glass-panel rounded-2xl p-4 sm:p-5 transition-all ${
                  item.result === 'Fail'
                    ? 'border-rose-300 bg-rose-50/40'
                    : item.result === 'Pass'
                    ? 'border-emerald-300/70'
                    : ''
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-700">
                      {item.category}
                    </span>
                    <p className="text-sm font-medium text-slate-950 mt-0.5 leading-snug">
                      {item.item_label}
                    </p>
                  </div>
                  {/* Large Mobile Touch Targets */}
                  <div className="grid grid-cols-3 sm:flex items-center gap-1.5 shrink-0">
                    {(['Pass', 'Fail', 'N/A'] as const).map((resVal) => {
                      const active = item.result === resVal;
                      const style =
                        resVal === 'Pass'
                          ? active
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-white/90 text-slate-600 border-slate-200 hover:border-emerald-400'
                          : resVal === 'Fail'
                          ? active
                            ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                            : 'bg-white/90 text-slate-600 border-slate-200 hover:border-rose-400'
                          : active
                          ? 'bg-slate-700 text-white border-slate-700'
                          : 'bg-white/90 text-slate-600 border-slate-200 hover:border-slate-400';

                      return (
                        <button
                          key={resVal}
                          type="button"
                          disabled={isCompleted || !canInspect}
                          onClick={() => updateItemLocal(item.id, { result: resVal })}
                          className={`inline-flex items-center justify-center gap-1 px-3 py-2.5 sm:py-1.5 text-xs font-semibold rounded-xl border transition-all ${style} disabled:opacity-65`}
                        >
                          {resVal === 'Pass' && <Check className="w-3.5 h-3.5" />}
                          {resVal === 'Fail' && <X className="w-3.5 h-3.5" />}
                          {resVal === 'N/A' && <Minus className="w-3.5 h-3.5" />}
                          {resVal}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-3.5 flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    disabled={isCompleted || !canInspect}
                    value={item.observation || ''}
                    onChange={(e) => updateItemLocal(item.id, { observation: e.target.value })}
                    placeholder="Field observation / clearance measurement..."
                    className="flex-1 px-3 py-2 text-xs rounded-xl dp-input disabled:opacity-60"
                  />
                  {item.result === 'Fail' && (
                    <div className="flex items-center gap-2">
                      <select
                        disabled={isCompleted || !canInspect}
                        value={item.severity_suggested || 'High'}
                        onChange={(e) =>
                          updateItemLocal(item.id, { severity_suggested: e.target.value as any })
                        }
                        className="px-2.5 py-2 text-xs border border-rose-200 bg-rose-50 text-rose-800 rounded-xl"
                      >
                        <option value="Critical">Critical</option>
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                      {item.deficiency_created ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-2 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl">
                          Deficiency Logged
                        </span>
                      ) : (
                        canInspect &&
                        !isCompleted && (
                          <button
                            type="button"
                            onClick={() => createDeficiencyFromItem(item)}
                            className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white rounded-xl whitespace-nowrap"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Log DEF
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Right Sidebar: Mobile Camera Evidence + Review Sign-Off */}
          <div className="space-y-5">
            <div className="glass-panel rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-950">Inspection Evidence</h3>
                  <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                    <Lock className="w-3 h-3" /> Locked immutable upon upload
                  </p>
                </div>
                {canInspect && (
                  <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl dp-btn-primary cursor-pointer">
                    <Camera className="w-3.5 h-3.5" />
                    {uploadingPhoto ? 'Uploading...' : 'Camera / Photo'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      capture="environment"
                      className="hidden"
                      onChange={handlePhotoUpload}
                      disabled={uploadingPhoto}
                    />
                  </label>
                )}
              </div>

              {doorEvidence.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-300/70 rounded-xl">
                  Tap Camera / Photo to capture original door evidence.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  {doorEvidence.map((ev) => (
                    <a
                      key={ev.id}
                      href={ev.signed_url || '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="block border border-slate-200/80 rounded-xl overflow-hidden hover:border-blue-400 transition-colors bg-white"
                    >
                      {ev.signed_url && (ev.mime_type || '').startsWith('image/') ? (
                        <img src={ev.signed_url} alt={ev.file_name} className="w-full h-24 object-cover" />
                      ) : (
                        <div className="h-24 bg-slate-100 flex items-center justify-center text-xs text-slate-500">
                          {ev.file_name}
                        </div>
                      )}
                      <div className="p-1.5 text-[10px] text-slate-600 truncate bg-slate-50">
                        {ev.caption || ev.file_name}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>

            <div className="glass-panel rounded-2xl p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  Inspection Summary Notes
                </label>
                <textarea
                  rows={4}
                  disabled={isCompleted || !canInspect}
                  value={summaryNotes}
                  onChange={(e) => {
                    dirtyRef.current = true;
                    setSummaryNotes(e.target.value);
                  }}
                  placeholder="Overall building observations, access notes, or escort details..."
                  className="w-full px-3 py-2 text-xs rounded-xl dp-input disabled:opacity-60"
                />
              </div>

              <div className="p-3.5 rounded-xl bg-amber-50/90 border border-amber-200/90 text-xs text-amber-950">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={isCompleted || !canInspect}
                      checked={reviewerChecked}
                      onChange={(e) => setReviewerChecked(e.target.checked)}
                      className="mt-0.5 rounded border-amber-400"
                    />
                    <span className="leading-relaxed">
                      I confirm a qualified professional reviewed all recorded inspection criteria.
                      DoorProof AI does not independently certify regulatory compliance.
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Mobile Bottom Action Bar */}
        {canInspect && !isCompleted && (
          <div className="sm:hidden fixed bottom-0 inset-x-0 z-30 glass-surface bg-white/95 border-t border-slate-200 px-4 py-3 flex items-center gap-2">
            <button onClick={saveDraft} disabled={savingProgress} className="flex-1 py-2.5 text-xs font-semibold rounded-xl dp-btn-glass">
              Save Draft
            </button>
            <button onClick={submitInspection} disabled={savingProgress} className="flex-1 py-2.5 text-xs font-semibold rounded-xl dp-btn-blue">
              Submit Inspection
            </button>
          </div>
        )}
      </div>
    );
  }

  // ================= LIST VIEW =================
  const doorsForSelectedBuilding = allDoors.filter((d) => d.building_id === form.building_id);
  const inspectors = (workspace?.members || []).filter((m) =>
    ['owner', 'admin', 'inspector'].includes(m.role)
  );

  return (
    <div>
      <PageHeader
        title="Inspections"
        description="Schedule, execute, and submit fire-door assembly inspections with real-time draft autosave."
        actions={
          canInspect && (
            <button onClick={openCreateModal} className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-xl dp-btn-primary">
              <Plus className="w-4 h-4" />
              New Inspection
            </button>
          )
        }
      />

      {error && <InlineAlert type="error" message={error} onDismiss={() => setError(null)} />}

      {loading ? (
        <TableSkeleton rows={5} />
      ) : inspections.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No inspections scheduled"
          description="Create an inspection, assign an inspector, and run your configurable checklist across selected fire doors."
          action={
            canInspect && (
              <button onClick={openCreateModal} className="px-4 py-2 text-xs font-medium rounded-xl dp-btn-primary">
                Schedule Inspection
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
                  <th className="px-4 py-3">Inspection ID</th>
                  <th className="px-4 py-3">Building & Client</th>
                  <th className="px-4 py-3">Inspector</th>
                  <th className="px-4 py-3">Doors & Results</th>
                  <th className="px-4 py-3">Scheduled</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50">
                {inspections.map((ins) => (
                  <tr
                    key={ins.id}
                    onClick={() => openInspectionDetail(ins.id)}
                    className="hover:bg-white/80 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3.5">
                      <div className="font-mono font-semibold text-slate-950">{ins.inspection_code}</div>
                      <div className="text-[11px] text-slate-500">{ins.title}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-slate-900">{ins.building_name}</div>
                      <div className="text-[11px] text-slate-500">{ins.client_name}</div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-700">{ins.inspector_name}</td>
                    <td className="px-4 py-3.5 font-mono">
                      <span>{ins.door_count} doors</span>
                      <span className="ml-2 text-emerald-600 font-semibold">{ins.pass_count}P</span>
                      <span className="ml-1.5 text-rose-600 font-semibold">{ins.fail_count}F</span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap">{ins.scheduled_date}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <StatusBadge status={ins.status} />
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="text-blue-600 font-semibold hover:underline">
                        {ins.status === 'Completed' ? 'Review' : 'Conduct →'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Schedule Fire Door Inspection"
        subtitle="Select a building, versioned checklist template, inspector, and target fire doors."
      >
        <form onSubmit={handleCreateInspection} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Inspection Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Annual Fire Door Assembly Inspection — Q4"
              className="w-full px-3 py-2 text-sm rounded-xl dp-input"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Building *</label>
              <select
                required
                value={form.building_id}
                onChange={(e) => handleBuildingChange(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl dp-input"
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
              <label className="block text-xs font-medium text-slate-700 mb-1">Checklist Template</label>
              <select
                value={form.template_id}
                onChange={(e) => setForm({ ...form, template_id: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-xl dp-input"
              >
                {(workspace?.templates || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.items?.length || 0} items)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Assigned Inspector</label>
              <select
                value={form.inspector_id}
                onChange={(e) => setForm({ ...form, inspector_id: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-xl dp-input"
              >
                {inspectors.map((m) => (
                  <option key={m.id} value={m.user_id || m.id}>
                    {m.full_name || m.email} ({m.role})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Scheduled Date</label>
              <input
                type="date"
                value={form.scheduled_date}
                onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-xl dp-input"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-700">
                Select Fire Doors ({form.door_ids.length} selected)
              </label>
              <button
                type="button"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    door_ids:
                      prev.door_ids.length === doorsForSelectedBuilding.length
                        ? []
                        : doorsForSelectedBuilding.map((d) => d.id),
                  }))
                }
                className="text-xs text-blue-600 hover:underline font-medium"
              >
                Toggle All
              </button>
            </div>
            <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
              {doorsForSelectedBuilding.length === 0 ? (
                <div className="p-3 text-xs text-slate-400">No registered fire doors in this building yet.</div>
              ) : (
                doorsForSelectedBuilding.map((d) => (
                  <label key={d.id} className="flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.door_ids.includes(d.id)}
                      onChange={() => toggleDoorSelect(d.id)}
                      className="rounded border-slate-300"
                    />
                    <span className="font-mono font-semibold text-slate-900">{d.door_code}</span>
                    <span className="text-slate-500 truncate">
                      {d.floor} • {d.room_location}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 text-xs font-medium rounded-xl dp-btn-glass">Cancel</button>
            <button type="submit" disabled={savingProgress} className="px-4 py-2 text-xs font-medium rounded-xl dp-btn-primary">
              {savingProgress ? 'Creating...' : 'Create & Open Checklist'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
