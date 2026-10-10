import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CircleAlert, Eye, EyeOff, MailWarning, Timer, WifiOff } from 'lucide-react';
import { getSupabase } from '../lib/supabase';
import {
  isValidEmail,
  mapAuthError,
  type AuthErrorKind,
  type AuthFailure,
} from '../lib/auth';

const ERROR_ICON: Record<AuthErrorKind, typeof CircleAlert> = {
  'invalid-credentials': CircleAlert,
  'email-taken': MailWarning,
  'weak-password': CircleAlert,
  'invalid-email': MailWarning,
  'rate-limit': Timer,
  network: WifiOff,
  unknown: CircleAlert,
};

/**
 * Shared email sign-in / create-account form (desktop split column and the
 * mobile "Use email instead" panel). Google stays outside: its placement
 * differs per design.
 */
export function EmailAuthForm({ next, fieldHeight }: { next: string; fieldHeight: string }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFailure(null);
    setNotice(null);
    const sb = getSupabase();
    if (!sb) {
      setFailure({
        kind: 'unknown',
        message: 'Supabase is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).',
      });
      return;
    }
    const cleanEmail = email.trim();
    if (!isValidEmail(cleanEmail)) {
      setFailure({ kind: 'invalid-email', message: 'That doesn’t look like an email address.' });
      return;
    }
    if (mode === 'signup' && password.length < 6) {
      setFailure({ kind: 'weak-password', message: 'Pick a password with at least 6 characters.' });
      return;
    }
    if (mode === 'signin' && password.length === 0) {
      setFailure({ kind: 'invalid-credentials', message: 'Enter your password.' });
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await sb.auth.signUp({
          email: cleanEmail,
          password,
          options: { data: { display_name: name.trim() || null } },
        });
        if (error) {
          setFailure(mapAuthError(error));
        } else if (data.session) {
          navigate(next, { replace: true });
        } else {
          // Email confirmation is OFF in this project, so a session is
          // expected immediately. This branch is defensive only.
          setNotice('Account created. Check your inbox to confirm, then sign in.');
          setMode('signin');
        }
      } else {
        const { data, error } = await sb.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) {
          setFailure(mapAuthError(error));
        } else if (data.session) {
          navigate(next, { replace: true });
        }
      }
    } catch (raw) {
      setFailure(mapAuthError(raw));
    } finally {
      setBusy(false);
    }
  }

  async function forgot() {
    setFailure(null);
    setNotice(null);
    const sb = getSupabase();
    const cleanEmail = email.trim();
    if (!sb || !isValidEmail(cleanEmail)) {
      setFailure({ kind: 'invalid-email', message: 'Enter your email above first.' });
      return;
    }
    const { error } = await sb.auth.resetPasswordForEmail(cleanEmail);
    if (error) {
      setFailure(mapAuthError(error));
    } else {
      setNotice('Check your inbox for a password reset link.');
    }
  }

  const Icon = failure ? ERROR_ICON[failure.kind] : CircleAlert;

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
        {mode === 'signup' && (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-ink2">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              placeholder="What should Rocky call you?"
              style={{ height: fieldHeight }}
              className="rounded-xl border border-line bg-surface2 px-3.5 text-[16px] text-ink1 outline-none placeholder:text-ink4 focus:border-accent"
            />
          </label>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-ink2">Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@school.edu"
            style={{ height: fieldHeight }}
            className="rounded-xl border border-line bg-surface2 px-3.5 text-[16px] text-ink1 outline-none placeholder:text-ink4 focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-ink2">Password</span>
          <span className="relative block">
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type={showPw ? 'text' : 'password'}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
              style={{ height: fieldHeight }}
              className="w-full rounded-xl border border-line bg-surface2 px-3.5 pr-12 text-[16px] text-ink1 outline-none placeholder:text-ink4 focus:border-accent"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
              className="absolute right-1 top-1 grid h-10 w-10 place-items-center rounded-lg text-ink3 hover:text-ink1"
            >
              {showPw ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
          </span>
        </label>

        {failure && (
          <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-danger bg-danger-soft p-3.5">
            <Icon size={18} aria-hidden className="mt-0.5 shrink-0 text-danger" />
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-sm font-semibold text-ink1">{failure.message}</span>
              {failure.kind === 'email-taken' && (
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setFailure(null);
                  }}
                  className="self-start text-sm font-bold text-accent-ink"
                >
                  Sign in instead
                </button>
              )}
            </div>
          </div>
        )}
        {notice && (
          <div role="status" className="rounded-xl border border-line bg-surface2 p-3.5 text-sm text-ink1">
            {notice}
          </div>
        )}

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => void forgot()}
            className="text-sm font-medium text-accent-ink"
          >
            Forgot password?
          </button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-11 items-center rounded-xl border border-line bg-surface2 px-[18px] text-sm font-bold text-ink1 disabled:opacity-50"
          >
            {busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </div>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
          setFailure(null);
          setNotice(null);
        }}
        className="text-left text-sm text-ink2"
      >
        {mode === 'signin' ? (
          <>New to Rocky? <span className="font-semibold text-ink1">Create an account</span></>
        ) : (
          <>Have an account? <span className="font-semibold text-ink1">Sign in</span></>
        )}
      </button>
    </div>
  );
}

/** Disabled Google button (both designs; "Coming soon" until OAuth is wired). */
export function GoogleButton({ height }: { height: string }) {
  return (
    <button
      type="button"
      disabled
      title="Google sign-in is coming soon"
      style={{ height }}
      className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-accent text-sm font-semibold text-white opacity-60"
    >
      <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-xs font-bold text-accent">
        G
      </span>
      Continue with Google
      <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold">Coming soon</span>
    </button>
  );
}
