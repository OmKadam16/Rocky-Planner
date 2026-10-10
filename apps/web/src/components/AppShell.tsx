// Laptop app shell: top bar (title + search + voice pill), sidebar nav,
// boxed brain + phone chips, user row with menu.

import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import {
  Activity,
  Brain,
  CalendarDays,
  ChevronsUpDown,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MemoryStick,
  PanelLeft,
  Search,
  Settings,
  Smartphone,
  User,
  type LucideIcon,
} from 'lucide-react';
import type { Profile } from '@rocky/core';
import { APP_NAV } from '../lib/routes';
import { useSession } from '../lib/auth';
import { useLaptopPresence } from '../lib/remote';
import { usePhonePaired } from '../lib/useDevices';
import { displayNameFor, initialsFor } from '../lib/profile';
import { readProfile } from '../lib/queries';
import { isSupabaseConfigured, touchLaptopHeartbeat } from '../lib/supabase';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';
import { VoiceOverlay, VoicePill } from './VoiceBar';
import { VoiceBarProvider } from '../lib/voice';
import { SearchPalette } from './SearchPalette';

const NAV_ICONS: Record<string, LucideIcon> = {
  '/dashboard': LayoutDashboard,
  '/calendar': CalendarDays,
  '/classes': GraduationCap,
  '/tasks': ListChecks,
  '/memory': MemoryStick,
  '/activity': Activity,
  '/settings': Settings,
};

function pageTitleFor(pathname: string): string {
  if (pathname.startsWith('/settings')) return 'Settings';
  const found = APP_NAV.find((n) => pathname === n.to || pathname.startsWith(`${n.to}/`));
  return found?.label ?? 'Rocky';
}

function Shell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const brain = useLaptopPresence(true);
  const phone = usePhonePaired(true);
  const { user, signOut } = useSession();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Heartbeat every 15 s keeps devices.last_seen fresh on every app page.
  // TEMPORARY owner: apps/brain takes this over with its own 15 s heartbeat
  // (PLAN.md section 6) once the brain runs — then delete this interval and
  // keep only the brain's. The phone decides "laptop offline" solely from
  // last_seen older than 45 s.
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    void touchLaptopHeartbeat();
    const id = window.setInterval(() => void touchLaptopHeartbeat(), 15_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let alive = true;
    void readProfile().then((p) => {
      if (alive) setProfile(p);
    });
    return () => {
      alive = false;
    };
  }, []);

  // ⌘K / Ctrl+K opens search from anywhere in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const email = user?.email ?? null;
  const fullName = (profile?.full_name ?? '').trim();
  const name = fullName || displayNameFor(profile?.display_name, null, email) || 'Account';
  const school = (profile?.school ?? '').trim();
  const initials = initialsFor(profile?.display_name, profile?.full_name, email);
  const brainRunning = brain.status === 'online';

  const onSignOut = async () => {
    setMenuOpen(false);
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-full bg-bg text-ink1">
      <aside
        className={`${collapsed ? 'w-[76px]' : 'w-60'} hidden shrink-0 flex-col gap-1 border-r border-line bg-surface p-4 md:flex`}
      >
        <div className="mb-4 flex items-center gap-2.5 px-1">
          <Logo />
          {!collapsed && <span className="text-[17px] font-bold tracking-tight">Rocky</span>}
        </div>
        <nav aria-label="App" className="flex flex-col gap-1">
          {APP_NAV.map(({ to, label }) => {
            const Icon = NAV_ICONS[to] ?? LayoutDashboard;
            return (
              <NavLink
                key={to}
                to={to}
                end={to === '/dashboard'}
                title={collapsed ? label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] ${
                    collapsed ? 'justify-center' : ''
                  } ${
                    isActive
                      ? 'bg-accent-soft font-semibold text-accent-ink'
                      : 'font-medium text-ink2 hover:bg-surface2 hover:text-ink1'
                  }`
                }
              >
                <Icon size={19} aria-hidden className="shrink-0" />
                {!collapsed && label}
              </NavLink>
            );
          })}
        </nav>
        {!collapsed && (
          <div className="mt-auto flex flex-col gap-2 border-t border-line pt-3">
            <div
              role="status"
              aria-label={brainRunning ? 'Brain ready' : 'Brain not running'}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5"
              style={{ background: brainRunning ? 'var(--success-soft)' : 'var(--surface2)' }}
              title={brainRunning ? 'qwen3.5:2b · this laptop' : 'Start the brain on this laptop'}
            >
              <span
                aria-hidden
                className="h-2 w-2 flex-none rounded-full"
                style={{ background: brainRunning ? 'var(--success)' : 'var(--ink4)' }}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span
                  className="truncate text-[13px] font-bold"
                  style={{ color: brainRunning ? 'var(--success)' : 'var(--ink1)' }}
                >
                  {brainRunning ? 'Brain ready' : 'Brain not running'}
                </span>
                <span className="truncate text-xs text-ink2">
                  {brainRunning ? 'qwen3.5:2b · this laptop' : 'Start the brain on this laptop'}
                </span>
              </span>
            </div>
            <NavLink
              to="/settings/devices"
              title={phone.paired ? 'Phone settings' : 'Pair your phone in Settings → Devices'}
              className="flex items-center gap-2.5 rounded-xl bg-surface2 px-3 py-2.5 hover:bg-surface2"
            >
              <Smartphone size={15} aria-hidden className="shrink-0 text-ink2" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] font-bold text-ink1">
                  {phone.paired ? (phone.phoneName ?? 'Phone paired') : 'No phone paired'}
                </span>
                <span className="truncate text-xs text-ink3">
                  {phone.paired ? 'Connected' : 'Pair in Settings'}
                </span>
              </span>
            </NavLink>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Account menu"
                className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-surface2"
              >
                <span
                  aria-hidden
                  className="grid h-8 w-8 flex-none place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent-ink"
                >
                  {initials}
                </span>
                <span className="flex min-w-0 flex-1 flex-col text-left">
                  <span className="truncate text-[13px] font-bold text-ink1">{name}</span>
                  {school && <span className="truncate text-xs text-ink3">{school}</span>}
                </span>
                <ChevronsUpDown size={15} aria-hidden className="shrink-0 text-ink3" />
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  aria-label="Account"
                  className="absolute bottom-full left-0 right-0 mb-1 flex flex-col gap-1 rounded-xl border border-line bg-surface p-1.5 shadow-card"
                >
                  <NavLink
                    to="/settings/profile"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink1 hover:bg-surface2"
                  >
                    <User size={16} aria-hidden />
                    Profile settings
                  </NavLink>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void onSignOut()}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-danger hover:bg-surface2"
                  >
                    <LogOut size={16} aria-hidden />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3 md:px-6">
          <span className="md:hidden">
            <Logo size={28} />
          </span>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden h-9 w-9 place-items-center rounded-lg text-ink2 hover:bg-surface2 hover:text-ink1 md:grid"
          >
            <PanelLeft size={18} aria-hidden />
          </button>
          <h1 className="hidden text-xl font-bold tracking-tight md:block">
            {pageTitleFor(pathname)}
          </h1>
          <span className="ml-auto hidden items-center gap-3 md:flex md:min-w-0 md:flex-1 md:justify-end">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search (Ctrl+K)"
              className="flex h-11 w-60 items-center gap-2.5 rounded-xl border border-line bg-bg px-3.5 text-sm text-ink3 hover:text-ink1"
            >
              <Search size={16} aria-hidden className="shrink-0" />
              <span className="flex-1 text-left">Search</span>
              <span className="tnum rounded-md border border-line px-1.5 py-0.5 text-[11px]">⌘K</span>
            </button>
            <VoicePill />
          </span>
          <span className="ml-auto flex items-center gap-2 text-xs text-ink3 md:hidden">
            <Brain size={14} aria-hidden style={{ color: brainRunning ? 'var(--success)' : 'var(--ink4)' }} />
            {brainRunning ? 'Brain running' : 'Brain not running'}
          </span>
          <ThemeToggle />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
      <VoiceOverlay />
      {searchOpen && <SearchPalette onClose={() => setSearchOpen(false)} />}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <VoiceBarProvider>
      <Shell>{children}</Shell>
    </VoiceBarProvider>
  );
}
