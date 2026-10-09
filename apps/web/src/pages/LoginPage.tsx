import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  CircleAlert,
  Eye,
  EyeOff,
  Lock,
  MailWarning,
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
  const next = parseNextParam(params.get('next'));

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
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
          options: { data: { display_name: name.trim() || null } },
        });
        if (error) {
          const f = mapAuthError(error);
          setFailure(f);
        } else if (data.session) {
          navigate(next, { replace: true });
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

  const Icon = failure ? ERROR_ICON[failure.kind] : CircleAlert;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="flex flex-col gap-5">
        <span className="flex items-center gap-2.5">
          <Logo />
          <span className="text-[17px] font-bold tracking-tight">Rocky</span>
        </span>
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h1>
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
          className="relative inline-flex h-12 items-center justify-center gap-2.5 rounded-xl bg-accent text-[15px] font-semibold text-white opacity-50"
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
          {mode === 'signup' && (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-ink2">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="What should Rocky call you?"
                className="h-12 rounded-xl border border-line bg-surface2 px-3.5 text-[16px] text-ink1 outline-none placeholder:text-ink4 focus:border-accent"
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
              className="h-12 rounded-xl border border-line bg-surface2 px-3.5 text-[16px] text-ink1 outline-none placeholder:text-ink4 focus:border-accent"
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
                className="h-12 w-full rounded-xl border border-line bg-surface2 px-3.5 pr-12 text-[16px] text-ink1 outline-none placeholder:text-ink4 focus:border-accent"
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
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-danger bg-danger-soft p-3.5"
            >
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
                {failure.kind === 'unknown' && (
                  <span className="break-words font-mono text-[11px] text-ink3">{failure.message}</span>
                )}
              </div>
            </div>
          )}
          {notice && (
            <div role="status" className="rounded-xl border border-line bg-surface2 p-3.5 text-sm text-ink1">
              {notice}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-12 items-center justify-center rounded-xl bg-accent text-[15px] font-bold text-white disabled:opacity-50"
          >
            {busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
            setFailure(null);
            setNotice(null);
          }}
          className="text-center text-sm font-semibold text-ink2"
        >
          {mode === 'signin' ? (
            <>New to Rocky? <span className="text-accent-ink">Create an account</span></>
          ) : (
            <>Have an account? <span className="text-accent-ink">Sign in</span></>
          )}
        </button>

        <p className="mt-4 flex items-center justify-center gap-2 text-xs text-ink3">
          <Lock size={12} aria-hidden />
          Your AI and memory stay on your laptop.
        </p>
      </div>
    </div>
  );
}
