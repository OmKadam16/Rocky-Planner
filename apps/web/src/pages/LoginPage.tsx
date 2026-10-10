import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Lock, Mic, ShieldCheck } from 'lucide-react';
import { parseNextParam, useSession } from '../lib/auth';
import { EmailAuthForm, GoogleButton } from '../components/EmailAuthForm';
import { Logo } from '../components/Logo';

/**
 * Desktop sign-in (design screen 'signin', split layout).
 * Left: brand panel. Right: 400px form column.
 */
export function LoginPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const next = parseNextParam(params.get('next'), '/dashboard');

  useEffect(() => {
    if (!loading && session) navigate(next, { replace: true });
  }, [loading, session, navigate, next]);

  return (
    <div className="grid min-h-full bg-bg text-ink1 lg:grid-cols-2">
      {/* Brand panel */}
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
            Tell Rocky what changed. It reshuffles the flexible parts of your day
            and leaves classes, work and club meetings where they are.
          </p>
          <span className="inline-flex items-center gap-3 self-start rounded-full border border-line bg-surface2 py-2.5 pl-2.5 pr-5">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-accent text-white">
              <Mic size={16} aria-hidden />
            </span>
            <span className="whitespace-nowrap text-sm text-ink1">
              “I&apos;m meeting a friend at 7, replan my day.”
            </span>
          </span>
        </div>
        <p className="flex items-center gap-2 text-xs text-ink3">
          <ShieldCheck size={12} aria-hidden />
          Rocky&apos;s AI runs on your laptop. Your reading history never leaves it.
        </p>
      </div>

      {/* Form column */}
      <div className="flex items-center justify-center px-5 py-10">
        <div className="flex w-full max-w-[400px] flex-col gap-5">
          <span className="flex items-center gap-2.5 lg:hidden">
            <Logo />
            <span className="text-[17px] font-bold tracking-tight">Rocky</span>
          </span>
          <div>
            <h2 className="text-[28px] font-bold tracking-tight">Welcome back</h2>
            <p className="mt-1.5 text-sm text-ink2">Sign in to pick up where you left off.</p>
          </div>
          <GoogleButton height="44px" />
          <div className="flex items-center gap-3 text-xs text-ink3">
            <span className="h-px flex-1 bg-line" />
            or use email
            <span className="h-px flex-1 bg-line" />
          </div>
          <EmailAuthForm next={next} fieldHeight="44px" />
          <p className="flex items-center gap-2 text-xs text-ink3">
            <Lock size={12} aria-hidden />
            Your AI and your memory stay on your laptop.
          </p>
        </div>
      </div>
    </div>
  );
}
