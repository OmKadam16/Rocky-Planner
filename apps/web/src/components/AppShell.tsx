import { NavLink } from 'react-router';
import {
  Activity,
  Brain,
  CalendarDays,
  GraduationCap,
  LayoutDashboard,
  Settings,
  Smartphone,
} from 'lucide-react';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';

const items = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/classes', label: 'Classes', icon: GraduationCap },
  { to: '/memory', label: 'Memory', icon: Brain },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full bg-bg text-ink1">
      <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r border-line bg-surface p-4 md:flex">
        <div className="mb-4 flex items-center gap-2.5 px-1">
          <Logo />
          <span className="text-[17px] font-bold tracking-tight">Rocky</span>
        </div>
        {items.map(({ to, label, icon: Icon }) => (
          <span
            key={to}
            title="Lands after pairing (B4–B5)"
            className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium text-ink4"
            aria-disabled
          >
            <Icon size={19} aria-hidden />
            {label}
          </span>
        ))}
        <div className="mt-auto flex flex-col gap-1 border-t border-line pt-3">
          <NavLink
            to="/pair"
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold ${
                isActive ? 'bg-accent-soft text-accent-ink' : 'text-ink2 hover:bg-surface2'
              }`
            }
          >
            <Smartphone size={19} aria-hidden />
            Connect phone
          </NavLink>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3 md:px-8">
          <span className="md:hidden">
            <Logo size={28} />
          </span>
          <span className="font-bold tracking-tight md:hidden">Rocky</span>
          <span className="ml-auto" />
          <ThemeToggle />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
