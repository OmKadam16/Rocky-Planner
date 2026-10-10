import { describe, expect, it } from 'vitest';
import {
  buildLoginRedirect,
  isValidEmail,
  loginRouteFor,
  mapAuthError,
  parseNextParam,
  postSignOutTarget,
  resolveRemoteScreen,
} from './auth';

describe('buildLoginRedirect (preserves full path incl. query)', () => {
  it('keeps /remote?pair=<CODE> through the login redirect', () => {
    const to = buildLoginRedirect('/remote?pair=K7P2QM');
    expect(to).toBe('/login?next=%2Fremote%3Fpair%3DK7P2QM');
    // Round-trips back to the exact pre-login target.
    expect(parseNextParam(new URLSearchParams(to.split('?')[1]).get('next'))).toBe(
      '/remote?pair=K7P2QM',
    );
  });

  it('handles plain paths', () => {
    expect(buildLoginRedirect('/pair')).toBe('/login?next=%2Fpair');
    expect(parseNextParam('%2Fpair')).toBe('/pair');
  });
});

describe('parseNextParam (open-redirect guard)', () => {
  it('rejects off-origin targets', () => {
    expect(parseNextParam('//evil.com/x')).toBe('/dashboard');
    expect(parseNextParam('https://evil.com/')).toBe('/dashboard');
    expect(parseNextParam('javascript:alert(1)')).toBe('/dashboard');
  });

  it('falls back to the dashboard when missing or malformed', () => {
    expect(parseNextParam(null)).toBe('/dashboard');
    expect(parseNextParam('')).toBe('/dashboard');
    expect(parseNextParam('%E0%A4%A')).toBe('/dashboard');
    expect(parseNextParam(null, '/remote')).toBe('/remote');
  });
});

describe('mapAuthError', () => {
  it('maps invalid credentials (unknown email AND wrong password share one message)', () => {
    const f = mapAuthError({ message: 'Invalid login credentials' });
    expect(f.kind).toBe('invalid-credentials');
    expect(f.message).toMatch(/don’t match/);
  });

  it('maps existing account on sign-up', () => {
    expect(mapAuthError({ message: 'User already registered' }).kind).toBe('email-taken');
  });

  it('maps rate limits', () => {
    expect(mapAuthError({ message: 'Email rate limit exceeded' }).kind).toBe('rate-limit');
    expect(mapAuthError({ message: 'Over request rate limit' }).kind).toBe('rate-limit');
  });

  it('maps network failures', () => {
    expect(mapAuthError(new TypeError('Failed to fetch')).kind).toBe('network');
    expect(mapAuthError({ message: 'Network request failed' }).kind).toBe('network');
  });

  it('keeps unknown messages visible', () => {
    const f = mapAuthError({ message: 'Something exotic happened' });
    expect(f.kind).toBe('unknown');
    expect(f.message).toBe('Something exotic happened');
  });
});

describe('isValidEmail', () => {
  it('accepts normal addresses and rejects junk', () => {
    expect(isValidEmail('oma@school.edu')).toBe(true);
    expect(isValidEmail(' a@b.co ')).toBe(true);
    expect(isValidEmail('nope')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});

describe('loginRouteFor (desktop vs mobile sign-in)', () => {
  it('sends /remote paths to the mobile sign-in', () => {
    expect(loginRouteFor('/remote')).toBe('/remote/login');
    expect(loginRouteFor('/remote/login')).toBe('/remote/login');
  });

  it('sends everything else to desktop /login', () => {
    expect(loginRouteFor('/dashboard')).toBe('/login');
    expect(loginRouteFor('/setup')).toBe('/login');
    expect(loginRouteFor('/')).toBe('/login');
  });
});

describe('postSignOutTarget (sign-out returns to the right screen)', () => {
  it('keeps the phone on the mobile sign-in with ?pair intact', () => {
    expect(postSignOutTarget('/remote', '?pair=K7P2QM')).toBe(
      '/remote/login?next=%2Fremote%3Fpair%3DK7P2QM',
    );
    expect(postSignOutTarget('/remote', '')).toBe('/remote/login?next=%2Fremote');
  });

  it('sends laptop sign-outs to desktop /login', () => {
    expect(postSignOutTarget('/dashboard', '')).toBe('/login?next=%2Fdashboard');
  });
});

describe('resolveRemoteScreen (pair vs home gating)', () => {
  it('loads, then picks home or pair', () => {
    expect(resolveRemoteScreen(null)).toBe('loading');
    expect(resolveRemoteScreen(true)).toBe('home');
    expect(resolveRemoteScreen(false)).toBe('pair');
  });
});
