import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Lock } from 'lucide-react';
import { parseNextParam, useSession } from '../lib/auth';
import { EmailAuthForm, GoogleButton } from '../components/EmailAuthForm';
import { Logo } from '../components/Logo';

/**
 * Mobile sign-in (design screen 1). Distinct from the desktop split page:
 * logo, "Talk to your day.", Google (disabled), "Use email instead"
 * expanding the email form, privacy line. ?pair=CODE survives via ?next.
 */
export function RemoteLoginPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const [emailOpen, setEmailOpen] = useState(false);
  const next = parseNextParam(params.get('next'), '/remote');

  useEffect(() => {
    if (!loading && session) navigate(next, { replace: true });
  }, [loading, session, navigate, next]);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col bg-bg px-5 pb-10 pt-14 text-ink1">
      <span className="flex items-center gap-2.5">
        <Logo size={30} />
        <span className="text-lg font-bold tracking-tight">Rocky</span>
      </span>
      <h1 className="mt-8 text-[28px] font-bold leading-tight tracking-tight">Talk to your day.</h1>
      <p className="mt-2 text-[16px] leading-relaxed text-ink2">
        Sign in with the same account as your laptop to pair this phone.
      </p>

      <div className="mt-8 flex flex-col gap-3">
        <GoogleButton height="52px" />
        {!emailOpen ? (
          <button
            type="button"
            onClick={() => setEmailOpen(true)}
            className="inline-flex h-12 items-center justify-center text-sm font-semibold text-ink2"
          >
            Use email instead
          </button>
        ) : (
          <div className="rounded-2xl border border-line bg-surface p-4">
            <EmailAuthForm next={next} fieldHeight="48px" />
          </div>
        )}
      </div>

      <span className="flex-1" />
      <p className="mt-8 flex items-center justify-center gap-2 text-xs text-ink3">
        <Lock size={12} aria-hidden />
        Your AI and memory stay on your laptop.
      </p>
    </div>
  );
}
