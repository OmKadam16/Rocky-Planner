// Sign in: brand panel + form (desktop two-column, single column on mobile).
// Google stays disabled until the Supabase project enables it (PLAN.md B5);
// email auth + password reset are live.

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  CircleAlert,
  Eye,
  EyeOff,
  Lock,
  MailWarning,
  Mic,
  ShieldCheck,
  Timer,
  WifiOff,
} from 'lucide-react';
import { getSupabase } from '../lib/supabase';
import {
  isValidEmail,
  mapAuthError,
  parseNextParam,
  useSession,
  type AuthErrorKind,
  type AuthFailure,
} from '../lib/auth';
import { Logo } from '../components/Logo';

const ERROR_ICON: Record<AuthErrorKind, typeof CircleAlert> = {
  'invalid-credentials': CircleAlert,
  'email-taken': MailWarning,
  'weak-password': CircleAlert,
  'invalid-email': MailWarning,
  'rate-limit': Timer,
  network: WifiOff,
  unknown: CircleAlert,
};

export function LoginPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const explicitNext = params.get('next');
  const next = parseNextParam(explicitNext);

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate(next, { replace: true });
  }, [loading, session, navigate, next]);

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
        });
        if (error) {
          setFailure(mapAuthError(error));
        } else if (data.session) {
          // Fresh sign-up: first-run setup, unless an explicit ?next= target
          // (e.g. a /remote?pair= link) brought the user here.
          navigate(explicitNext ? next : '/wizard', { replace: true });
        } else {
          // Email confirmation is OFF in this project, so a session is
          // expected immediately. This branch is defensive only.
          setNotice('Account created. Check your inbox to confirm, then sign in.');
          setMode('signin');
        }
      } else {
        const { data, error } = await sb.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
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

  async function resetPassword() {
    setFailure(null);
    setNotice(null);
    const sb = getSupabase();
    const cleanEmail = email.trim();
    if (!sb) {
      setFailure({
        kind: 'unknown',
        message: 'Supabase is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).',
      });
      return;
    }
    if (!isValidEmail(cleanEmail)) {
      setFailure({ kind: 'invalid-email', message: 'Enter your email above first, then try again.' });
      return;
    }
    setBusy(true);
    try {
      const { error } = await sb.auth.resetPasswordForEmail(cleanEmail);
      if (error) setFailure(mapAuthError(error));
      else setNotice(`Reset link sent to ${cleanEmail}. Check your inbox.`);
    } catch (raw) {
      setFailure(mapAuthError(raw));
    } finally {
      setBusy(false);
    }
  }

  const Icon = failure ? ERROR_ICON[failure.kind] : CircleAlert;

  return (
    <div className="grid min-h-full grid-cols-1 lg:grid-cols-2">
      {/* Brand panel (desktop) */}
      <div
        className="hidden flex-col justify-between border-r border-line bg-surface p-14 lg:flex"
        style={{
          background:
            'radial-gradient(110% 70% at 0% 100%, var(--accent-soft) 0%, transparent 65%), var(--surface)',
        }}
      >
        <span className="flex items-center gap-2.5">
          <Logo size={32} />
          <span className="text-xl font-bold tracking-tight">Rocky</span>
        </span>
        <div className="flex max-w-[500px] flex-col gap-5">
          <h1 className="text-[40px] font-bold leading-[1.1] tracking-tight">
            Plan your day out loud.
          </h1>
          <p className="text-[16px] leading-relaxed text-ink2">
            Tell Rocky what changed. It reshuffles the flexible parts of your
            day and leaves classes, work and club meetings where they are.
          </p>
          <span className="inline-flex items-center gap-3 self-start rounded-full border border-line bg-surface2 py-2.5 pl-2.5 pr-[18px]">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-accent text-white">
              <Mic size={16} aria-hidden />
            </span>
            <span className="whitespace-nowrap text-sm">“I&apos;m meeting a friend at 7, replan my day.”</span>
          </span>
        </div>
        <p className="flex items-center gap-2 text-xs text-ink3">
          <ShieldCheck size={14} aria-hidden />
          Rocky&apos;s AI runs on your laptop. Your reading history never leaves it.
        </p>
      </div>

      {/* Form */}
      <div className="flex min-w-0 items-center justify-center px-5 py-10">
        <div className="flex w-full min-w-0 max-w-[400px] flex-col gap-5">
          <span className="flex items-center gap-2.5 lg:hidden">
            <Logo />
            <span className="text-[17px] font-bold tracking-tight">Rocky</span>
          </span>
          <div>
            <h2 className="text-[28px] font-bold tracking-tight">
              {mode === 'signin' ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="mt-1.5 text-sm text-ink2">
              {mode === 'signin'
                ? 'Sign in to pick up where you left off.'
                : 'One account for your laptop and your phone.'}
            </p>
          </div>

          <button
            type="button"
            disabled
            title="Google sign-in is coming soon"
            className="relative inline-flex h-11 items-center justify-center gap-2.5 rounded-xl bg-accent text-sm font-semibold text-white opacity-50"
          >
            <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-xs font-bold text-accent">
              G
            </span>
            Continue with Google
            <span className="absolute -top-2.5 right-3 rounded-full bg-surface2 px-2 py-0.5 text-[11px] font-bold text-ink2">
              Coming soon
            </span>
          </button>

          <div className="flex items-center gap-3 text-xs text-ink3">
            <span className="h-px flex-1 bg-line" />
            or use email
            <span className="h-px flex-1 bg-line" />
          </div>

          <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-ink2">Email</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="you@school.edu"
                className="h-11 rounded-xl border border-line bg-surface2 px-3.5 text-[15px] text-ink1 outline-none placeholder:text-ink4 focus:border-accent"
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
                  className="h-11 w-full rounded-xl border border-line bg-surface2 px-3.5 pr-12 text-[15px] text-ink1 outline-none placeholder:text-ink4 focus:border-accent"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  className="absolute right-1 top-1 grid h-9 w-9 place-items-center rounded-lg text-ink3 hover:text-ink1"
                >
                  {showPw ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
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
                onClick={() => void resetPassword()}
                disabled={busy}
                className="text-sm text-accent-ink hover:underline disabled:opacity-50"
              >
                Forgot password?
              </button>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex h-10 flex-none items-center justify-center rounded-xl border border-line bg-surface2 px-[18px] text-sm font-semibold text-ink1 disabled:opacity-50"
              >
                {busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            </div>
          </form>

          <div className="h-px bg-line" />
          <div className="flex text-sm text-ink2">
            {mode === 'signin' ? (
              <span>
                New to Rocky?{' '}
                <button type="button" onClick={() => { setMode('signup'); setFailure(null); setNotice(null); }} className="font-semibold text-accent-ink hover:underline">
                  Create an account
                </button>
              </span>
            ) : (
              <span>
                Have an account?{' '}
                <button type="button" onClick={() => { setMode('signin'); setFailure(null); setNotice(null); }} className="font-semibold text-accent-ink hover:underline">
                  Sign in
                </button>
              </span>
            )}
          </div>

          <p className="flex items-center gap-2 text-xs text-ink3">
            <Lock size={12} aria-hidden />
            Your AI and your memory stay on your laptop
          </p>
        </div>
      </div>
    </div>
  );
}
