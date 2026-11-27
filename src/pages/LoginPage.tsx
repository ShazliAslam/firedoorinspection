import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Lock, Mail, ArrowRight, CheckCircle2, KeyRound } from 'lucide-react';
import { motion } from 'framer-motion';
import supabase from '../lib/supabase';
import { signInWithGoogle } from '../lib/googleAuth';
import { InlineAlert } from '../components/UiPrimitives';

const DEMO_ACCOUNTS = [
  { label: 'Owner / Contractor', email: 'owner@apexfiredoor.com', role: 'Full Admin & Billing' },
  { label: 'Field Inspector', email: 'inspector@apexfiredoor.com', role: 'Inspections & Verify' },
  { label: 'Repair Technician', email: 'tech@apexfiredoor.com', role: 'Assigned Repairs' },
  { label: 'Client Portal', email: 'facilities@mercyhealth.org', role: 'Mercy Health Only' },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (mode !== 'reset' && password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'reset') {
        const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/login`,
        });
        if (resetErr) throw resetErr;
        setNotice('Password reset instructions have been sent if an account exists for that email.');
      } else if (mode === 'signup') {
        const { data, error: signUpErr } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim() || email.split('@')[0] } },
        });
        if (signUpErr) throw signUpErr;
        if (data.session) navigate('/');
        else {
          setNotice('Account created. Verify your email address, then sign in.');
          setMode('signin');
        }
      } else {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInErr) throw signInErr;
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const quickFillDemo = (demoEmail: string) => {
    setMode('signin');
    setEmail(demoEmail);
    setPassword('DoorProof2026!');
    setError(null);
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left Deep-Navy Architectural Panel */}
      <div className="lg:w-[44%] glass-dark text-white p-8 lg:p-14 flex flex-col justify-between relative overflow-hidden">
        <div
          className="pointer-events-none absolute -top-28 -right-28 w-80 h-80 rounded-full opacity-25 blur-3xl"
          style={{ background: 'radial-gradient(circle, #2563eb 0%, transparent 70%)' }}
        />
        <div className="relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center backdrop-blur-md">
              <ShieldCheck className="w-5 h-5 text-blue-400" />
            </div>
            <span className="text-base font-semibold tracking-tight">DoorProof AI</span>
          </div>

          <div className="mt-14 max-w-md">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-medium text-blue-300 mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              Enterprise Fire Door Operations
            </div>
            <h1 className="text-3xl font-semibold tracking-tight leading-tight text-white">
              Defensible fire-door evidence from inspection to client handover.
            </h1>
            <p className="mt-4 text-sm text-slate-400 leading-relaxed">
              Purpose-built for US fire-door contractors and commercial life-safety teams. Enforce
              immutable inspection evidence, verified before/after remediation, and strictly
              isolated client portals.
            </p>

            <div className="mt-10 space-y-3.5">
              {[
                'Multi-tenant PostgreSQL RLS with 5-role backend RBAC',
                'Mobile-first inspections with draft autosave & QR scanning',
                'Before/after remediation verification & branded PDF previews',
                'Expiring signed client handover links & zero cross-client leakage',
              ].map((line) => (
                <div key={line} className="flex items-start gap-2.5 text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <span className="text-xs leading-relaxed">{line}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-12 pt-6 border-t border-white/10 text-[11px] text-slate-400">
          Qualified professionals must review and certify all fire-door inspection criteria.
        </div>
      </div>

      {/* Right Frosted Glass Auth Card */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className="w-full max-w-md"
        >
          <div className="glass-surface rounded-2xl p-7 sm:p-8">
            <h2 className="text-xl font-semibold text-slate-950 tracking-tight">
              {mode === 'signin'
                ? 'Sign in to DoorProof AI'
                : mode === 'signup'
                ? 'Create your contractor account'
                : 'Reset your password'}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {mode === 'signin'
                ? 'Access your multi-tenant workspace or isolated client portal.'
                : mode === 'signup'
                ? 'Launch a new organization or join an invited contractor team.'
                : 'Enter your work email to receive a password recovery link.'}
            </p>

            <div className="mt-4">
              {error && <InlineAlert type="error" message={error} onDismiss={() => setError(null)} />}
              {notice && (
                <InlineAlert type="success" message={notice} onDismiss={() => setNotice(null)} />
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              {mode === 'signup' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Jordan Alvarez"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl dp-input"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Work Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl dp-input"
                  />
                </div>
              </div>

              {mode !== 'reset' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-slate-700">Password</label>
                    {mode === 'signin' && (
                      <button
                        type="button"
                        onClick={() => {
                          setMode('reset');
                          setError(null);
                        }}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl dp-input"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-medium rounded-xl dp-btn-primary disabled:opacity-60"
              >
                {loading
                  ? 'Authenticating...'
                  : mode === 'signin'
                  ? 'Sign In'
                  : mode === 'signup'
                  ? 'Create Account'
                  : 'Send Reset Link'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {mode !== 'reset' && (
              <>
                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200/80" />
                  </div>
                  <div className="relative flex justify-center text-[11px]">
                    <span className="bg-white/90 px-2.5 text-slate-400">or continue with</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => signInWithGoogle('DoorProof AI')}
                  className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 text-sm font-medium rounded-xl dp-btn-glass"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                    />
                  </svg>
                  Sign in with Google
                </button>
              </>
            )}

            <div className="mt-5 text-center text-xs text-slate-500">
              {mode === 'signin' ? (
                <>
                  New contractor organization?{' '}
                  <button
                    onClick={() => {
                      setMode('signup');
                      setError(null);
                    }}
                    className="text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Create an account
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button
                    onClick={() => {
                      setMode('signin');
                      setError(null);
                    }}
                    className="text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Back to sign in
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="mt-4 glass-panel rounded-2xl p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 mb-2.5">
              <KeyRound className="w-3.5 h-3.5 text-blue-600" />
              Live Sandbox Accounts (Click to fill)
            </div>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => quickFillDemo(acc.email)}
                  className="text-left p-2.5 rounded-xl bg-white/75 hover:bg-white border border-slate-200/80 hover:border-blue-400 transition-all"
                >
                  <div className="text-xs font-semibold text-slate-900">{acc.label}</div>
                  <div className="text-[11px] text-slate-500 truncate">{acc.role}</div>
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
