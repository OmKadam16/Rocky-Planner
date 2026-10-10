import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { CHIP_GROUPS, chipsToProfile } from '../../lib/onboarding';
import { saveProfile } from '../../lib/setupApi';
import type { StepApi } from '../../pages/SetupPage';

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/**
 * Wizard step 2 — About you. Traits / Hobbies / Study style chips
 * (no Pomodoro anywhere) plus free-text notes.
 */
export function StepAbout({
  apiRef,
  initial,
}: {
  apiRef: (api: StepApi | null) => void;
  initial: Record<string, unknown> | null;
}) {
  const [selected, setSelected] = useState<string[]>(() => [
    ...strList(initial?.traits),
    ...strList(initial?.hobbies),
    ...strList(initial?.study_styles),
  ]);
  const [notes, setNotes] = useState(() =>
    typeof initial?.about_me === 'string' ? initial.about_me : '',
  );

  apiRef({
    save: async () => {
      try {
        const { traits, hobbies, study_styles } = chipsToProfile(selected);
        await saveProfile({ traits, hobbies, study_styles, about_me: notes.trim() || null });
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : 'Could not save.';
      }
    },
  });

  function toggle(label: string) {
    setSelected((s) => (s.includes(label) ? s.filter((x) => x !== label) : [...s, label]));
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 md:px-8">
      <h1 className="text-[28px] font-bold tracking-tight">How do you like to work?</h1>
      <p className="mt-2 max-w-[560px] text-[16px] leading-relaxed text-ink2">
        Rocky plans around you. Morning people get study blocks early; if you need
        breaks, it leaves room for them.
      </p>
      <div className="mt-7 flex flex-col gap-6">
        {CHIP_GROUPS.map((g) => (
          <div key={g.title} className="flex flex-col gap-2.5">
            <span className="text-xs font-semibold text-ink2">{g.title}</span>
            <div className="flex flex-wrap gap-2">
              {g.items.map((label) => {
                const on = selected.includes(label);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggle(label)}
                    aria-pressed={on}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium"
                    style={{
                      borderColor: on ? 'var(--accent)' : 'var(--line)',
                      background: on ? 'var(--accent-soft)' : 'var(--surface2)',
                      color: on ? 'var(--accent-ink)' : 'var(--ink2)',
                    }}
                  >
                    {on ? <Check size={14} aria-hidden /> : <Plus size={14} aria-hidden />}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-ink2">Anything else worth knowing?</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="I work afternoons and focus best before noon."
            className="rounded-xl border border-line bg-surface2 p-3.5 text-sm text-ink1 outline-none placeholder:text-ink4 focus:border-accent"
          />
        </label>
      </div>
    </div>
  );
}
