import { describe, expect, it } from 'vitest';
import {
  APP_NAV,
  APP_PATHS,
  DEFAULT_SETTINGS_CHILD,
  ROOT_REDIRECT,
  SETTINGS_CHILDREN,
  SETTINGS_NAV,
  pairRedirectTarget,
} from './routes';

describe('app routes (every sidebar link opens a real page)', () => {
  it('redirects / to /dashboard', () => {
    expect(ROOT_REDIRECT).toBe('/dashboard');
    expect(ROOT_REDIRECT).toBe(APP_PATHS.dashboard);
  });

  it('has all seven app sections, each under RequireAuth + AppShell', () => {
    expect(APP_NAV.map((n) => n.to)).toEqual([
      '/dashboard',
      '/calendar',
      '/classes',
      '/tasks',
      '/memory',
      '/activity',
      '/settings',
    ]);
    const paths = Object.values(APP_PATHS);
    expect(new Set(paths).size).toBe(paths.length);
    for (const item of APP_NAV) {
      expect(item.label).toBeTruthy();
    }
  });

  it('has all six settings sub-routes, defaulting to profile', () => {
    expect([...SETTINGS_CHILDREN]).toEqual([
      'profile',
      'devices',
      'voice',
      'ai',
      'privacy',
      'appearance',
    ]);
    expect(DEFAULT_SETTINGS_CHILD).toBe('profile');
    expect(SETTINGS_NAV.map((n) => n.to)).toEqual([...SETTINGS_CHILDREN]);
  });
});

describe('pairRedirectTarget (legacy /pair keeps working)', () => {
  it('redirects to Settings → Devices, preserving the query string', () => {
    expect(pairRedirectTarget('')).toBe('/settings/devices');
    expect(pairRedirectTarget('?from=onboarding')).toBe(
      '/settings/devices?from=onboarding',
    );
  });

  it('ignores malformed search strings', () => {
    expect(pairRedirectTarget('from=onboarding')).toBe('/settings/devices');
  });
});
