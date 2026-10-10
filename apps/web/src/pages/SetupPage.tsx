import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Logo } from '../components/Logo';
import { DevicesPage } from './settings/DevicesPage';
import { canSkipStep, nextLabel, stepHint, WIZARD_STEPS } from '../lib/onboarding';
import { readProfile, setOnboarded } from '../lib/setupApi';
import { StepProfile } from '../components/setup/StepProfile';
import { StepAbout } from '../components/setup/StepAbout';
import { StepClasses } from '../components/setup/StepClasses';
import { StepBrain } from '../components/setup/StepBrain';

export interface StepApi {
  /** Save the step; returns an error string, or null on success. */
  save: () => Promise<string | null>;
}

const apiRefs: { current: (StepApi | null)[] } = { current: [] };

/**
 * /setup: 5-step first-run onboarding (design wizard screens 1-5).
 * Progress bar + labels up top, Back / Continue / Skip in the footer,
 * Skip only on step 2 (About you) and step 5 (Phone). Finishing (Continue
 * on step 5, connected or skipped) stamps profiles.onboarded_at.
 */
export function SetupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    let alive = true;
    readProfile()
      .then((p) => {
        if (alive) setProfile(p);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function goNext() {
    if (step === 5 && !connected) return;
    setBusy(true);
    setError(null);
    try {
      const api = apiRefs.current[step];
      if (api) {
        const err = await api.save();
        if (err) {
          setError(err);
          setBusy(false);
          return;
        }
      }
      if (step === 5) {
        await setOnboarded();
        navigate('/dashboard', { replace: true });
        return;
      }
      setStep((s) => Math.min(5, s + 1));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function skip() {
    if (!canSkipStep(step)) return;
    if (step === 5) {
      setOnboarded()
        .then(() => navigate('/dashboard', { replace: true }))
        .catch((e: unknown) =>
          setError(e instanceof Error ? e.message : 'Could not save. Try again.'),
        );
      return;
    }
    setError(null);
    setStep((s) => Math.min(5, s + 1));
  }

  return (
    <div className="flex min-h-full flex-col bg-bg text-ink1">
      {/* Progress header */}
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-4 py-4 md:px-8">
          <span className="flex items-center gap-2">
            <Logo size={28} />
            <span className="font-bold tracking-tight">Rocky setup</span>
          </span>
          <div className="grid min-w-0 flex-1 grid-cols-5 gap-2" role="list" aria-label="Setup progress">
            {WIZARD_STEPS.map((label, i) => {
              const n = i + 1;
              const done = n <= step;
              return (
                <span key={label} role="listitem" aria-current={n === step ? 'step' : undefined}>
                  <span
                    className="block h-1 rounded-full"
                    style={{ background: done ? 'var(--accent)' : 'var(--line)' }}
                  />
                  <span
                    className="mt-1.5 block truncate text-xs"
                    style={{ color: done ? 'var(--ink1)' : 'var(--ink3)', fontWeight: n === step ? 700 : 400 }}
                  >
                    {label}
                  </span>
                </span>
              );
            })}
          </div>
          <span className="tnum hidden shrink-0 text-xs text-ink3 sm:block">Step {step} of 5</span>
        </div>
      </header>

      {/* Step body */}
      <main className="min-h-0 flex-1">
        {step === 1 && <StepProfile apiRef={(api) => (apiRefs.current[1] = api)} initial={profile} />}
        {step === 2 && <StepAbout apiRef={(api) => (apiRefs.current[2] = api)} initial={profile} />}
        {step === 3 && <StepClasses apiRef={(api) => (apiRefs.current[3] = api)} />}
        {step === 4 && <StepBrain apiRef={(api) => (apiRefs.current[4] = api)} />}
        {step === 5 && <DevicesPage embedded onConnected={() => setConnected(true)} />}
      </main>

      {error && (
        <div className="mx-auto w-full max-w-3xl px-4 md:px-8" role="alert">
          <p className="rounded-xl border border-danger bg-danger-soft p-3.5 text-sm font-semibold text-ink1">
            {error}
          </p>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-4 md:px-8">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1 || busy}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-bold text-ink1 disabled:opacity-40"
          >
            <ArrowLeft size={16} aria-hidden />
            Back
          </button>
          <span className="flex-1 text-center text-xs text-ink3">{stepHint(step)}</span>
          {canSkipStep(step) && (
            <button
              type="button"
              onClick={skip}
              disabled={busy}
              className="h-11 rounded-xl px-4 text-sm font-semibold text-ink2 disabled:opacity-40"
            >
              Skip for now
            </button>
          )}
          <button
            type="button"
            onClick={() => void goNext()}
            disabled={busy || (step === 5 && !connected)}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-white disabled:opacity-40"
          >
            {busy ? 'Saving…' : nextLabel(step)}
            <ArrowRight size={16} aria-hidden />
          </button>
        </div>
      </footer>
    </div>
  );
}
