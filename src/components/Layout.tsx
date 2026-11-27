import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Briefcase,
  Building2,
  DoorClosed,
  ClipboardCheck,
  AlertTriangle,
  Wrench,
  Images,
  FileText,
  Users,
  Settings,
  Bell,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  Sparkles,
  CheckCheck,
  Search,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../lib/api';
import { RoleBadge } from './UiPrimitives';
import AiAssistDrawer from './AiAssistDrawer';
import CommandSearchModal from './CommandSearchModal';
import type { AppNotification } from '../types';

const CONTRACTOR_NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/clients', label: 'Clients', icon: Briefcase },
  { to: '/buildings', label: 'Buildings', icon: Building2 },
  { to: '/doors', label: 'Fire Doors', icon: DoorClosed },
  { to: '/inspections', label: 'Inspections', icon: ClipboardCheck },
  { to: '/deficiencies', label: 'Deficiencies', icon: AlertTriangle },
  { to: '/remediation', label: 'Remediation', icon: Wrench },
  { to: '/evidence', label: 'Evidence Gallery', icon: Images },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/team', label: 'Team', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { workspace, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifTab, setNotifTab] = useState<'all' | 'unread'>('all');
  const [aiOpen, setAiOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const isClient = workspace?.member?.role === 'client';

  const loadNotifications = async () => {
    try {
      const data = await apiFetch<AppNotification[]>('/api/notifications');
      setNotifications(data);
    } catch {
      // ignore background poll errors
    }
  };

  useEffect(() => {
    if (workspace && !workspace.needsOnboarding) {
      loadNotifications();
    }
  }, [workspace?.organization?.id]);

  // Global Cmd+K / Ctrl+K keyboard shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const visibleNotifs =
    notifTab === 'unread' ? notifications.filter((n) => !n.read) : notifications;

  const markAllRead = async () => {
    await apiFetch('/api/notifications', {
      method: 'PUT',
      body: JSON.stringify({ mark_all: true }),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const navItems = isClient
    ? [{ to: '/portal', label: 'Client Portal', icon: ShieldCheck }]
    : CONTRACTOR_NAV;

  return (
    <div className="min-h-screen flex text-slate-900">
      {/* Desktop Frosted Glass Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 glass-sidebar fixed inset-y-0 left-0 z-30">
        <div className="h-15 flex items-center gap-2.5 px-5 border-b border-slate-200/70">
          <div className="w-8 h-8 rounded-xl bg-slate-950 flex items-center justify-center text-white shadow-sm shrink-0">
            <ShieldCheck className="w-4 h-4 text-blue-400" />
          </div>
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold tracking-tight text-slate-950 truncate">
              DoorProof AI
            </div>
            <div className="text-[11px] text-slate-500 truncate">
              {workspace?.organization?.name || 'Workspace'}
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-3.5 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium rounded-xl transition-all ${
                  isActive
                    ? 'bg-slate-950 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-950 hover:bg-white/75'
                }`
              }
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-3.5 border-t border-slate-200/70 space-y-2.5 bg-white/40">
          {!isClient && (
            <button
              onClick={() => setAiOpen(true)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-xl dp-btn-glass"
            >
              <span className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                AI Assistant
              </span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                  workspace?.capabilities?.aiConfigured
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-slate-200/80 text-slate-600'
                }`}
              >
                {workspace?.capabilities?.aiConfigured ? 'Ready' : 'Config'}
              </span>
            </button>
          )}
          <div className="flex items-center justify-between px-2 py-1">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 truncate">
                {workspace?.profile?.full_name || workspace?.profile?.email}
              </div>
              <div className="mt-1">
                {workspace?.member?.role && <RoleBadge role={workspace.member.role} />}
              </div>
            </div>
            <button
              onClick={handleSignOut}
              title="Sign Out"
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Glass Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/35 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-72 max-w-[82vw] glass-surface bg-white/95 h-full flex flex-col shadow-2xl z-10">
            <div className="h-15 flex items-center justify-between px-5 border-b border-slate-200/80">
              <div className="flex items-center gap-2 font-semibold text-sm text-slate-950">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                DoorProof AI
              </div>
              <button onClick={() => setMobileOpen(false)} className="p-1.5 text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium rounded-xl ${
                      isActive ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`
                  }
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="p-3 border-t border-slate-200/80 space-y-2">
              {!isClient && (
                <button
                  onClick={() => {
                    setMobileOpen(false);
                    setAiOpen(true);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-xl dp-btn-glass"
                >
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  AI Assistant
                </button>
              )}
              <button
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-xl"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Floating Frosted Glass Header */}
        <header className="h-15 glass-header sticky top-0 z-20 flex items-center justify-between gap-3 px-4 lg:px-8">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-1.5 text-slate-600 hover:bg-white/80 rounded-lg"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Global Search Trigger */}
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center justify-between gap-3 w-full max-w-sm px-3.5 py-1.5 rounded-xl bg-white/75 hover:bg-white border border-slate-200/80 text-xs text-slate-500 transition-all shadow-2xs"
            >
              <span className="flex items-center gap-2 truncate">
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">Search doors, buildings, clients, DEF...</span>
              </span>
              <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono bg-slate-100/90 border border-slate-200 rounded text-slate-500 shrink-0">
                ⌘K
              </kbd>
            </button>
          </div>

          <div className="flex items-center gap-2.5 relative">
            {!isClient && (
              <span className="hidden xl:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/75 border border-slate-200/80 text-[11px] font-medium text-slate-600">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                {workspace?.subscription?.plan_tier || 'Starter'} • {workspace?.usage?.doors || 0}/
                {workspace?.subscription?.max_doors || 150} doors
              </span>
            )}

            {/* Notification Center Button */}
            <button
              onClick={() => {
                setNotifOpen((o) => !o);
                loadNotifications();
              }}
              className="relative p-2 text-slate-600 hover:text-slate-950 bg-white/70 hover:bg-white border border-slate-200/80 rounded-xl transition-colors"
              aria-label="Notification Center"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-semibold flex items-center justify-center shadow-xs">
                  {unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-12 w-80 sm:w-96 glass-surface bg-white/95 rounded-2xl shadow-2xl z-40 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200/80 bg-slate-50/70">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-slate-950">Notification Center</div>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllRead}
                        className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex gap-1">
                      {(['all', 'unread'] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => setNotifTab(t)}
                          className={`px-2 py-0.5 text-[11px] rounded-md font-medium capitalize ${
                            notifTab === t
                              ? 'bg-slate-900 text-white'
                              : 'text-slate-500 hover:bg-slate-200/60'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    <span className="text-[10px] text-slate-500">
                      Resend: {workspace?.capabilities?.resendConfigured ? 'Live' : 'In-App Only'}
                    </span>
                  </div>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {visibleNotifs.length === 0 ? (
                    <div className="py-9 text-center text-xs text-slate-400">
                      {notifTab === 'unread' ? 'All caught up!' : 'No notifications yet.'}
                    </div>
                  ) : (
                    visibleNotifs.slice(0, 15).map((n) => (
                      <div
                        key={n.id}
                        onClick={() => {
                          setNotifOpen(false);
                          if (n.link_path) navigate(n.link_path);
                        }}
                        className={`px-4 py-3 cursor-pointer hover:bg-blue-50/50 transition-colors ${
                          !n.read ? 'bg-blue-50/35' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-900">{n.title}</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(n.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5 line-clamp-2 leading-relaxed">
                          {n.message}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>

      <CommandSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <AiAssistDrawer
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        aiConfigured={Boolean(workspace?.capabilities?.aiConfigured)}
      />
    </div>
  );
}
