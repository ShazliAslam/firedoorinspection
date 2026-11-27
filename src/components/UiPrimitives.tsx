import React from 'react';
import {
  X,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  AlertTriangle,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Pass: 'bg-emerald-500/10 text-emerald-800 border-emerald-500/25',
    Completed: 'bg-emerald-500/10 text-emerald-800 border-emerald-500/25',
    Verified: 'bg-emerald-500/10 text-emerald-800 border-emerald-500/25',
    Closed: 'bg-slate-500/10 text-slate-700 border-slate-500/20',
    active: 'bg-emerald-500/10 text-emerald-800 border-emerald-500/25',

    Deficient: 'bg-rose-500/10 text-rose-700 border-rose-500/25',
    Fail: 'bg-rose-500/10 text-rose-700 border-rose-500/25',
    Critical: 'bg-rose-500/10 text-rose-700 border-rose-500/25',
    Rejected: 'bg-rose-500/10 text-rose-700 border-rose-500/25',
    High: 'bg-orange-500/10 text-orange-800 border-orange-500/25',
    P1: 'bg-rose-500/10 text-rose-700 border-rose-500/25',
    P2: 'bg-orange-500/10 text-orange-800 border-orange-500/25',

    'In Remediation': 'bg-amber-500/10 text-amber-800 border-amber-500/25',
    'In Progress': 'bg-blue-600/10 text-blue-700 border-blue-600/25',
    Assigned: 'bg-sky-500/10 text-sky-800 border-sky-500/25',
    'Awaiting Parts': 'bg-amber-500/10 text-amber-800 border-amber-500/25',
    Medium: 'bg-amber-500/10 text-amber-800 border-amber-500/25',
    P3: 'bg-amber-500/10 text-amber-800 border-amber-500/25',
    invited: 'bg-amber-500/10 text-amber-800 border-amber-500/25',

    'Ready for Verification': 'bg-indigo-500/10 text-indigo-700 border-indigo-500/25',
    'Submitted for Verification': 'bg-indigo-500/10 text-indigo-700 border-indigo-500/25',
    Submitted: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/25',

    Open: 'bg-rose-500/10 text-rose-700 border-rose-500/25',
    Draft: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
    'Needs Inspection': 'bg-slate-500/10 text-slate-700 border-slate-500/20',
    Pending: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
    'N/A': 'bg-slate-500/10 text-slate-500 border-slate-500/20',
    Low: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
    P4: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
    inactive: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
  };

  const cls = map[status] || 'bg-slate-500/10 text-slate-700 border-slate-500/20';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-md border whitespace-nowrap ${cls}`}
    >
      {status}
    </span>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    owner: 'bg-slate-900 text-white border-slate-900',
    admin: 'bg-blue-600/10 text-blue-700 border-blue-600/25',
    inspector: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/25',
    technician: 'bg-amber-500/10 text-amber-800 border-amber-500/25',
    client: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/25',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded border ${
        styles[role] || 'bg-slate-100 text-slate-700 border-slate-200'
      }`}
    >
      {role}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'max-w-xl',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 backdrop-blur-sm p-4 overflow-y-auto"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.16 }}
            className={`glass-surface bg-white/95 rounded-2xl shadow-2xl w-full ${maxWidth} my-8 overflow-hidden`}
          >
            <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200/70 bg-slate-50/60">
              <div>
                <h3 className="text-[15px] font-semibold text-slate-900 tracking-tight">{title}</h3>
                {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
              </div>
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition-colors"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 max-h-[80vh] overflow-y-auto">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-md">
      <div className="flex items-start gap-3.5">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            danger
              ? 'bg-rose-50 text-rose-600 border border-rose-200'
              : 'bg-blue-50 text-blue-600 border border-blue-200'
          }`}
        >
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="text-xs text-slate-600 leading-relaxed pt-0.5">{message}</div>
      </div>
      <div className="flex justify-end gap-2 mt-6">
        <button
          type="button"
          onClick={onClose}
          className="px-3.5 py-2 text-xs font-medium rounded-lg dp-btn-glass"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={onConfirm}
          className={`px-4 py-2 text-xs font-medium text-white rounded-lg transition-colors disabled:opacity-50 ${
            danger ? 'bg-rose-600 hover:bg-rose-700' : 'dp-btn-blue'
          }`}
        >
          {loading ? 'Processing...' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  badge,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pb-5 mb-6 border-b border-slate-200/80">
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-semibold tracking-tight text-slate-950">{title}</h1>
          {badge}
        </div>
        {description && <p className="text-[13px] text-slate-500 mt-1 max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="glass-panel rounded-2xl flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="w-12 h-12 rounded-xl bg-white/90 border border-slate-200/80 shadow-xs flex items-center justify-center text-slate-500 mb-3.5">
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="text-xs text-slate-500 mt-1 max-w-sm leading-relaxed">{description}</p>
      {action && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}

export function LoadingSpinner({ label = 'Loading records...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-slate-500 gap-2.5">
      <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="glass-panel rounded-xl overflow-hidden animate-pulse">
      <div className="h-10 bg-slate-100/80 border-b border-slate-200/70" />
      <div className="divide-y divide-slate-200/50">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-4 flex items-center justify-between gap-4">
            <div className="h-3.5 bg-slate-200/80 rounded w-1/5" />
            <div className="h-3.5 bg-slate-200/60 rounded w-1/4" />
            <div className="h-3.5 bg-slate-200/60 rounded w-1/6" />
            <div className="h-5 bg-slate-200/80 rounded-md w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="glass-panel rounded-xl p-5 space-y-3">
          <div className="h-3 bg-slate-200/70 rounded w-1/3" />
          <div className="h-4 bg-slate-200/90 rounded w-2/3" />
          <div className="h-3 bg-slate-200/60 rounded w-5/6" />
          <div className="grid grid-cols-3 gap-2 pt-3">
            <div className="h-12 bg-slate-200/60 rounded-lg" />
            <div className="h-12 bg-slate-200/60 rounded-lg" />
            <div className="h-12 bg-slate-200/60 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="glass-panel rounded-xl p-4 h-24">
            <div className="h-3 bg-slate-200/70 rounded w-1/2" />
            <div className="h-7 bg-slate-200/90 rounded w-1/3 mt-3" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 glass-panel rounded-xl h-72" />
        <div className="glass-panel rounded-xl h-72" />
      </div>
    </div>
  );
}

export function PaginationBar({
  page,
  totalItems,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (next: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems <= pageSize) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(totalItems, page * pageSize);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200/70 bg-slate-50/40 text-xs text-slate-600">
      <span>
        Showing <strong className="text-slate-900">{start}–{end}</strong> of{' '}
        <strong className="text-slate-900">{totalItems}</strong>
      </span>
      <div className="flex items-center gap-1.5">
        <button
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md dp-btn-glass disabled:opacity-40"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Prev
        </button>
        <span className="px-2 font-mono text-[11px]">
          {page} / {totalPages}
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md dp-btn-glass disabled:opacity-40"
        >
          Next <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export function SortableHeader({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: 'asc' | 'desc';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 text-left font-medium transition-colors ${
        active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
      }`}
    >
      <span>{label}</span>
      <ArrowUpDown className={`w-3 h-3 ${active ? 'text-blue-600' : 'opacity-45'}`} />
      {active && <span className="sr-only">{direction}</span>}
    </button>
  );
}

export function InlineAlert({
  type = 'error',
  message,
  onDismiss,
}: {
  type?: 'error' | 'success' | 'info';
  message: string;
  onDismiss?: () => void;
}) {
  const styles = {
    error: 'bg-rose-50/90 border-rose-200/80 text-rose-800',
    success: 'bg-emerald-50/90 border-emerald-200/80 text-emerald-800',
    info: 'bg-blue-50/90 border-blue-200/80 text-blue-800',
  };
  return (
    <div
      className={`flex items-start justify-between gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm text-xs mb-4 ${styles[type]}`}
    >
      <div className="flex items-start gap-2.5">
        {type === 'success' ? (
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
        ) : (
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
        )}
        <span className="leading-relaxed">{message}</span>
      </div>
      {onDismiss && (
        <button onClick={onDismiss} className="opacity-70 hover:opacity-100">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
