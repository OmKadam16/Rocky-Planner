// Settings shell: left sub-nav (Profile, Devices, Voice, AI, Privacy,
// Appearance) + the active sub-page.

import { NavLink, Outlet } from 'react-router';
import { SETTINGS_NAV } from '../../lib/routes';
import { PageHeader } from '../../components/Page';

export function SettingsLayout() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8">
      <PageHeader title="Settings" sub="Your profile, devices, voice, AI, privacy, and appearance." />
      <div className="grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav
          aria-label="Settings sections"
          className="flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface p-2 lg:flex-col"
        >
          {SETTINGS_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-xl px-3 py-2.5 text-[15px] ${
                  isActive
                    ? 'bg-accent-soft font-semibold text-accent-ink'
                    : 'font-medium text-ink2 hover:bg-surface2 hover:text-ink1'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
