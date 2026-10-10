// Wizard step 1: profile. Saves to the profiles table on Continue.

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { YEAR_OPTIONS } from '../../lib/wizard';
import type { ProfileFormState } from '../../lib/profile';

export function WizardProfileStep({
  initial,
  onContinue,
  saving,
  error,
}: {
  initial: ProfileFormState;
  onContinue: (form: ProfileFormState) => void;
  saving: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState(initial);
  const set =
    (key: keyof ProfileFormState) =>
    (v: string): void =>
      setForm((f) => ({ ...f, [key]: v }));

  return (
    <div className="flex w-full max-w-[640px] flex-col gap-7">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight">Tell Rocky who you are</h1>
        <p className="mt-2 text-[16px] text-ink2">Used for greetings and to label your classes.</p>
      </div>
      <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-ink2">Full name</span>
          <input
            value={form.fullName}
            onChange={(e) => set('fullName')(e.target.value)}
            autoComplete="name"
            className="h-11 rounded-xl border border-line bg-surface2 px-3.5 text-[15px] text-ink1 outline-none placeholder:text-ink4 focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-ink2">Display name</span>
          <input
            value={form.displayName}
            onChange={(e) => set('displayName')(e.target.value)}
            autoComplete="nickname"
            className="h-11 rounded-xl border border-line bg-surface2 px-3.5 text-[15px] text-ink1 outline-none placeholder:text-ink4 focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-xs font-semibold text-ink2">School</span>
          <input
            value={form.school}
            onChange={(e) => set('school')(e.target.value)}
            className="h-11 rounded-xl border border-line bg-surface2 px-3.5 text-[15px] text-ink1 outline-none placeholder:text-ink4 focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-ink2">Program</span>
          <input
            value={form.program}
            onChange={(e) => set('program')(e.target.value)}
            className="h-11 rounded-xl border border-line bg-surface2 px-3.5 text-[15px] text-ink1 outline-none placeholder:text-ink4 focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-ink2">Year</span>
          <span className="relative block">
            <select
              value={form.year}
              onChange={(e) => set('year')(e.target.value)}
              className="h-11 w-full appearance-none rounded-xl border border-line bg-surface2 px-3.5 pr-10 text-[15px] text-ink1 outline-none focus:border-accent"
            >
              <option value="">Select…</option>
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <ChevronDown size={16} aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink3" />
          </span>
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <WizardContinue saving={saving} onContinue={() => onContinue(form)} />
    </div>
  );
}

export function WizardContinue({
  saving,
  onContinue,
  label = 'Continue',
}: {
  saving: boolean;
  onContinue: () => void;
  label?: string;
}) {
  return (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={onContinue}
        disabled={saving}
        className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-accent px-6 text-sm font-bold text-white disabled:opacity-50"
      >
        {saving ? 'Saving…' : label} →
      </button>
    </div>
  );
}
