import React, { useState } from 'react';
import { ShieldCheck, Building2, ArrowRight, ArrowLeft, CheckCircle2, Palette, Briefcase } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { InlineAlert } from '../components/UiPrimitives';

export default function OnboardingPage() {
  const { refreshWorkspace, signOut, workspace } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#2563eb');
  const [firstClientName, setFirstClientName] = useState('');
  const [firstClientContact, setFirstClientContact] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setStep(1);
      setError('Company name is required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiFetch('/api/workspace', {
        method: 'POST',
        body: JSON.stringify({
          action: 'create_organization',
          name: name.trim(),
          phone,
          address,
          license_number: licenseNumber,
        }),
      });
      // Save chosen brand accent color if customized
      if (primaryColor !== '#1d4ed8') {
        await apiFetch('/api/workspace', {
          method: 'PUT',
          body: JSON.stringify({
            action: 'update_organization',
            name: name.trim(),
            phone,
            address,
            license_number: licenseNumber,
            primary_color: primaryColor,
          }),
        }).catch(() => {});
      }
      // Optionally create first commercial client right in onboarding
      if (firstClientName.trim()) {
        await apiFetch('/api/portfolio', {
          method: 'POST',
          body: JSON.stringify({
            entity: 'clients',
            name: firstClientName.trim(),
            contact_name: firstClientContact.trim() || undefined,
          }),
        }).catch(() => {});
      }
      await refreshWorkspace();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    { num: 1, label: 'Organization', icon: Building2 },
    { num: 2, label: 'Branding & Template', icon: Palette },
    { num: 3, label: 'First Client', icon: Briefcase },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-xl glass-surface rounded-2xl p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-slate-950 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <div className="font-semibold text-sm text-slate-950">DoorProof AI Setup Wizard</div>
              <div className="text-[11px] text-slate-500">Multi-tenant workspace provisioning</div>
            </div>
          </div>
          <button
            onClick={signOut}
            className="text-xs text-slate-500 hover:text-slate-900 underline"
          >
            Sign out
          </button>
        </div>

        {/* Step Indicator */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          {steps.map((s) => (
            <div
              key={s.num}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${
                step === s.num
                  ? 'bg-slate-950 text-white border-slate-950'
                  : step > s.num
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-white/70 text-slate-400 border-slate-200'
              }`}
            >
              {step > s.num ? <CheckCircle2 className="w-3.5 h-3.5" /> : <s.icon className="w-3.5 h-3.5" />}
              <span className="truncate">{s.label}</span>
            </div>
          ))}
        </div>

        {error && <InlineAlert type="error" message={error} onDismiss={() => setError(null)} />}

        <form onSubmit={handleFinish} className="space-y-4">
          {step === 1 && (
            <>
              <div>
                <h2 className="text-base font-semibold text-slate-950">Contractor Identity</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Signed in as {workspace?.profile?.email}. You will be provisioned as Organization Owner.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Company / Contractor Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Apex Fire Door Compliance LLC"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl dp-input"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(312) 555-0190"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl dp-input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    License / Certification #
                  </label>
                  <input
                    type="text"
                    value={licenseNumber}
                    onChange={(e) => setLicenseNumber(e.target.value)}
                    placeholder="FDAI-IL-48210"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl dp-input"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Office Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="450 W Monroe St, Suite 800, Chicago, IL 60606"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl dp-input"
                />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <h2 className="text-base font-semibold text-slate-950">Report Branding & Checklist</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Customize your PDF report header color. A 10-category swinging fire door checklist template will be pre-installed.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50/90 border border-slate-200/80 space-y-3">
                <label className="block text-xs font-medium text-slate-700">
                  PDF Handover Brand Accent Color
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-11 h-9 rounded-lg border border-slate-300 cursor-pointer"
                  />
                  <span className="font-mono text-xs text-slate-600">{primaryColor}</span>
                </div>
              </div>
              <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-200/60 text-xs text-slate-700 space-y-1.5">
                <div className="font-semibold text-slate-900">Default Configurable Checklist Included</div>
                <p className="text-slate-600 leading-relaxed">
                  Covers Door Leaf, Frame, Hinges, Closers, Latching, Seals, Glazing, Gaps, Signage,
                  and Other Observations. Fully editable and versionable in Settings.
                </p>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div>
                <h2 className="text-base font-semibold text-slate-950">Add Your First Client (Optional)</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Jump straight into operations by registering an initial client portfolio now, or skip and add clients later.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Client Name</label>
                <input
                  type="text"
                  value={firstClientName}
                  onChange={(e) => setFirstClientName(e.target.value)}
                  placeholder="e.g. Regional Medical Center"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl dp-input"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Primary Facilities Contact
                </label>
                <input
                  type="text"
                  value={firstClientContact}
                  onChange={(e) => setFirstClientContact(e.target.value)}
                  placeholder="e.g. Morgan Taylor, Facilities Director"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl dp-input"
                />
              </div>
            </>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-slate-200/70">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl dp-btn-glass"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
            ) : (
              <div />
            )}

            {step < 3 ? (
              <button
                type="button"
                onClick={() => {
                  if (step === 1 && !name.trim()) {
                    setError('Please enter your company name to continue.');
                    return;
                  }
                  setError(null);
                  setStep((s) => (s + 1) as 1 | 2 | 3);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium rounded-xl dp-btn-primary"
              >
                Continue <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-medium rounded-xl dp-btn-blue disabled:opacity-60"
              >
                {loading ? 'Provisioning Workspace...' : 'Launch DoorProof AI'}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
