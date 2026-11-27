import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Briefcase, Building2, DoorClosed, AlertTriangle, X, CornerDownLeft } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { apiFetch } from '../lib/api';
import { StatusBadge } from './UiPrimitives';

interface SearchResults {
  clients: any[];
  buildings: any[];
  doors: any[];
  deficiencies: any[];
}

export default function CommandSearchModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResults>({
    clients: [],
    buildings: [],
    doors: [],
    deficiencies: [],
  });

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 40);
    } else {
      setQuery('');
    }
  }, [open]);

  useEffect(() => {
    if (!open || !query.trim()) {
      setResults({ clients: [], buildings: [], doors: [], deficiencies: [] });
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await apiFetch<SearchResults>(
          `/api/portfolio?entity=global_search&q=${encodeURIComponent(query.trim())}`
        );
        setResults(data);
      } catch {
        // ignore transient search error
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [query, open]);

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  const hasAny =
    results.clients.length +
      results.buildings.length +
      results.doors.length +
      results.deficiencies.length >
    0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-slate-950/35 backdrop-blur-sm flex items-start justify-center pt-[12vh] px-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -6 }}
            transition={{ duration: 0.14 }}
            className="glass-surface bg-white/95 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-200/80">
              <Search className="w-4 h-4 text-blue-600 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') onClose();
                }}
                placeholder="Search clients, buildings, Door IDs, QR tokens, or deficiencies..."
                className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              {query && (
                <button onClick={() => setQuery('')} className="p-1 text-slate-400 hover:text-slate-700">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-100 border border-slate-200 rounded">
                ESC
              </kbd>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-2">
              {!query.trim() ? (
                <div className="px-4 py-8 text-center text-xs text-slate-500">
                  Type a client name, building address, fire door tag (e.g. <span className="font-mono text-slate-800">FD-1001</span>), QR token, or deficiency code (<span className="font-mono text-slate-800">DEF-2026</span>).
                </div>
              ) : loading ? (
                <div className="px-4 py-8 text-center text-xs text-slate-500">Searching tenant records...</div>
              ) : !hasAny ? (
                <div className="px-4 py-8 text-center text-xs text-slate-500">
                  No matching records found for “{query}”.
                </div>
              ) : (
                <div className="space-y-3 p-1">
                  {results.doors.length > 0 && (
                    <div>
                      <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Fire Doors
                      </div>
                      {results.doors.map((d) => (
                        <button
                          key={d.id}
                          onClick={() => go(`/doors?q=${encodeURIComponent(d.door_code)}`)}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-blue-50/70 text-left text-xs transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <DoorClosed className="w-4 h-4 text-blue-600 shrink-0" />
                            <div className="truncate">
                              <span className="font-mono font-semibold text-slate-900">{d.door_code}</span>
                              <span className="text-slate-500 ml-2">
                                {d.building_name} • {d.room_location}
                              </span>
                            </div>
                          </div>
                          <StatusBadge status={d.status} />
                        </button>
                      ))}
                    </div>
                  )}

                  {results.deficiencies.length > 0 && (
                    <div>
                      <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Deficiencies
                      </div>
                      {results.deficiencies.map((df) => (
                        <button
                          key={df.id}
                          onClick={() => go(`/deficiencies?q=${encodeURIComponent(df.deficiency_code)}`)}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-blue-50/70 text-left text-xs transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                            <div className="truncate">
                              <span className="font-mono font-semibold text-slate-900">{df.deficiency_code}</span>
                              <span className="text-slate-600 ml-2">{df.title}</span>
                            </div>
                          </div>
                          <StatusBadge status={df.status} />
                        </button>
                      ))}
                    </div>
                  )}

                  {results.buildings.length > 0 && (
                    <div>
                      <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Buildings
                      </div>
                      {results.buildings.map((b) => (
                        <button
                          key={b.id}
                          onClick={() => go(`/buildings?q=${encodeURIComponent(b.name)}`)}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-blue-50/70 text-left text-xs transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Building2 className="w-4 h-4 text-slate-500 shrink-0" />
                            <div className="truncate">
                              <span className="font-medium text-slate-900">{b.name}</span>
                              <span className="text-slate-500 ml-2">{b.address}</span>
                            </div>
                          </div>
                          <CornerDownLeft className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                      ))}
                    </div>
                  )}

                  {results.clients.length > 0 && (
                    <div>
                      <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Clients
                      </div>
                      {results.clients.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => go(`/clients?q=${encodeURIComponent(c.name)}`)}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-blue-50/70 text-left text-xs transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Briefcase className="w-4 h-4 text-slate-500 shrink-0" />
                            <div className="truncate">
                              <span className="font-medium text-slate-900">{c.name}</span>
                              <span className="text-slate-400 ml-2 font-mono">{c.company_code}</span>
                            </div>
                          </div>
                          <CornerDownLeft className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
