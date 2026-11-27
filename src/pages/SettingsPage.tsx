import React, { useState } from 'react';
import {
  Building2,
  ClipboardList,
  CreditCard,
  Bell,
  Plus,
  Trash2,
  Lock,
  CheckCircle2,
  CopyPlus,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { PageHeader, InlineAlert } from '../components/UiPrimitives';
import type { InspectionTemplateItem } from '../types';

const PLANS = [
  { tier: 'Starter', price: '$149/mo', doors: 'Up to 150 fire doors', users: '5 team seats', storage: '2 GB private vault' },
  { tier: 'Professional', price: '$349/mo', doors: 'Up to 500 fire doors', users: '15 team seats', storage: '5 GB private vault' },
  { tier: 'Business', price: '$799/mo', doors: 'Up to 2,500 fire doors', users: '50 team seats', storage: '25 GB private vault' },
];

export default function SettingsPage() {
  const { workspace, refreshWorkspace, hasRole } = useAuth();
  const { toast } = useToast();
  const canEditOrg = hasRole(['owner', 'admin']);
  const isOwner = hasRole(['owner']);

  const [tab, setTab] = useState<'branding' | 'templates' | 'notifications' | 'billing'>('branding');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [orgForm, setOrgForm] = useState({
    name: workspace?.organization?.name || '',
    phone: workspace?.organization?.phone || '',
    email: workspace?.organization?.email || '',
    address: workspace?.organization?.address || '',
    website: workspace?.organization?.website || '',
    license_number: workspace?.organization?.license_number || '',
    primary_color: workspace?.organization?.primary_color || '#2563eb',
  });

  // Template creator & versioning
  const defaultTpl = workspace?.templates?.[0];
  const [tplId, setTplId] = useState<string>(defaultTpl?.id || '');
  const [tplName, setTplName] = useState(defaultTpl?.name || 'Custom Fire Door Checklist');
  const [tplDesc, setTplDesc] = useState(defaultTpl?.description || '');
  const [tplItems, setTplItems] = useState<InspectionTemplateItem[]>(defaultTpl?.items || []);

  const [prefs, setPrefs] = useState<Record<string, boolean>>({
    inspection_assigned: true,
    deficiency_created: true,
    repair_assigned: true,
    verification_requested: true,
    report_delivered: true,
    ...(workspace?.member?.notification_preferences || {}),
  });

  const saveOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/workspace', {
        method: 'PUT',
        body: JSON.stringify({ action: 'update_organization', ...orgForm }),
      });
      toast({ tone: 'success', title: 'Organization branding updated' });
      await refreshWorkspace();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const saveTemplate = async (asNewVersion = false) => {
    setSaving(true);
    setError(null);
    try {
      const nextVersionName = asNewVersion
        ? `${tplName.replace(/\s*\(v\d+\)$/i, '')} (v${(workspace?.templates?.length || 1) + 1})`
        : tplName;
      await apiFetch('/api/workspace', {
        method: 'POST',
        body: JSON.stringify({
          action: 'save_template',
          id: asNewVersion ? undefined : tplId || undefined,
          name: nextVersionName,
          description: tplDesc,
          is_default: true,
          items: tplItems,
        }),
      });
      toast({
        tone: 'success',
        title: asNewVersion ? 'Saved as new template version' : 'Checklist template saved',
        description: nextVersionName,
      });
      await refreshWorkspace();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const startBlankTemplate = () => {
    setTplId('');
    setTplName(`Healthcare Smoke Barrier Checklist (v${(workspace?.templates?.length || 1) + 1})`);
    setTplDesc('Custom fire & smoke door checklist requiring qualified professional review.');
    setTplItems([
      { category: 'Door Leaf', label: 'Door leaf free of unapproved penetrations or damage' },
      { category: 'Closers', label: 'Self-closing hardware returns door completely to frame' },
      { category: 'Latching', label: 'Positive latching engages cleanly without manual force' },
      { category: 'Seals', label: 'Smoke and intumescent seals continuous around perimeter' },
    ]);
  };

  const savePrefs = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/workspace', {
        method: 'PUT',
        body: JSON.stringify({ action: 'update_preferences', notification_preferences: prefs }),
      });
      toast({ tone: 'success', title: 'Notification preferences saved' });
      await refreshWorkspace();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePlanUpgrade = async (tier: string) => {
    setError(null);
    try {
      await apiFetch('/api/workspace', {
        method: 'POST',
        body: JSON.stringify({ action: 'checkout_subscription', plan_tier: tier }),
      });
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Organization Settings"
        description="Configure contractor branding, versioned inspection templates, notifications, and subscription quotas."
      />

      {error && <InlineAlert type="error" message={error} onDismiss={() => setError(null)} />}

      <div className="flex flex-wrap gap-1.5 border-b border-slate-200/80 pb-3 mb-6">
        {[
          { id: 'branding', label: 'Branding & Profile', icon: Building2 },
          { id: 'templates', label: 'Checklist Templates', icon: ClipboardList },
          { id: 'notifications', label: 'Notifications', icon: Bell },
          { id: 'billing', label: 'Subscription & Limits', icon: CreditCard },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-xl transition-all ${
              tab === t.id ? 'bg-slate-950 text-white shadow-xs' : 'dp-btn-glass'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'branding' && (
        <form onSubmit={saveOrg} className="glass-panel rounded-2xl p-6 max-w-2xl space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Company Name</label>
              <input type="text" disabled={!canEditOrg} value={orgForm.name} onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })} className="w-full px-3 py-2 text-sm rounded-xl dp-input disabled:opacity-60" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Contractor License #</label>
              <input type="text" disabled={!canEditOrg} value={orgForm.license_number} onChange={(e) => setOrgForm({ ...orgForm, license_number: e.target.value })} className="w-full px-3 py-2 text-sm rounded-xl dp-input disabled:opacity-60" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Contact Email</label>
              <input type="email" disabled={!canEditOrg} value={orgForm.email} onChange={(e) => setOrgForm({ ...orgForm, email: e.target.value })} className="w-full px-3 py-2 text-sm rounded-xl dp-input disabled:opacity-60" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
              <input type="text" disabled={!canEditOrg} value={orgForm.phone} onChange={(e) => setOrgForm({ ...orgForm, phone: e.target.value })} className="w-full px-3 py-2 text-sm rounded-xl dp-input disabled:opacity-60" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Business Address (PDF Report Header)</label>
            <input type="text" disabled={!canEditOrg} value={orgForm.address} onChange={(e) => setOrgForm({ ...orgForm, address: e.target.value })} className="w-full px-3 py-2 text-sm rounded-xl dp-input disabled:opacity-60" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">PDF Report Accent Color</label>
            <div className="flex items-center gap-3">
              <input type="color" disabled={!canEditOrg} value={orgForm.primary_color} onChange={(e) => setOrgForm({ ...orgForm, primary_color: e.target.value })} className="w-10 h-9 rounded-lg border border-slate-300" />
              <span className="text-xs font-mono text-slate-500">{orgForm.primary_color}</span>
            </div>
          </div>
          {canEditOrg && (
            <div className="pt-2">
              <button type="submit" disabled={saving} className="px-4 py-2 text-xs font-medium rounded-xl dp-btn-primary">
                {saving ? 'Saving...' : 'Save Branding Settings'}
              </button>
            </div>
          )}
        </form>
      )}

      {tab === 'templates' && (
        <div className="glass-panel rounded-2xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-950">Inspection Checklist Templates & Versioning</h3>
              <p className="text-xs text-slate-500">
                Create new templates or save revisions as new versions while preserving past inspection checklists.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={tplId}
                onChange={(e) => {
                  const found = workspace?.templates?.find((t) => t.id === e.target.value);
                  if (found) {
                    setTplId(found.id);
                    setTplName(found.name);
                    setTplDesc(found.description || '');
                    setTplItems(found.items || []);
                  }
                }}
                className="px-3 py-1.5 text-xs rounded-xl dp-input"
              >
                {(workspace?.templates || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.items?.length || 0} items)
                  </option>
                ))}
              </select>
              {canEditOrg && (
                <button type="button" onClick={startBlankTemplate} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-xl dp-btn-glass">
                  <Plus className="w-3.5 h-3.5" /> New Template
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Template Name</label>
              <input type="text" disabled={!canEditOrg} value={tplName} onChange={(e) => setTplName(e.target.value)} className="w-full px-3 py-2 text-sm rounded-xl dp-input" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
              <input type="text" disabled={!canEditOrg} value={tplDesc} onChange={(e) => setTplDesc(e.target.value)} className="w-full px-3 py-2 text-sm rounded-xl dp-input" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">Checkpoints ({tplItems.length})</span>
              {canEditOrg && (
                <button
                  type="button"
                  onClick={() => setTplItems([...tplItems, { category: 'Other Observations', label: '', guidance_note: '' }])}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Checkpoint
                </button>
              )}
            </div>
            {tplItems.map((item, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                <select
                  disabled={!canEditOrg}
                  value={item.category}
                  onChange={(e) => {
                    const next = [...tplItems];
                    next[idx] = { ...next[idx], category: e.target.value };
                    setTplItems(next);
                  }}
                  className="sm:col-span-3 px-2.5 py-2 text-xs rounded-xl dp-input"
                >
                  {['Door Leaf', 'Frame', 'Hinges', 'Closers', 'Latching', 'Seals', 'Glazing', 'Gaps', 'Signage', 'Other Observations'].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <input
                  type="text"
                  disabled={!canEditOrg}
                  value={item.label}
                  onChange={(e) => {
                    const next = [...tplItems];
                    next[idx] = { ...next[idx], label: e.target.value };
                    setTplItems(next);
                  }}
                  placeholder="Checkpoint description..."
                  className="sm:col-span-8 px-3 py-2 text-xs rounded-xl dp-input"
                />
                {canEditOrg && (
                  <button type="button" onClick={() => setTplItems(tplItems.filter((_, i) => i !== idx))} className="sm:col-span-1 p-2 text-slate-400 hover:text-rose-600 justify-self-center">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {canEditOrg && (
            <div className="flex flex-wrap gap-2 pt-2">
              <button type="button" disabled={saving} onClick={() => saveTemplate(false)} className="px-4 py-2 text-xs font-medium rounded-xl dp-btn-primary">
                {saving ? 'Saving...' : tplId ? 'Update Current Template' : 'Create Template'}
              </button>
              {tplId && (
                <button type="button" disabled={saving} onClick={() => saveTemplate(true)} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl dp-btn-glass">
                  <CopyPlus className="w-3.5 h-3.5 text-blue-600" />
                  Save as New Version
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'notifications' && (
        <div className="glass-panel rounded-2xl p-6 max-w-2xl space-y-5">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
            <strong>Resend Email Provider:</strong>{' '}
            {workspace?.capabilities?.resendConfigured ? (
              <span className="text-emerald-700 font-semibold">Connected & Active</span>
            ) : (
              <span className="text-amber-700 font-medium">
                RESEND_API_KEY not configured — alerts are logged in-app with duplicate prevention.
              </span>
            )}
          </div>
          <div className="space-y-2.5">
            {[
              { key: 'inspection_assigned', label: 'Inspection assignments & recurring reminders' },
              { key: 'deficiency_created', label: 'New critical/high fire-door deficiencies' },
              { key: 'repair_assigned', label: 'Technician remediation assignments & due dates' },
              { key: 'verification_requested', label: 'Completed repairs awaiting verification' },
              { key: 'report_delivered', label: 'PDF handover reports published to clients' },
            ].map((item) => (
              <label key={item.key} className="flex items-center justify-between p-3.5 bg-white/75 border border-slate-200/80 rounded-xl text-xs cursor-pointer hover:bg-white">
                <span className="font-medium text-slate-800">{item.label}</span>
                <input type="checkbox" checked={Boolean(prefs[item.key])} onChange={(e) => setPrefs({ ...prefs, [item.key]: e.target.checked })} className="rounded border-slate-300" />
              </label>
            ))}
          </div>
          <button onClick={savePrefs} disabled={saving} className="px-4 py-2 text-xs font-medium rounded-xl dp-btn-primary">
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      )}

      {tab === 'billing' && (
        <div className="space-y-6">
          <div className="glass-panel rounded-2xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/70">
              <div>
                <span className="text-xs text-slate-500">Current Organization Plan</span>
                <h3 className="text-lg font-semibold text-slate-950 mt-0.5">
                  {workspace?.subscription?.plan_tier || 'Starter'} Plan
                </h3>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/80 border border-slate-200 text-xs text-slate-700">
                <Lock className="w-3.5 h-3.5 text-slate-500" />
                Stripe Checkout:{' '}
                {workspace?.capabilities?.stripeConfigured ? 'Live' : 'Credentials Not Configured'}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
              {[
                { label: 'Registered Fire Doors', used: workspace?.usage?.doors || 0, max: workspace?.subscription?.max_doors || 150, unit: '' },
                { label: 'Active Team Seats', used: workspace?.usage?.users || 0, max: workspace?.subscription?.max_users || 5, unit: '' },
                { label: 'Evidence Vault Storage', used: workspace?.usage?.storage_mb || 0, max: workspace?.subscription?.max_storage_mb || 2000, unit: ' MB' },
              ].map((u) => {
                const pct = Math.min(100, Math.round((u.used / Math.max(1, u.max)) * 100));
                return (
                  <div key={u.label} className="p-4 rounded-xl bg-white/75 border border-slate-200/70">
                    <div className="text-xs text-slate-500">{u.label}</div>
                    <div className="text-sm font-mono font-semibold text-slate-950 mt-1">
                      {u.used}{u.unit} / {u.max}{u.unit}
                    </div>
                    <div className="w-full h-1.5 bg-slate-200 rounded-full mt-2 overflow-hidden">
                      <div className="h-full bg-blue-600 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PLANS.map((plan) => {
              const isCurrent = workspace?.subscription?.plan_tier === plan.tier;
              return (
                <div
                  key={plan.tier}
                  className={`glass-panel rounded-2xl p-5 flex flex-col justify-between ${
                    isCurrent ? 'border-blue-600/60 ring-1 ring-blue-600/30' : ''
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-slate-950">{plan.tier}</h4>
                      {isCurrent && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-600/10 text-blue-700">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-2xl font-bold font-mono text-slate-950 mt-2">{plan.price}</div>
                    <ul className="mt-4 space-y-2 text-xs text-slate-600">
                      <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />{plan.doors}</li>
                      <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />{plan.users}</li>
                      <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />{plan.storage}</li>
                    </ul>
                  </div>
                  <button
                    type="button"
                    disabled={isCurrent || !isOwner}
                    onClick={() => handlePlanUpgrade(plan.tier)}
                    className="mt-5 w-full py-2 px-3 rounded-xl text-xs font-medium dp-btn-glass disabled:opacity-50"
                  >
                    {isCurrent
                      ? 'Active Plan'
                      : !workspace?.capabilities?.stripeConfigured
                      ? 'Requires Stripe Credentials'
                      : `Switch to ${plan.tier}`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
