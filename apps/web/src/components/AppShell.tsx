// Laptop app shell: sidebar nav, brain + phone status chips, user menu.
//
// Brain chip rule: "Brain running" only while the laptop devices row has a
// fresh heartbeat (last_seen < 45 s), otherwise "Brain not running".
// Phone chip reads the devices phone row (paired / not paired).

import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router';
import {
  Activity,
  Brain,
  CalendarDays,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MemoryStick,
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

const NAV_ICONS: Record<string, LucideIcon> = {
  '/dashboard': LayoutDashboard,
  '/calendar': CalendarDays,
  '/classes': GraduationCap,
  '/tasks': ListChecks,
  '/memory': MemoryStick,
  '/activity': Activity,
  '/settings': Settings,
};

function Chip({
  dot,
  title,
  sub,
  dotLabel,
}: {
  dot: string;
  title: string;
  sub: string;
  dotLabel: string;
}) {
  return (
    <span className="flex items-center gap-2.5 rounded-xl px-3 py-2">
      <span
        role="img"
        aria-label={dotLabel}
        title={dotLabel}
        className="h-2 w-2 flex-none rounded-full"
        style={{ background: dot }}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] font-bold text-ink1">{title}</span>
        <span className="truncate text-xs text-ink3">{sub}</span>
      </span>
    </span>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const brain = useLaptopPresence(true);
  const phone = usePhonePaired(true);
  const { user, signOut } = useSession();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

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

  const email = user?.email ?? null;
  const name =
    displayNameFor(profile?.display_name, profile?.full_name, email) ?? 'Account';
  const initials = initialsFor(profile?.display_name, profile?.full_name, email);
  const brainRunning = brain.status === 'online';

  const onSignOut = async () => {
    setMenuOpen(false);
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-full bg-bg text-ink1">
      <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r border-line bg-surface p-4 md:flex">
        <div className="mb-4 flex items-center gap-2.5 px-1">
          <Logo />
          <span className="text-[17px] font-bold tracking-tight">Rocky</span>
        </div>
        <nav aria-label="App" className="flex flex-col gap-1">
          {APP_NAV.map(({ to, label }) => {
            const Icon = NAV_ICONS[to] ?? LayoutDashboard;
            return (
              <NavLink
                key={to}
                to={to}
                end={to === '/dashboard'}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] ${
                    isActive
                      ? 'bg-accent-soft font-semibold text-accent-ink'
                      : 'font-medium text-ink2 hover:bg-surface2 hover:text-ink1'
                  }`
                }
              >
                <Icon size={19} aria-hidden />
                {label}
              </NavLink>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-1 border-t border-line pt-3">
          <Chip
            dot={brainRunning ? 'var(--success)' : 'var(--ink4)'}
            dotLabel={brainRunning ? 'Brain running' : 'Brain not running'}
            title={brainRunning ? 'Brain running' : 'Brain not running'}
            sub={brainRunning ? brain.laptopName : 'Start the brain on this laptop'}
          />
          <NavLink
            to="/settings/devices"
            title={phone.paired ? 'Phone settings' : 'Pair your phone in Settings → Devices'}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-xl px-3 py-2 hover:bg-surface2 ${
                isActive ? 'bg-accent-soft' : ''
              }`
            }
          >
            <Smartphone size={15} aria-hidden className="shrink-0 text-ink2" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-1.5 text-[13px] font-bold text-ink1">
                <span
                  role="img"
                  aria-label={phone.paired ? 'Phone paired' : 'No phone paired'}
                  className="h-2 w-2 flex-none rounded-full"
                  style={{
                    background: phone.paired ? 'var(--success)' : 'var(--ink4)',
                  }}
                />
                <span className="truncate">
                  {phone.paired ? (phone.phoneName ?? 'Phone paired') : 'No phone paired'}
                </span>
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
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 hover:bg-surface2"
            >
              <span
                aria-hidden
                className="grid h-8 w-8 flex-none place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent-ink"
              >
                {initials}
              </span>
              <span className="flex min-w-0 flex-1 flex-col text-left">
                <span className="truncate text-[13px] font-bold text-ink1">{name}</span>
                <span className="truncate text-xs text-ink3">{email ?? ''}</span>
              </span>
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
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3 md:px-8">
          <span className="md:hidden">
            <Logo size={28} />
          </span>
          <span className="font-bold tracking-tight md:hidden">Rocky</span>
          <span className="ml-auto flex items-center gap-2 text-xs text-ink3">
            <Brain size={14} aria-hidden style={{ color: brainRunning ? 'var(--success)' : 'var(--ink4)' }} />
            {brainRunning ? 'Brain running' : 'Brain not running'}
          </span>
          <ThemeToggle />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
