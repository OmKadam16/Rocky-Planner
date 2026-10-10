// App route table (single source of truth for nav + tests).
//
// "/" redirects to ROOT_REDIRECT (/dashboard). "/pair" is a legacy laptop
// route that redirects to /settings/devices, preserving the query string
// (so ?from=onboarding survives). Unknown paths render the 404 page.

export const ROOT_REDIRECT = '/dashboard';

export const APP_PATHS = {
  dashboard: '/dashboard',
  calendar: '/calendar',
  classes: '/classes',
  tasks: '/tasks',
  memory: '/memory',
  activity: '/activity',
  settings: '/settings',
} as const;

export interface NavItem {
  to: string;
  label: string;
}

/** Sidebar order: Dashboard, Calendar, Classes, Tasks, Memory, Activity, Settings. */
export const APP_NAV: NavItem[] = [
  { to: APP_PATHS.dashboard, label: 'Dashboard' },
  { to: APP_PATHS.calendar, label: 'Calendar' },
  { to: APP_PATHS.classes, label: 'Classes' },
  { to: APP_PATHS.tasks, label: 'Tasks' },
  { to: APP_PATHS.memory, label: 'Memory' },
  { to: APP_PATHS.activity, label: 'Activity' },
  { to: APP_PATHS.settings, label: 'Settings' },
];

export const SETTINGS_CHILDREN = [
  'profile',
  'devices',
  'voice',
  'ai',
  'privacy',
  'appearance',
] as const;

export type SettingsChild = (typeof SETTINGS_CHILDREN)[number];

export const DEFAULT_SETTINGS_CHILD: SettingsChild = 'profile';

export const SETTINGS_NAV: NavItem[] = [
  { to: 'profile', label: 'Profile' },
  { to: 'devices', label: 'Devices' },
  { to: 'voice', label: 'Voice' },
  { to: 'ai', label: 'AI' },
  { to: 'privacy', label: 'Privacy' },
  { to: 'appearance', label: 'Appearance' },
];

/** Legacy /pair target: the Devices settings page, query string preserved. */
export function pairRedirectTarget(search: string): string {
  const q = search.startsWith('?') ? search : '';
  return `/settings/devices${q}`;
}
