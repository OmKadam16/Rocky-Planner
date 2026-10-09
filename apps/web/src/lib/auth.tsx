import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Navigate, useLocation } from 'react-router';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabase } from './supabase';

// ---------------------------------------------------------------------------
// Auth error kinds — mapped from supabase-js AuthError shapes.
// Supabase returns "Invalid login credentials" for BOTH unknown email and
// wrong password, so sign-in surfaces one honest combined state; sign-up
// with an existing address is distinguishable ("User already registered").
// ---------------------------------------------------------------------------

export type AuthErrorKind =
  | 'invalid-credentials' // sign-in: unknown email OR wrong password
  | 'email-taken' // sign-up: address already registered
  | 'weak-password' // sign-up: too short / rejected
  | 'invalid-email' // client-side: malformed address
  | 'rate-limit'
  | 'network'
  | 'unknown';

export interface AuthFailure {
  kind: AuthErrorKind;
  message: string;
}

interface SupabaseAuthErrorLike {
  message: string;
  status?: number;
}

/** Map a supabase-js auth failure onto an AuthFailure (pure, tested). */
export function mapAuthError(raw: unknown): AuthFailure {
  if (raw instanceof TypeError) {
    return { kind: 'network', message: 'Could not reach the server. Check your connection.' };
  }
  const err = raw as SupabaseAuthErrorLike | null;
  const message = err?.message ?? 'Something went wrong signing in.';
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials')) {
    return {
      kind: 'invalid-credentials',
      message: 'That email and password don’t match. Try again or create an account.',
    };
  }
  if (lower.includes('user already registered') || lower.includes('already been registered')) {
    return {
      kind: 'email-taken',
      message: 'That email already has an account. Sign in instead.',
    };
  }
  if (lower.includes('rate limit') || lower.includes('over request') || lower.includes('too many')) {
    return {
      kind: 'rate-limit',
      message: 'Too many attempts. Wait a minute, then try again.',
    };
  }
  if (
    lower.includes('password') &&
    (lower.includes('short') || lower.includes('least') || lower.includes('characters'))
  ) {
    return { kind: 'weak-password', message };
  }
  if (lower.includes('failed to fetch') || lower.includes('network')) {
    return { kind: 'network', message: 'Could not reach the server. Check your connection.' };
  }
  return { kind: 'unknown', message };
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// ---------------------------------------------------------------------------
// Login redirect helpers (pure, tested).
// ?next carries the full pre-login path INCLUDING its query string, so
// /remote?pair=<CODE> survives the redirect. Only same-origin paths allowed.
// ---------------------------------------------------------------------------

/** Build /login?next=<full path>. Query strings are preserved verbatim. */
export function buildLoginRedirect(nextPath: string): string {
  return `/login?next=${encodeURIComponent(nextPath)}`;
}

/** Validate a ?next value; fall back when missing or off-origin. */
export function parseNextParam(raw: string | null, fallback = '/pair'): string {
  if (!raw) return fallback;
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith('/') && !decoded.startsWith('//')) return decoded;
  } catch {
    /* malformed — fall through */
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Session context.
// ---------------------------------------------------------------------------

interface SessionState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionState>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
  refresh: async () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) {
      setSession(null);
      setLoading(false);
      return;
    }
    const { data } = await sb.auth.getSession();
    setSession(data.session);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const sb = getSupabase();
    if (!sb) return;
    const { data: sub } = sb.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [refresh]);

  const signOut = useCallback(async () => {
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
    setSession(null);
  }, []);

  const value = useMemo<SessionState>(
    () => ({ session, user: session?.user ?? null, loading, signOut, refresh }),
    [session, loading, signOut, refresh],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  return useContext(SessionContext);
}

/** Gate: requires a session, else /login?next=<full path incl. query>. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  const loc = useLocation();
  if (loading) {
    return (
      <div className="grid min-h-full place-items-center bg-bg text-ink3" role="status" aria-label="Loading">
        <span
          className="block h-8 w-8 rounded-full border-[3px] border-line border-t-accent"
          style={{ animation: 'rk-spin 0.9s linear infinite' }}
        />
      </div>
    );
  }
  if (!session) {
    return <Navigate to={buildLoginRedirect(loc.pathname + loc.search)} replace />;
  }
  return <>{children}</>;
}
