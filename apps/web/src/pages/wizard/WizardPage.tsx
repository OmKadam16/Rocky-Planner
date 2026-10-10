// First-run setup wizard: Profile → About you → Classes → Brain → Phone.
// Centered column, progress header, Back/Continue footer. Skippable at every
// step; completion is a per-account local flag (no schema change).

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { Profile } from '@rocky/core';
import { useSession } from '../../lib/auth';
import { profileFormToRow, type ProfileFormState } from '../../lib/profile';
import { isWizardDone, markWizardDone, WIZARD_STEPS } from '../../lib/wizard';
import { readProfile, saveProfile, saveProfileExtras } from '../../lib/queries';
import { Logo } from '../../components/Logo';
import { PairingFlow } from '../../components/PairPanel';
import { WizardProfileStep } from './StepProfile';
import { WizardAboutStep, type AboutState } from './StepAbout';
import { WizardClassesStep } from './StepClasses';
import { WizardBrainStep } from './StepBrain';

const FOOT_HINT = ['', '', '', 'Runs fully offline once set up', 'You can pair a phone later in Settings → Devices'];

export function WizardPage() {
  const { user, signOut } = useSession();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && isWizardDone(user.id)) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    let alive = true;
    void readProfile().then((p) => alive && setProfile(p));
    return () => {
      alive = false;
    };
  }, []);

  const finish = useCallback(() => {
    if (user) markWizardDone(user.id);
    navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  const back = useCallback(async () => {
    setError(null);
    if (step > 1) {
      setStep(step - 1);
      return;
    }
    await signOut();
    navigate('/login', { replace: true });
  }, [step, signOut, navigate]);

  const saveProfileStep = useCallback(
    async (form: ProfileFormState) => {
      if (!user) {
        setError('You are not signed in.');
        return;
      }
      setSaving(true);
      setError(null);
      try {
        await saveProfile(profileFormToRow(form, user.id));
        setStep(2);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save. You can continue anyway.');
      } finally {
        setSaving(false);
      }
    },
    [user],
  );

  const saveAboutStep = useCallback(
    async (state: AboutState) => {
      if (!user) {
        setError('You are not signed in.');
        return;
      }
      setSaving(true);
      setError(null);
      try {
        await saveProfileExtras(user.id, {
          traits: state.traits,
          hobbies: state.hobbies,
          study_styles: state.studyStyles,
          about_me: state.notes.trim() || null,
        });
        setStep(3);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save. You can continue anyway.');
      } finally {
        setSaving(false);
      }
    },
    [user],
  );

  const profileInitial: ProfileFormState = {
    fullName: profile?.full_name ?? '',
    displayName: profile?.display_name ?? '',
    school: profile?.school ?? '',
    program: profile?.program ?? '',
    year: profile?.year ?? '',
    aboutMe: profile?.about_me ?? '',
  };
  const aboutInitial: AboutState = {
    traits: profile?.traits ?? [],
    hobbies: profile?.hobbies ?? [],
    studyStyles: profile?.study_styles ?? [],
    notes: '',
  };

  return (
    <div className="flex min-h-full flex-col bg-bg text-ink1">
      <header className="grid grid-cols-[200px_minmax(0,1fr)_200px] items-center gap-4 border-b border-line bg-surface px-4 py-4 md:px-10">
        <span className="flex items-center gap-2.5">
          <Logo size={28} />
          <span className="text-[16px] font-bold tracking-tight">Rocky setup</span>
        </span>
        <div className="mx-auto grid w-full max-w-[640px] grid-cols-5 gap-2" aria-label="Setup progress">
          {WIZARD_STEPS.map((label, i) => {
            const n = i + 1;
            const reached = n <= step;
            return (
              <span key={label} className="flex flex-col gap-2">
                <span
                  className="h-1 rounded-full"
                  style={{ background: reached ? 'var(--accent)' : 'var(--line)' }}
                  aria-hidden
                />
                <span
                  className="truncate text-xs font-semibold"
                  style={{ color: reached ? 'var(--ink1)' : 'var(--ink3)' }}
                  aria-current={n === step ? 'step' : undefined}
                >
                  {label}
                </span>
              </span>
            );
          })}
        </div>
        <span className="justify-self-end text-xs text-ink3">Step {step} of 5</span>
      </header>

      <main className="flex min-h-0 flex-1 justify-center overflow-y-auto px-4 py-10 md:px-10">
        {step === 1 && (
          <WizardProfileStep initial={profileInitial} onContinue={(f) => void saveProfileStep(f)} saving={saving} error={error} />
        )}
        {step === 2 && (
          <WizardAboutStep initial={aboutInitial} onContinue={(s) => void saveAboutStep(s)} saving={saving} error={error} />
        )}
        {step === 3 && <WizardClassesStep onContinue={() => setStep(4)} />}
        {step === 4 && <WizardBrainStep onContinue={() => setStep(5)} />}
        {step === 5 && (
          <div className="flex w-full max-w-6xl flex-col gap-6">
            <PairingFlow signedInEmail={user?.email ?? undefined} />
          </div>
        )}
      </main>

      <footer className="flex items-center justify-between gap-3 border-t border-line bg-surface px-4 py-4 md:px-10">
        <button
          type="button"
          onClick={() => void back()}
          className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-line px-5 text-sm font-bold"
        >
          <ArrowLeft size={15} aria-hidden />
          Back
        </button>
        <span className="hidden text-center text-xs text-ink3 sm:block">{FOOT_HINT[step - 1]}</span>
        {step < 5 ? (
          error ? (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep(step + 1);
              }}
              className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-line px-5 text-sm font-bold"
            >
              Continue anyway
              <ArrowRight size={15} aria-hidden />
            </button>
          ) : (
            <span className="w-[120px]" aria-hidden />
          )
        ) : (
          <span className="flex items-center gap-4">
            <button type="button" onClick={finish} className="text-sm font-semibold text-ink2 hover:text-ink1">
              Skip for now
            </button>
            <button
              type="button"
              onClick={finish}
              className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-accent px-5 text-sm font-bold text-white"
            >
              Go to dashboard
              <ArrowRight size={15} aria-hidden />
            </button>
          </span>
        )}
      </footer>
    </div>
  );
}
