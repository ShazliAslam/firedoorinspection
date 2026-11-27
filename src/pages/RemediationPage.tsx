import React, { useEffect, useState } from 'react';
import {
  Wrench,
  Camera,
  CheckCircle2,
  XCircle,
  Send,
  Lock,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { apiFetch, fileToBase64 } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  PageHeader,
  Modal,
  CardGridSkeleton,
  EmptyState,
  InlineAlert,
  StatusBadge,
} from '../components/UiPrimitives';
import type { RemediationTask, EvidenceFile } from '../types';

export default function RemediationPage() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const canVerify = hasRole(['owner', 'admin', 'inspector']);
  const canExecuteRepair = hasRole(['owner', 'admin', 'inspector', 'technician']);

  const [tasks, setTasks] = useState<RemediationTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  const [active, setActive] = useState<RemediationTask | null>(null);
  const [evidence, setEvidence] = useState<EvidenceFile[]>([]);
  const [repairNotes, setRepairNotes] = useState('');
  const [partsNeeded, setPartsNeeded] = useState('');
  const [progressStatus, setProgressStatus] = useState('In Progress');
  const [rejectionReason, setRejectionReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingType, setUploadingType] = useState<string | null>(null);

  const loadTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<RemediationTask[]>('/api/deficiencies?mode=remediations');
      setTasks(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const openTask = async (task: RemediationTask) => {
    setActive(task);
    setRepairNotes(task.repair_notes || '');
    setPartsNeeded(task.parts_needed || '');
    setProgressStatus(task.status === 'Awaiting Parts' ? 'Awaiting Parts' : 'In Progress');
    setRejectionReason('');
    try {
      const ev = await apiFetch<EvidenceFile[]>(`/api/evidence?deficiency_id=${task.deficiency_id}`);
      setEvidence(ev);
    } catch {
      setEvidence([]);
    }
  };

  const uploadPhoto = async (
    e: React.ChangeEvent<HTMLInputElement>,
    evType: 'before_repair' | 'after_repair'
  ) => {
    const file = e.target.files?.[0];
    if (!file || !active) return;
    setUploadingType(evType);
    setError(null);
    try {
      const base64 = await fileToBase64(file);
      await apiFetch('/api/evidence', {
        method: 'POST',
        body: JSON.stringify({
          fileName: file.name,
          fileBase64: base64,
          contentType: file.type,
          evidence_type: evType,
          deficiency_id: active.deficiency_id,
          remediation_task_id: active.id,
          fire_door_id: active.fire_door_id,
          caption: `${evType === 'before_repair' ? 'Before' : 'After'} repair (${active.door_code})`,
        }),
      });
      const ev = await apiFetch<EvidenceFile[]>(`/api/evidence?deficiency_id=${active.deficiency_id}`);
      setEvidence(ev);
      toast({ tone: 'success', title: `Uploaded ${evType === 'before_repair' ? 'Before' : 'After'} photo` });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploadingType(null);
      e.target.value = '';
    }
  };

  const saveRepairProgress = async (submitForVerify = false) => {
    if (!active) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/deficiencies', {
        method: 'PUT',
        body: JSON.stringify({
          action: submitForVerify ? 'submit_for_verification' : 'update_remediation',
          id: active.deficiency_id,
          status: progressStatus,
          parts_needed: partsNeeded,
          repair_notes: repairNotes,
        }),
      });
      toast({
        tone: 'success',
        title: submitForVerify ? 'Submitted for verification' : 'Repair progress saved',
      });
      setActive(null);
      await loadTasks();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyDecision = async (approve: boolean) => {
    if (!active) return;
    if (!approve && !rejectionReason.trim()) {
      setError('Enter a clear rejection reason before returning this repair to the technician.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/deficiencies', {
        method: 'PUT',
        body: JSON.stringify({
          action: approve ? 'verify_approve' : 'verify_reject',
          id: active.deficiency_id,
          close_immediately: approve,
          resolution_notes: repairNotes,
          rejection_reason: rejectionReason,
        }),
      });
      toast({
        tone: approve ? 'success' : 'info',
        title: approve ? 'Repair verified & closed' : 'Returned for technician rework',
      });
      setActive(null);
      await loadTasks();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const filtered = tasks.filter((t) => (!statusFilter ? true : t.status === statusFilter));
  const originalPhotos = evidence.filter((e) => e.evidence_type === 'inspection_original');
  const beforePhotos = evidence.filter((e) => e.evidence_type === 'before_repair');
  const afterPhotos = evidence.filter((e) => e.evidence_type === 'after_repair');

  return (
    <div>
      <PageHeader
        title="Remediation & Verification"
        description="Mobile technician repair workflow with before/after photographic evidence and mandatory inspector approval."
        actions={
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl dp-input"
          >
            <option value="">All Repair Stages</option>
            <option value="Assigned">Assigned</option>
            <option value="In Progress">In Progress</option>
            <option value="Awaiting Parts">Awaiting Parts</option>
            <option value="Submitted for Verification">Submitted for Verification</option>
            <option value="Rejected">Rejected (Rework)</option>
            <option value="Verified">Verified</option>
          </select>
        }
      />

      {error && <InlineAlert type="error" message={error} onDismiss={() => setError(null)} />}

      {loading ? (
        <CardGridSkeleton count={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="No remediation tasks queued"
          description="Assign a technician to any open deficiency to start the remediation & verification workflow."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((task) => (
            <div
              key={task.id}
              onClick={() => openTask(task)}
              className="glass-panel glass-panel-hover rounded-2xl p-5 cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-mono text-xs font-semibold text-slate-950">
                      {task.deficiency?.deficiency_code || 'DEF'} • {task.door_code}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {task.building_name} • {task.door_location}
                    </div>
                  </div>
                  <StatusBadge status={task.status} />
                </div>

                <h3 className="text-sm font-semibold text-slate-950 mt-3 leading-snug">
                  {task.deficiency?.title || 'Fire Door Repair'}
                </h3>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                  {task.repair_notes || task.deficiency?.description}
                </p>

                {task.rejection_reason && (
                  <div className="mt-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>Rework required: {task.rejection_reason}</span>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500">
                <span>Tech: {task.assigned_technician_name || 'Unassigned'}</span>
                <span className="font-mono">Due: {task.due_date || '-'}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(active)}
        onClose={() => setActive(null)}
        title={active ? `${active.deficiency?.deficiency_code || 'Repair'} — Door ${active.door_code}` : ''}
        subtitle={active ? `${active.client_name} • ${active.building_name}` : ''}
        maxWidth="max-w-3xl"
      >
        {active && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <StatusBadge status={active.status} />
                {active.deficiency?.severity && <StatusBadge status={active.deficiency.severity} />}
              </div>
              <span className="text-xs text-slate-500">
                Assigned Technician: <strong>{active.assigned_technician_name}</strong>
              </span>
            </div>

            {active.rejection_reason && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                <strong>Previous Verification Rejected:</strong> {active.rejection_reason}
              </div>
            )}

            {/* 3-Column Evidence Proof: Original (Immutable) | Before | After */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/80">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-slate-500" /> Original ({originalPhotos.length})
                  </span>
                </div>
                {originalPhotos.length === 0 ? (
                  <div className="text-[11px] text-slate-400 py-6 text-center">No original inspection photo</div>
                ) : (
                  <div className="space-y-2">
                    {originalPhotos.map((p) => (
                      <a key={p.id} href={p.signed_url || '#'} target="_blank" rel="noreferrer">
                        <img src={p.signed_url || ''} alt={p.file_name} className="w-full h-28 object-cover rounded-lg border border-slate-200" />
                      </a>
                    ))}
                  </div>
                )}
              </div>

              <div className="border border-slate-200 rounded-xl p-3 bg-white">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">
                    Before ({beforePhotos.length})
                  </span>
                  {canExecuteRepair && active.status !== 'Verified' && (
                    <label className="text-[11px] text-blue-600 font-semibold cursor-pointer inline-flex items-center gap-1">
                      <Camera className="w-3.5 h-3.5" />
                      {uploadingType === 'before_repair' ? '...' : 'Capture'}
                      <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={(e) => uploadPhoto(e, 'before_repair')} />
                    </label>
                  )}
                </div>
                {beforePhotos.length === 0 ? (
                  <div className="text-[11px] text-slate-400 py-6 text-center border border-dashed border-slate-200 rounded-lg">
                    Capture pre-work photo
                  </div>
                ) : (
                  <div className="space-y-2">
                    {beforePhotos.map((p) => (
                      <a key={p.id} href={p.signed_url || '#'} target="_blank" rel="noreferrer">
                        <img src={p.signed_url || ''} alt={p.file_name} className="w-full h-28 object-cover rounded-lg border border-slate-200" />
                      </a>
                    ))}
                  </div>
                )}
              </div>

              <div className="border border-slate-200 rounded-xl p-3 bg-white">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                    After ({afterPhotos.length})
                  </span>
                  {canExecuteRepair && active.status !== 'Verified' && (
                    <label className="text-[11px] text-blue-600 font-semibold cursor-pointer inline-flex items-center gap-1">
                      <Camera className="w-3.5 h-3.5" />
                      {uploadingType === 'after_repair' ? '...' : 'Capture'}
                      <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={(e) => uploadPhoto(e, 'after_repair')} />
                    </label>
                  )}
                </div>
                {afterPhotos.length === 0 ? (
                  <div className="text-[11px] text-slate-400 py-6 text-center border border-dashed border-slate-200 rounded-lg">
                    Capture completed photo
                  </div>
                ) : (
                  <div className="space-y-2">
                    {afterPhotos.map((p) => (
                      <a key={p.id} href={p.signed_url || '#'} target="_blank" rel="noreferrer">
                        <img src={p.signed_url || ''} alt={p.file_name} className="w-full h-28 object-cover rounded-lg border border-slate-200" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {canExecuteRepair && active.status !== 'Verified' && (
              <div className="space-y-3 border-t border-slate-200 pt-4">
                <h4 className="text-xs font-semibold text-slate-900">Technician Work Log</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Work Status</label>
                    <select value={progressStatus} onChange={(e) => setProgressStatus(e.target.value)} className="w-full px-3 py-2 text-xs rounded-xl dp-input">
                      <option value="In Progress">In Progress</option>
                      <option value="Awaiting Parts">Awaiting Parts</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Parts / Hardware Used</label>
                    <input type="text" value={partsNeeded} onChange={(e) => setPartsNeeded(e.target.value)} placeholder="LCN 4040XP UL-listed closer..." className="w-full px-3 py-2 text-xs rounded-xl dp-input" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Repair & Resolution Notes</label>
                  <textarea rows={3} value={repairNotes} onChange={(e) => setRepairNotes(e.target.value)} placeholder="Hardware installed, latch cycle test, clearances..." className="w-full px-3 py-2 text-xs rounded-xl dp-input" />
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  <button type="button" disabled={saving} onClick={() => saveRepairProgress(false)} className="px-3.5 py-2 text-xs font-medium rounded-xl dp-btn-glass">
                    Save Progress
                  </button>
                  <button type="button" disabled={saving} onClick={() => saveRepairProgress(true)} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl dp-btn-blue">
                    <Send className="w-3.5 h-3.5" />
                    Submit for Verification
                  </button>
                </div>
              </div>
            )}

            {canVerify && active.status === 'Submitted for Verification' && (
              <div className="p-4 rounded-xl bg-indigo-50/75 border border-indigo-200 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-indigo-950">
                  <ShieldCheck className="w-4 h-4 text-indigo-700" />
                  Authorized Inspector / Manager Verification Gate
                </div>
                <input
                  type="text"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="If rejecting, specify rework required..."
                  className="w-full px-3 py-2 text-xs rounded-xl dp-input"
                />
                <div className="flex flex-wrap gap-2 justify-end">
                  <button type="button" disabled={saving} onClick={() => handleVerifyDecision(false)} className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-rose-700 bg-white border border-rose-300 hover:bg-rose-50 rounded-xl">
                    <XCircle className="w-3.5 h-3.5" /> Reject & Return
                  </button>
                  <button type="button" disabled={saving} onClick={() => handleVerifyDecision(true)} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve & Verify
                  </button>
                </div>
              </div>
            )}

            {active.status === 'Verified' && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                Verified by <strong>{active.verified_by_name}</strong> on{' '}
                {active.verified_at ? new Date(active.verified_at).toLocaleString() : ''}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
