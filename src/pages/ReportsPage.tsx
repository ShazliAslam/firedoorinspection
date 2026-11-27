import React, { useEffect, useState } from 'react';
import {
  FileText,
  Plus,
  Download,
  Share2,
  CheckCircle2,
  Lock,
  Eye,
  Link2,
  Copy,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { generateBrandedPdf, type ReportDataset } from '../lib/pdfGenerator';
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
import type { ReportRecord, Client, Building, Inspection } from '../types';

const REPORT_TYPES = [
  'Building Inspection',
  'Door Inspection',
  'Client Summary',
  'Deficiencies',
  'Remediation',
  'Before & After Evidence',
  'Outstanding Deficiencies',
];

export default function ReportsPage() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const canGenerate = hasRole(['owner', 'admin', 'inspector']);
  const canShare = hasRole(['owner', 'admin']);

  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Generation & Live PDF Preview state
  const [modalOpen, setModalOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');
  const [pendingPdf, setPendingPdf] = useState<{
    pdfBase64: string;
    title: string;
    metadata: Record<string, number>;
  } | null>(null);

  // Expiring signed share link modal
  const [shareTarget, setShareTarget] = useState<ReportRecord | null>(null);
  const [expiryHours, setExpiryHours] = useState(72);
  const [expiringLink, setExpiringLink] = useState<{ url: string; expiresAt: string } | null>(null);

  const [form, setForm] = useState({
    report_type: 'Building Inspection',
    client_id: '',
    building_id: '',
    inspection_id: '',
    title: '',
    shared_with_client: true,
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rpts, cls, blds, ins] = await Promise.all([
        apiFetch<ReportRecord[]>('/api/reports'),
        apiFetch<Client[]>('/api/portfolio?entity=clients'),
        apiFetch<Building[]>('/api/portfolio?entity=buildings'),
        apiFetch<Inspection[]>('/api/inspections'),
      ]);
      setReports(rpts);
      setClients(cls);
      setBuildings(blds);
      setInspections(ins);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Step 1: Compile live database dataset & preview PDF before saving/downloading
  const handleCompilePreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.client_id) {
      setError('Select a client portfolio.');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        action: 'dataset',
        client_id: form.client_id,
        report_type: form.report_type,
      });
      if (form.building_id) params.set('building_id', form.building_id);
      if (form.inspection_id) params.set('inspection_id', form.inspection_id);

      const dataset = await apiFetch<ReportDataset>(`/api/reports?${params.toString()}`);
      const finalTitle =
        form.title.trim() || `${dataset.client?.name || 'Client'} — ${form.report_type} Report`;

      const { pdfBase64, doc } = await generateBrandedPdf(form.report_type, finalTitle, dataset);
      const blobUrl = URL.createObjectURL(doc.output('blob'));
      setPreviewBlobUrl(blobUrl);
      setPreviewTitle(finalTitle);
      setPendingPdf({
        pdfBase64,
        title: finalTitle,
        metadata: {
          doors: dataset.doors.length,
          deficiencies: dataset.deficiencies.length,
          evidence_photos: dataset.evidence.length,
        },
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  // Step 2: Save previewed PDF into Private Supabase Storage & register in `reports`
  const handlePublishPendingPdf = async () => {
    if (!pendingPdf) return;
    setGenerating(true);
    setError(null);
    try {
      const created = await apiFetch<ReportRecord>('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          client_id: form.client_id,
          building_id: form.building_id || null,
          inspection_id: form.inspection_id || null,
          report_type: form.report_type,
          title: pendingPdf.title,
          pdfBase64: pendingPdf.pdfBase64,
          shared_with_client: form.shared_with_client,
          metadata: pendingPdf.metadata,
        }),
      });
      toast({
        tone: 'success',
        title: `Published ${created.report_code}`,
        description: form.shared_with_client
          ? 'Saved to vault & published to Client Portal.'
          : 'Saved to private vault.',
      });
      setModalOpen(false);
      setPreviewBlobUrl(null);
      setPendingPdf(null);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const toggleShare = async (report: ReportRecord) => {
    try {
      await apiFetch('/api/reports', {
        method: 'PUT',
        body: JSON.stringify({ id: report.id, shared_with_client: !report.shared_with_client }),
      });
      toast({
        tone: 'success',
        title: !report.shared_with_client ? 'Published to Client Portal' : 'Revoked Client Access',
        description: report.report_code,
      });
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleGenerateExpiringLink = async () => {
    if (!shareTarget) return;
    setGenerating(true);
    try {
      const res = await apiFetch<{ url: string; expiresAt: string }>('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          action: 'create_share_link',
          id: shareTarget.id,
          expires_in_hours: expiryHours,
        }),
      });
      setExpiringLink(res);
      toast({ tone: 'success', title: 'Expiring client link generated' });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const clientBuildings = buildings.filter((b) => !form.client_id || b.client_id === form.client_id);
  const clientInspections = inspections.filter(
    (i) =>
      (!form.client_id || i.client_id === form.client_id) &&
      (!form.building_id || i.building_id === form.building_id)
  );

  return (
    <div>
      <PageHeader
        title="Reports & Evidence Packages"
        description="Preview branded fire-door PDF packages before publishing, store in private vault, and share via expiring links."
        actions={
          canGenerate && (
            <button
              onClick={() => {
                setPreviewBlobUrl(null);
                setPendingPdf(null);
                setForm({
                  report_type: 'Building Inspection',
                  client_id: clients[0]?.id || '',
                  building_id: '',
                  inspection_id: '',
                  title: '',
                  shared_with_client: true,
                });
                setModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-xl dp-btn-primary"
            >
              <Plus className="w-4 h-4" />
              Generate & Preview PDF
            </button>
          )
        }
      />

      {error && <InlineAlert type="error" message={error} onDismiss={() => setError(null)} />}

      {loading ? (
        <TableSkeleton rows={5} />
      ) : reports.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No PDF packages generated yet"
          description="Compile live Supabase inspection checklists, deficiencies, and photographic evidence into a branded PDF."
          action={
            canGenerate && (
              <button onClick={() => setModalOpen(true)} className="px-4 py-2 text-xs font-medium rounded-xl dp-btn-primary">
                Build First PDF Report
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
                  <th className="px-4 py-3">Report Code / Title</th>
                  <th className="px-4 py-3">Package Type</th>
                  <th className="px-4 py-3">Client & Building</th>
                  <th className="px-4 py-3">Client Portal</th>
                  <th className="px-4 py-3">Generated</th>
                  <th className="px-4 py-3 text-right">Preview / Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50">
                {reports.map((rpt) => (
                  <tr key={rpt.id} className="hover:bg-white/75 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="font-mono font-semibold text-slate-950">{rpt.report_code}</div>
                      <div className="text-slate-600 mt-0.5">{rpt.title}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={rpt.report_type} />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-slate-900">{rpt.client_name}</div>
                      <div className="text-[11px] text-slate-500">{rpt.building_name}</div>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {rpt.shared_with_client ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Published
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-400">
                          <Lock className="w-3.5 h-3.5" /> Internal
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap">
                      <div>{new Date(rpt.created_at).toLocaleDateString()}</div>
                      <div className="text-[11px] text-slate-400">{rpt.generated_by_name}</div>
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap space-x-1.5">
                      {rpt.download_url && (
                        <>
                          <button
                            onClick={() => {
                              setPreviewTitle(`${rpt.report_code} — ${rpt.title}`);
                              setPreviewBlobUrl(rpt.download_url || null);
                              setPendingPdf(null);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg dp-btn-glass"
                          >
                            <Eye className="w-3.5 h-3.5" /> Preview
                          </button>
                          <a
                            href={rpt.download_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg dp-btn-glass"
                          >
                            <Download className="w-3.5 h-3.5" /> PDF
                          </a>
                        </>
                      )}
                      {canGenerate && (
                        <button
                          onClick={() => {
                            setShareTarget(rpt);
                            setExpiringLink(null);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg"
                        >
                          <Link2 className="w-3.5 h-3.5" /> Expiring Link
                        </button>
                      )}
                      {canShare && (
                        <button
                          onClick={() => toggleShare(rpt)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          {rpt.shared_with_client ? 'Unshare' : 'Portal'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Generate + Live Preview Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Generate & Preview Branded PDF Package"
        subtitle="Compile live Supabase records and inspect the full PDF before saving or publishing."
        maxWidth={previewBlobUrl ? 'max-w-4xl' : 'max-w-xl'}
      >
        {!previewBlobUrl ? (
          <form onSubmit={handleCompilePreview} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Report Type *</label>
              <select value={form.report_type} onChange={(e) => setForm({ ...form, report_type: e.target.value })} className="w-full px-3 py-2 text-sm rounded-xl dp-input">
                {REPORT_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Client *</label>
                <select required value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value, building_id: '', inspection_id: '' })} className="w-full px-3 py-2 text-sm rounded-xl dp-input">
                  <option value="">Select client...</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Building (Optional)</label>
                <select value={form.building_id} onChange={(e) => setForm({ ...form, building_id: e.target.value, inspection_id: '' })} className="w-full px-3 py-2 text-sm rounded-xl dp-input">
                  <option value="">All Client Buildings</option>
                  {clientBuildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Specific Inspection (Optional)</label>
              <select value={form.inspection_id} onChange={(e) => setForm({ ...form, inspection_id: e.target.value })} className="w-full px-3 py-2 text-sm rounded-xl dp-input">
                <option value="">Portfolio-wide summary</option>
                {clientInspections.map((i) => <option key={i.id} value={i.id}>{i.inspection_code} — {i.title}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Custom Title (Optional)</label>
              <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Q4 Fire Door Handover Package" className="w-full px-3 py-2 text-sm rounded-xl dp-input" />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input type="checkbox" checked={form.shared_with_client} onChange={(e) => setForm({ ...form, shared_with_client: e.target.checked })} className="rounded border-slate-300" />
              Publish immediately to the Client Portal & log notification
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-xs font-medium rounded-xl dp-btn-glass">Cancel</button>
              <button type="submit" disabled={generating} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl dp-btn-blue">
                <Eye className="w-3.5 h-3.5" />
                {generating ? 'Compiling PDF...' : 'Compile Live Preview'}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100 h-[62vh]">
              <iframe src={previewBlobUrl} title={previewTitle} className="w-full h-full" />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                onClick={() => {
                  setPreviewBlobUrl(null);
                  setPendingPdf(null);
                }}
                className="px-4 py-2 text-xs font-medium rounded-xl dp-btn-glass"
              >
                ← Edit Parameters
              </button>
              <div className="flex gap-2">
                <a
                  href={previewBlobUrl}
                  download={`${previewTitle.replace(/[^a-z0-9]+/gi, '-')}.pdf`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl dp-btn-glass"
                >
                  <Download className="w-3.5 h-3.5" /> Download Draft
                </a>
                {pendingPdf && (
                  <button
                    disabled={generating}
                    onClick={handlePublishPendingPdf}
                    className="px-4 py-2 text-xs font-medium rounded-xl dp-btn-primary"
                  >
                    {generating ? 'Publishing...' : 'Save to Vault & Publish'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Standalone Preview Modal for Existing Saved Reports */}
      <Modal
        open={Boolean(!modalOpen && previewBlobUrl)}
        onClose={() => setPreviewBlobUrl(null)}
        title={previewTitle}
        maxWidth="max-w-4xl"
      >
        {previewBlobUrl && (
          <div className="space-y-3">
            <div className="rounded-xl overflow-hidden border border-slate-200 h-[65vh]">
              <iframe src={previewBlobUrl} title={previewTitle} className="w-full h-full" />
            </div>
            <div className="flex justify-end">
              <a href={previewBlobUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl dp-btn-primary">
                <Download className="w-3.5 h-3.5" /> Open / Download PDF
              </a>
            </div>
          </div>
        )}
      </Modal>

      {/* Expiring Signed Share Link Modal */}
      <Modal
        open={Boolean(shareTarget)}
        onClose={() => setShareTarget(null)}
        title={`Secure Expiring Link — ${shareTarget?.report_code || ''}`}
        subtitle="Generates a cryptographically signed Supabase Storage URL that automatically expires."
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Link Expiration Window</label>
            <select
              value={expiryHours}
              onChange={(e) => setExpiryHours(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm rounded-xl dp-input"
            >
              <option value={24}>24 Hours</option>
              <option value={72}>72 Hours (3 Days)</option>
              <option value={168}>7 Days (Maximum)</option>
            </select>
          </div>
          <button
            onClick={handleGenerateExpiringLink}
            disabled={generating}
            className="w-full py-2.5 text-xs font-medium rounded-xl dp-btn-blue"
          >
            {generating ? 'Signing URL...' : 'Generate Expiring Download Link'}
          </button>

          {expiringLink && (
            <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200 space-y-2">
              <div className="text-[11px] font-semibold text-emerald-900">
                Expires {new Date(expiringLink.expiresAt).toLocaleString()}
              </div>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={expiringLink.url}
                  className="flex-1 px-2.5 py-1.5 text-[11px] font-mono bg-white border border-emerald-200 rounded-lg"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(expiringLink.url);
                    toast({ tone: 'success', title: 'Signed link copied to clipboard' });
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg dp-btn-primary"
                >
                  <Copy className="w-3.5 h-3.5" /> Copy
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
