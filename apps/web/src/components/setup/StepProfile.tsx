import { useState } from 'react';
import { saveProfile } from '../../lib/setupApi';
import type { StepApi } from '../../pages/SetupPage';

const YEARS = ['', '1st year', '2nd year', '3rd year', '4th year', 'Graduate', 'Other'];

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * Wizard step 1 — Profile. Full name, display name, school, program, year.
 * "Used for greetings and to label your classes."
 */
export function StepProfile({
  apiRef,
  initial,
}: {
  apiRef: (api: StepApi | null) => void;
  initial: Record<string, unknown> | null;
}) {
  const [fullName, setFullName] = useState(() => str(initial?.full_name));
  const [displayName, setDisplayName] = useState(() => str(initial?.display_name));
  const [school, setSchool] = useState(() => str(initial?.school));
  const [program, setProgram] = useState(() => str(initial?.program));
  const [year, setYear] = useState(() => str(initial?.year));

  apiRef({
    save: async () => {
      try {
        await saveProfile({
          full_name: fullName.trim() || null,
          display_name: displayName.trim() || null,
          school: school.trim() || null,
          program: program.trim() || null,
          year: year || null,
        });
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : 'Could not save your profile.';
      }
    },
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 md:px-8">
      <h1 className="text-[28px] font-bold tracking-tight">Tell Rocky who you are</h1>
      <p className="mt-2 text-[16px] text-ink2">Used for greetings and to label your classes.</p>
      <div className="mt-7 grid grid-cols-1 gap-[18px] sm:grid-cols-2">
        <Field label="Full name">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
            placeholder="Alex Rivera"
            className="h-11 rounded-xl border border-line bg-surface2 px-3.5 text-sm text-ink1 outline-none placeholder:text-ink4 focus:border-accent"
          />
        </Field>
        <Field label="Display name">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="nickname"
            placeholder="Alex"
            className="h-11 rounded-xl border border-line bg-surface2 px-3.5 text-sm text-ink1 outline-none placeholder:text-ink4 focus:border-accent"
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="School">
            <input
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              autoComplete="organization"
              placeholder="Cypress College"
              className="h-11 w-full rounded-xl border border-line bg-surface2 px-3.5 text-sm text-ink1 outline-none placeholder:text-ink4 focus:border-accent"
            />
          </Field>
        </div>
        <Field label="Program">
          <input
            value={program}
            onChange={(e) => setProgram(e.target.value)}
            placeholder="Biological Sciences"
            className="h-11 rounded-xl border border-line bg-surface2 px-3.5 text-sm text-ink1 outline-none placeholder:text-ink4 focus:border-accent"
          />
        </Field>
        <Field label="Year">
          <select
            value={YEARS.includes(year) ? year : ''}
            onChange={(e) => setYear(e.target.value)}
            className="h-11 appearance-none rounded-xl border border-line bg-surface2 px-3.5 text-sm text-ink1 outline-none focus:border-accent"
          >
            <option value="">Select year</option>
            {YEARS.filter(Boolean).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-ink2">{label}</span>
      {children}
    </label>
  );
}
