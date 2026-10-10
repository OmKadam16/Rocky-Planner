// Wizard step 2: how you like to work. Chips + free text, saved to the
// profiles row (traits / hobbies / study_styles / about_me).

import { useState } from 'react';
import {
  BookOpen,
  Coffee,
  CookingPot,
  Dumbbell,
  Gamepad2,
  Layers,
  Megaphone,
  Moon,
  Music,
  PenLine,
  Sun,
  Trophy,
  Users,
  VolumeX,
  type LucideIcon,
} from 'lucide-react';
import { HOBBY_CHIPS, STUDY_CHIPS, TRAIT_CHIPS, toggleChip } from '../../lib/wizard';
import { WizardContinue } from './StepProfile';

const CHIP_ICONS: Record<string, LucideIcon> = {
  'Morning person': Sun,
  'Night owl': Moon,
  'Needs short breaks': Coffee,
  'Likes quiet places': VolumeX,
  Reading: BookOpen,
  Music,
  Gaming: Gamepad2,
  Cooking: CookingPot,
  Soccer: Trophy,
  Gym: Dumbbell,
  'Practice problems': PenLine,
  Flashcards: Layers,
  'Study groups': Users,
  'Teach it back': Megaphone,
};

export interface AboutState {
  traits: string[];
  hobbies: string[];
  studyStyles: string[];
  notes: string;
}

function ChipGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: string[];
  selected: string[];
  onToggle: (chip: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-xs font-semibold text-ink2">{title}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((c) => {
          const on = selected.includes(c);
          const Icon = CHIP_ICONS[c] ?? PenLine;
          return (
            <button
              key={c}
              type="button"
              onClick={() => onToggle(c)}
              aria-pressed={on}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium"
              style={{
                borderColor: on ? 'var(--accent)' : 'var(--line)',
                background: on ? 'var(--accent-soft)' : 'transparent',
                color: on ? 'var(--accent-ink)' : 'var(--ink1)',
              }}
            >
              <Icon size={14} aria-hidden />
              {c}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function WizardAboutStep({
  initial,
  onContinue,
  saving,
  error,
}: {
  initial: AboutState;
  onContinue: (state: AboutState) => void;
  saving: boolean;
  error: string | null;
}) {
  const [state, setState] = useState(initial);
  const toggle =
    (key: 'traits' | 'hobbies' | 'studyStyles') =>
    (chip: string): void =>
      setState((s) => ({ ...s, [key]: toggleChip(s[key], chip) }));

  return (
    <div className="flex w-full max-w-[760px] flex-col gap-6">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight">How do you like to work?</h1>
        <p className="mt-2 max-w-[640px] text-[16px] leading-relaxed text-ink2">
          Rocky plans around you. Morning people get study blocks early; if you
          need breaks, it leaves room for them.
        </p>
      </div>
      <ChipGroup title="Traits" options={TRAIT_CHIPS} selected={state.traits} onToggle={toggle('traits')} />
      <ChipGroup title="Hobbies" options={HOBBY_CHIPS} selected={state.hobbies} onToggle={toggle('hobbies')} />
      <ChipGroup title="Study style" options={STUDY_CHIPS} selected={state.studyStyles} onToggle={toggle('studyStyles')} />
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-ink2">Anything else worth knowing?</span>
        <textarea
          value={state.notes}
          onChange={(e) => setState((s) => ({ ...s, notes: e.target.value }))}
          rows={3}
          placeholder="Work hours, subjects you like, anything Rocky should plan around."
          className="resize-none rounded-xl border border-line bg-surface2 px-3.5 py-3 text-[15px] leading-relaxed text-ink1 outline-none placeholder:text-ink4 focus:border-accent"
        />
      </label>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <WizardContinue saving={saving} onContinue={() => onContinue(state)} />
    </div>
  );
}
