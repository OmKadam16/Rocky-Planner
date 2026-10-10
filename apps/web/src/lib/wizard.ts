// First-run wizard helpers (pure parts tested in wizard.test.ts).
// Steps: Profile → About you → Classes → Brain → Phone. Chips are plain
// preference tags — there is no Pomodoro feature (PLAN.md correction 4).

export const WIZARD_STEPS = ['Profile', 'About you', 'Classes', 'Brain', 'Phone'] as const;

export const YEAR_OPTIONS = ['1st year', '2nd year', '3rd year', '4th year', 'Graduate', 'Other'];

export const TRAIT_CHIPS = ['Morning person', 'Night owl', 'Needs short breaks', 'Likes quiet places'];

export const HOBBY_CHIPS = ['Reading', 'Music', 'Gaming', 'Cooking', 'Soccer', 'Gym'];

export const STUDY_CHIPS = ['Practice problems', 'Flashcards', 'Study groups', 'Teach it back'];

export const CLASS_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Toggle a chip in a string list (add when missing, remove when present). */
export function toggleChip(list: string[], chip: string): string[] {
  return list.includes(chip) ? list.filter((c) => c !== chip) : [...list, chip];
}

/** "HH:MM" (24h) ↔ minutes since midnight for time inputs. */
export function timeInputToMin(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function minToTimeInput(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

function wizardKey(userId: string): string {
  return `rocky.wizardDone.${userId}`;
}

export function isWizardDone(userId: string): boolean {
  try {
    return localStorage.getItem(wizardKey(userId)) === '1';
  } catch {
    return false;
  }
}

export function markWizardDone(userId: string): void {
  try {
    localStorage.setItem(wizardKey(userId), '1');
  } catch {
    /* ignore */
  }
}
