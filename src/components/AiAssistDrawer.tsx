import { useState } from 'react';
import {
  Sparkles,
  ShieldAlert,
  X,
  FileSearch,
  Tags,
  FileText,
  Lock,
  Wrench,
  MessageSquareText,
  FolderKanban,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { apiFetch } from '../lib/api';
import { InlineAlert } from './UiPrimitives';

const AI_MODES = [
  { id: 'summarize_inspection', label: 'Summarize Inspection', icon: FileText, placeholder: 'Paste inspection notes or select observations to summarize...' },
  { id: 'improve_deficiency', label: 'Improve Deficiency', icon: FileSearch, placeholder: 'Paste rough field deficiency wording to structure clearly...' },
  { id: 'suggest_remediation', label: 'Remediation Notes', icon: Wrench, placeholder: 'Describe completed repair work to draft clear handover notes...' },
  { id: 'classify_document', label: 'Classify Document', icon: Tags, placeholder: 'Paste uploaded door schedule, invoice, or inspection doc text...' },
  { id: 'organize_evidence', label: 'Organize Evidence', icon: FolderKanban, placeholder: 'List photo captions or file names to suggest tagging structure...' },
  { id: 'org_records_qa', label: 'Ask Org Records', icon: MessageSquareText, placeholder: 'Ask a question about your authorized organization records...' },
] as const;

export default function AiAssistDrawer({
  open,
  onClose,
  aiConfigured,
}: {
  open: boolean;
  onClose: () => void;
  aiConfigured: boolean;
}) {
  const [inputText, setInputText] = useState('');
  const [mode, setMode] = useState<(typeof AI_MODES)[number]['id']>('summarize_inspection');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const activeMode = AI_MODES.find((m) => m.id === mode) || AI_MODES[0];

  const handleRun = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      await apiFetch('/api/notifications?action=ai_assist', {
        method: 'POST',
        body: JSON.stringify({ action: 'ai_assist', mode, inputText }),
      });
    } catch (err: any) {
      setFeedback(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/30 backdrop-blur-[2px]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ x: 420 }}
            animate={{ x: 0 }}
            exit={{ x: 420 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="w-full max-w-md glass-surface bg-white/95 h-full border-l border-slate-200/80 shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/80 bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue-600/10 border border-blue-600/20 flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">DoorProof AI Assistant</h3>
                  <p className="text-[11px] text-slate-500">Contextual Inspection & Remediation Support</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto space-y-5">
              {/* Mandatory Human-in-the-Loop Compliance Governance Notice */}
              <div className="p-3.5 rounded-xl bg-amber-50/90 border border-amber-200/90 text-xs text-amber-950 flex gap-2.5">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                <div>
                  <div className="font-semibold">Human Review Mandatory</div>
                  <p className="mt-0.5 text-amber-900/85 leading-relaxed">
                    AI suggestions are drafts only and always require approval by a qualified
                    professional. DoorProof AI never claims legal compliance or independently
                    certifies fire doors.
                  </p>
                </div>
              </div>

              {/* Explicit Provider & Supabase Edge Function Configuration Status */}
              <div className="p-4 rounded-xl bg-slate-50/90 border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                    <Lock className="w-3.5 h-3.5 text-slate-500" />
                    Edge Function Provider Status
                  </span>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded border ${
                      aiConfigured
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-200/70 text-slate-600 border-slate-300/80'
                    }`}
                  >
                    {aiConfigured ? 'Configured' : 'Not Configured'}
                  </span>
                </div>
                {!aiConfigured && (
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Connect <code className="px-1 py-0.5 bg-slate-200/80 rounded">OPENAI_API_KEY</code> or{' '}
                    <code className="px-1 py-0.5 bg-slate-200/80 rounded">ANTHROPIC_API_KEY</code> via
                    Supabase Edge Function (<code className="px-1 py-0.5 bg-slate-200/80 rounded">supabase/functions/ai-assist</code>).
                    All manual inspection, deficiency, and evidence workflows remain 100% available.
                  </p>
                )}
              </div>

              {feedback && (
                <InlineAlert type="error" message={feedback} onDismiss={() => setFeedback(null)} />
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-2">
                  Select Contextual Workflow
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {AI_MODES.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setMode(opt.id)}
                      className={`flex items-center gap-2 px-3 py-2.5 text-xs font-medium rounded-xl border text-left transition-all ${
                        mode === opt.id
                          ? 'border-blue-600/50 bg-blue-600/8 text-blue-800 shadow-xs'
                          : 'border-slate-200/80 bg-white/70 text-slate-600 hover:bg-white'
                      }`}
                    >
                      <opt.icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  Context / Input
                </label>
                <textarea
                  rows={5}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  disabled={!aiConfigured}
                  placeholder={
                    aiConfigured
                      ? activeMode.placeholder
                      : 'Disabled until AI provider credentials are configured. No synthetic AI output will be simulated.'
                  }
                  className="w-full rounded-xl dp-input px-3.5 py-2.5 text-xs disabled:bg-slate-100/80 disabled:text-slate-400"
                />
              </div>

              <button
                onClick={handleRun}
                disabled={!aiConfigured || loading || !inputText.trim()}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-medium dp-btn-primary disabled:opacity-45 disabled:cursor-not-allowed"
              >
                {!aiConfigured
                  ? 'AI Disabled — Credentials Required'
                  : loading
                  ? 'Drafting Suggestion...'
                  : 'Generate Draft for Human Review'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
