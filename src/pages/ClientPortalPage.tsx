import { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Building2,
  ClipboardCheck,
  AlertTriangle,
  FileText,
  Download,
  CheckCircle2,
  Lock,
  Eye,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import {
  PageHeader,
  Modal,
  DashboardSkeleton,
  InlineAlert,
  StatusBadge,
} from '../components/UiPrimitives';
import type { Building, Inspection, Deficiency, ReportRecord } from '../types';

export default function ClientPortalPage() {
  const { workspace } = useAuth();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [deficiencies, setDeficiencies] = useState<Deficiency[]>([]);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'deficiencies' | 'reports'>('overview');
  const [previewReport, setPreviewReport] = useState<ReportRecord | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<Building[]>('/api/portfolio?entity=buildings'),
      apiFetch<Inspection[]>('/api/inspections'),
      apiFetch<Deficiency[]>('/api/deficiencies'),
      apiFetch<ReportRecord[]>('/api/reports'),
    ])
      .then(([b, i, d, r]) => {
        setBuildings(b);
        setInspections(i);
        setDeficiencies(d);
        setReports(r);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <DashboardSkeleton />;
  if (error) return <InlineAlert type="error" message={error} />;

  const openDefs = deficiencies.filter((d) => !['Verified', 'Closed'].includes(d.status));
  const verifiedDefs = deficiencies.filter((d) => ['Verified', 'Closed'].includes(d.status));

  return (
    <div>
      <PageHeader
        title={`${workspace?.assignedClient?.name || 'Client'} — Fire Door Portal`}
        description="Read-only compliance portal isolated strictly to your assigned buildings, inspections, deficiencies, verified repairs, and approved reports."
        actions={
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs font-semibold text-emerald-800">
            <Lock className="w-3.5 h-3.5" />
            Tenant & Client Isolated
          </span>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-6">
        <div className="glass-panel rounded-2xl p-4">
          <div className="text-xs text-slate-500 flex items-center justify-between">
            My Buildings <Building2 className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-mono font-semibold text-slate-950 mt-1.5">{buildings.length}</div>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <div className="text-xs text-slate-500 flex items-center justify-between">
            Inspections <ClipboardCheck className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-mono font-semibold text-blue-700 mt-1.5">{inspections.length}</div>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <div className="text-xs text-slate-500 flex items-center justify-between">
            Outstanding Defs <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-mono font-semibold text-rose-600 mt-1.5">{openDefs.length}</div>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <div className="text-xs text-slate-500 flex items-center justify-between">
            Verified Repairs <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-mono font-semibold text-emerald-600 mt-1.5">{verifiedDefs.length}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {[
          { id: 'overview', label: 'Buildings & Inspections', icon: ShieldCheck },
          { id: 'deficiencies', label: `Deficiencies & Repairs (${deficiencies.length})`, icon: AlertTriangle },
          { id: 'reports', label: `Approved Reports (${reports.length})`, icon: FileText },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-xl transition-all ${
              tab === t.id ? 'bg-slate-950 text-white' : 'dp-btn-glass'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {buildings.map((b) => (
              <div key={b.id} className="glass-panel rounded-2xl p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-950">{b.name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {b.address}, {b.city} {b.state}
                    </p>
                  </div>
                  <span className="font-mono text-xs bg-white/80 border border-slate-200 px-2.5 py-0.5 rounded-lg">
                    {b.door_count} doors
                  </span>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs">
                  <span className="text-slate-500">{b.building_type}</span>
                  <span className={b.open_deficiency_count ? 'text-rose-600 font-semibold' : 'text-emerald-600 font-semibold'}>
                    {b.open_deficiency_count} Open Deficiencies
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200/70 bg-white/40 text-sm font-semibold text-slate-950">
              Inspection History
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/75 border-b border-slate-200/70 text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Code</th>
                    <th className="px-4 py-2.5">Building</th>
                    <th className="px-4 py-2.5">Inspector</th>
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/50">
                  {inspections.map((ins) => (
                    <tr key={ins.id} className="hover:bg-white/60">
                      <td className="px-4 py-3 font-mono font-semibold text-slate-950">{ins.inspection_code}</td>
                      <td className="px-4 py-3">{ins.building_name}</td>
                      <td className="px-4 py-3">{ins.inspector_name}</td>
                      <td className="px-4 py-3 font-mono">{ins.scheduled_date}</td>
                      <td className="px-4 py-3"><StatusBadge status={ins.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'deficiencies' && (
        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/75 border-b border-slate-200/70 text-slate-500">
                <tr>
                  <th className="px-4 py-3">Code / Door</th>
                  <th className="px-4 py-3">Building</th>
                  <th className="px-4 py-3">Issue & Verified Resolution</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50">
                {deficiencies.map((d) => (
                  <tr key={d.id} className="hover:bg-white/60">
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="font-mono font-semibold text-slate-950">{d.deficiency_code}</div>
                      <div className="text-[11px] text-slate-500">Door {d.door_code}</div>
                    </td>
                    <td className="px-4 py-3.5">{d.building_name}</td>
                    <td className="px-4 py-3.5 max-w-md">
                      <div className="font-medium text-slate-900">{d.title}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{d.resolution_notes || d.description}</div>
                    </td>
                    <td className="px-4 py-3.5"><StatusBadge status={d.severity} /></td>
                    <td className="px-4 py-3.5"><StatusBadge status={d.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'reports' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reports.length === 0 ? (
            <div className="col-span-2 glass-panel rounded-2xl p-10 text-center text-xs text-slate-500">
              No reports have been published to your Client Portal yet.
            </div>
          ) : (
            reports.map((r) => (
              <div key={r.id} className="glass-panel rounded-2xl p-5 flex items-center justify-between gap-4">
                <div>
                  <div className="font-mono text-xs font-semibold text-blue-700">{r.report_code}</div>
                  <h4 className="text-sm font-semibold text-slate-950 mt-0.5">{r.title}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {r.report_type} • {r.building_name} • {new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
                {r.download_url && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setPreviewReport(r)} className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-xl dp-btn-glass">
                      <Eye className="w-3.5 h-3.5" /> Preview
                    </button>
                    <a href={r.download_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-xl dp-btn-primary">
                      <Download className="w-3.5 h-3.5" /> PDF
                    </a>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      <Modal
        open={Boolean(previewReport)}
        onClose={() => setPreviewReport(null)}
        title={previewReport ? `${previewReport.report_code} — ${previewReport.title}` : ''}
        maxWidth="max-w-4xl"
      >
        {previewReport?.download_url && (
          <div className="rounded-xl overflow-hidden border border-slate-200 h-[66vh]">
            <iframe src={previewReport.download_url} title={previewReport.title} className="w-full h-full" />
          </div>
        )}
      </Modal>
    </div>
  );
}
