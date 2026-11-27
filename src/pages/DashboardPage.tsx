import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase,
  Building2,
  DoorClosed,
  ClipboardCheck,
  AlertTriangle,
  Wrench,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Activity,
  CalendarClock,
  TrendingUp,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { apiFetch } from '../lib/api';
import {
  PageHeader,
  DashboardSkeleton,
  InlineAlert,
  StatusBadge,
} from '../components/UiPrimitives';

const PIE_COLORS = ['#10b981', '#e11d48', '#f59e0b', '#94a3b8'];

const RANGES = [
  { id: '30d', label: '30D' },
  { id: '90d', label: '90D' },
  { id: '6m', label: '6M' },
  { id: 'all', label: 'All Time' },
];

export default function DashboardPage() {
  const [range, setRange] = useState('6m');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch(`/api/dashboard?range=${range}`)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [range]);

  if (loading && !data) return <DashboardSkeleton />;
  if (error) return <InlineAlert type="error" message={error} />;
  if (!data) return null;

  const { kpis, charts, upcomingTasks, recurringReminders = [], recentActivity = [] } = data;

  const statCards = [
    { label: 'Active Clients', value: kpis.clientsCount, icon: Briefcase, to: '/clients', accent: 'text-slate-900' },
    { label: 'Buildings', value: kpis.buildingsCount, icon: Building2, to: '/buildings', accent: 'text-slate-900' },
    { label: 'Registered Doors', value: kpis.doorsCount, icon: DoorClosed, to: '/doors', accent: 'text-blue-700' },
    { label: 'Completed Inspections', value: kpis.completedInspections, icon: ClipboardCheck, to: '/inspections', accent: 'text-emerald-700' },
    { label: 'Failed Doors', value: kpis.failedDoors, icon: AlertTriangle, to: '/doors', accent: 'text-rose-600' },
    { label: 'Open Deficiencies', value: kpis.openDeficiencies, icon: AlertTriangle, to: '/deficiencies', accent: 'text-rose-600' },
    { label: 'Pending Repairs', value: kpis.pendingRepairs, icon: Wrench, to: '/remediation', accent: 'text-amber-700' },
    { label: 'Verified Repairs', value: kpis.verifiedRepairs, icon: CheckCircle2, to: '/remediation', accent: 'text-emerald-700' },
  ];

  return (
    <div>
      <PageHeader
        title="Operations Dashboard"
        description="Live fire-door compliance telemetry, remediation velocity, recurring deadlines, and audit timeline."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Date Range Filter */}
            <div className="inline-flex p-0.5 rounded-xl bg-white/75 border border-slate-200/80 backdrop-blur-sm">
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRange(r.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all ${
                    range === r.id
                      ? 'bg-slate-950 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {kpis.overdueTasks > 0 && (
              <Link
                to="/deficiencies"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs font-semibold text-rose-700 hover:bg-rose-500/15 transition-colors"
              >
                <Clock className="w-3.5 h-3.5" />
                {kpis.overdueTasks} Overdue
              </Link>
            )}

            <Link
              to="/inspections"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-xl dp-btn-blue"
            >
              New Inspection
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        }
      />

      {/* Performance Summary Strip (Pass Rate + Remediation Completion Rate) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div className="glass-panel rounded-2xl p-5 flex items-center justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
              Inspected Door Pass Rate
            </div>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span className="text-2xl font-semibold font-mono text-slate-950">
                {kpis.passRate}%
              </span>
              <span className="text-xs text-slate-500">
                ({kpis.passedDoors} passing of {kpis.passedDoors + kpis.failedDoors} inspected doors)
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-200/80 rounded-full mt-3 overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-500"
                style={{ width: `${kpis.passRate}%` }}
              />
            </div>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-5 flex items-center justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Remediation Verification Rate
            </div>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span className="text-2xl font-semibold font-mono text-slate-950">
                {kpis.remediationCompletionRate}%
              </span>
              <span className="text-xs text-slate-500">
                ({kpis.pendingRepairs} active / awaiting verification)
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-200/80 rounded-full mt-3 overflow-hidden">
              <div
                className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                style={{ width: `${kpis.remediationCompletionRate}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 8-Card Operational KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-6">
        {statCards.map((card) => (
          <Link
            key={card.label}
            to={card.to}
            className="glass-panel glass-panel-hover rounded-2xl p-4 group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">{card.label}</span>
              <div className="w-7 h-7 rounded-lg bg-slate-100/80 group-hover:bg-blue-50 flex items-center justify-center transition-colors">
                <card.icon className="w-3.5 h-3.5 text-slate-500 group-hover:text-blue-600 transition-colors" />
              </div>
            </div>
            <div className={`text-2xl font-semibold tracking-tight mt-2.5 font-mono ${card.accent}`}>
              {card.value}
            </div>
          </Link>
        ))}
      </div>

      {/* Interactive Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        <div className="lg:col-span-2 glass-panel rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">
                Inspection & Remediation Performance
              </h2>
              <p className="text-xs text-slate-500">
                Database rollup of inspections, logged deficiencies, and verified closures
              </p>
            </div>
            <span className="text-[11px] font-mono text-slate-400 uppercase">{range}</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid rgba(148,163,184,0.28)',
                    background: 'rgba(255,255,255,0.94)',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="inspections" name="Inspections" fill="#2563eb" radius={[5, 5, 0, 0]} />
                <Bar dataKey="deficiencies" name="Deficiencies" fill="#e11d48" radius={[5, 5, 0, 0]} />
                <Bar dataKey="verified" name="Verified Repairs" fill="#10b981" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-slate-950">Fire Door Compliance Mix</h2>
          <p className="text-xs text-slate-500 mb-3">Live distribution across all registered assemblies</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={charts.doorStatusCounts}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="45%"
                  innerRadius={54}
                  outerRadius={80}
                  paddingAngle={2.5}
                >
                  {charts.doorStatusCounts.map((_: any, idx: number) => (
                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid rgba(148,163,184,0.28)',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Priority Tasks + Recurring Reminders + Audit Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* Priority & Upcoming Tasks */}
          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200/70 flex items-center justify-between bg-white/40">
              <div>
                <h2 className="text-sm font-semibold text-slate-950">Priority Tasks & Upcoming Inspections</h2>
                <p className="text-xs text-slate-500">Overdue items pinned first, sorted by deadline</p>
              </div>
              <Link to="/deficiencies" className="text-xs font-medium text-blue-600 hover:text-blue-800">
                Open Queue →
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/70 border-b border-slate-200/70 text-slate-500 font-medium">
                  <tr>
                    <th className="px-4 py-2.5">Code / Type</th>
                    <th className="px-4 py-2.5">Task & Facility</th>
                    <th className="px-4 py-2.5">Assigned</th>
                    <th className="px-4 py-2.5">Due</th>
                    <th className="px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/50">
                  {upcomingTasks.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                        All scheduled inspections and deficiencies are up to date.
                      </td>
                    </tr>
                  ) : (
                    upcomingTasks.map((t: any) => (
                      <tr key={t.id} className="hover:bg-white/75 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-mono font-semibold text-slate-900">{t.code}</div>
                          <div className="text-[11px] text-slate-400">{t.type}</div>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            to={t.link}
                            className="font-medium text-slate-800 hover:text-blue-600 line-clamp-1"
                          >
                            {t.title}
                          </Link>
                          <div className="text-[11px] text-slate-500">{t.building}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{t.assignee}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={t.overdue ? 'text-rose-600 font-semibold' : 'text-slate-600'}>
                            {t.dueDate || 'Unscheduled'}
                            {t.overdue ? ' • Overdue' : ''}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <StatusBadge status={t.status} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recurring Inspection Reminders (Next 30 Days) */}
          {recurringReminders.length > 0 && (
            <div className="glass-panel rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-blue-600" />
                  <h3 className="text-sm font-semibold text-slate-950">
                    Recurring Inspection Reminders (Next 30 Days)
                  </h3>
                </div>
                <Link to="/inspections" className="text-xs font-medium text-blue-600 hover:underline">
                  Schedule Inspection
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {recurringReminders.map((rem: any) => (
                  <div
                    key={rem.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-white/75 border border-slate-200/70 text-xs"
                  >
                    <div>
                      <span className="font-mono font-semibold text-slate-900">{rem.door_code}</span>
                      <div className="text-[11px] text-slate-500">{rem.building}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-[11px] font-medium text-blue-700">
                        Due {rem.next_inspection_due}
                      </div>
                      <StatusBadge status={rem.status} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Chronological Audit Timeline */}
        <div className="glass-panel rounded-2xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200/70 bg-white/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-semibold text-slate-950">Chronological Audit Timeline</h2>
            </div>
            <Link to="/team" className="text-[11px] text-blue-600 font-medium hover:underline">
              Full Log
            </Link>
          </div>
          <div className="p-4 max-h-[460px] overflow-y-auto">
            {recentActivity.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">No audit entries yet.</div>
            ) : (
              <div className="relative pl-4 border-l border-slate-200 space-y-4">
                {recentActivity.map((log: any) => (
                  <div key={log.id} className="relative">
                    <span className="w-2 h-2 rounded-full bg-blue-600 ring-4 ring-white absolute -left-[20.5px] top-1.5" />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900">{log.actor_name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(log.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-blue-700 mt-0.5">{log.action}</div>
                    {log.details && Object.keys(log.details).length > 0 && (
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {Object.entries(log.details)
                          .slice(0, 2)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(' • ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
