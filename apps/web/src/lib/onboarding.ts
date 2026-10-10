// Onboarding (/setup wizard) data + rules. Pure navigation/validation is
// tested in onboarding.test.ts; Supabase writes use RLS (user_id = auth.uid()).

export const WIZARD_STEPS = ['Profile', 'About you', 'Classes', 'Brain', 'Phone'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

/** Skip is allowed only on step 2 (About you) and step 5 (Phone). */
export function canSkipStep(step: number): boolean {
  return step === 2 || step === 5;
}

export function nextLabel(step: number): string {
  return step === 5 ? 'Go to dashboard' : 'Continue';
}

export function stepHint(step: number): string {
  if (step === 5) return 'You can pair a phone later in Settings → Devices';
  if (step === 4) return 'Runs fully offline once set up';
  return '';
}

/** Pure step transition for tests: 'next' | 'back' | 'skip'. */
export function wizardStep(step: number, action: 'next' | 'back' | 'skip'): number {
  if (action === 'back') return Math.max(1, step - 1);
  if (action === 'skip') return canSkipStep(step) ? Math.min(5, step + 1) : step;
  return Math.min(5, step + 1);
}

// ---------------------------------------------------------------------------
// Post-login routing.
// The laptop flow gates on onboarding; the phone (/remote) never does.
// ---------------------------------------------------------------------------

/** Where to send the user right after sign-in. */
export function postLoginTarget(onboarded: boolean, requestedNext: string): string {
  if (requestedNext.startsWith('/remote')) return requestedNext;
  if (!onboarded) return '/setup';
  return requestedNext && requestedNext.startsWith('/') && !requestedNext.startsWith('//')
    ? requestedNext
    : '/dashboard';
}

// ---------------------------------------------------------------------------
// Step 2 chip groups (design items minus Pomodoro — there is no such feature).
// ---------------------------------------------------------------------------

export interface ChipGroup {
  title: 'Traits' | 'Hobbies' | 'Study style';
  items: string[];
}

export const CHIP_GROUPS: ChipGroup[] = [
  {
    title: 'Traits',
    items: ['Morning person', 'Night owl', 'Needs short breaks', 'Easily distracted', 'Likes a set routine', 'Works best under pressure'],
  },
  {
    title: 'Hobbies',
    items: ['Gym', 'Soccer', 'Gaming', 'Cooking', 'Music', 'Reading', 'Hiking'],
  },
  {
    title: 'Study style',
    items: ['Long deep blocks', 'Study with friends', 'Flashcards', 'Practice problems', 'Quiet library'],
  },
];

export function chipsToProfile(selected: string[]): { traits: string[]; hobbies: string[]; study_styles: string[] } {
  const inGroup = (title: ChipGroup['title']) =>
    CHIP_GROUPS.find((g) => g.title === title)?.items ?? [];
  const pick = (title: ChipGroup['title']) => selected.filter((s) => inGroup(title).includes(s));
  return { traits: pick('Traits'), hobbies: pick('Hobbies'), study_styles: pick('Study style') };
}

// ---------------------------------------------------------------------------
// Step 3 class form.
// ---------------------------------------------------------------------------

export interface ClassForm {
  name: string;
  code: string;
  professor: string;
  /** 0 = Sunday. Design day buttons are MTWTFSS (Mon-first display). */
  meetingDays: number[];
  startHhmm: string;
  endHhmm: string;
  startsOn: string;
  endsOn: string;
}

export const EMPTY_CLASS: ClassForm = {
  name: '',
  code: '',
  professor: '',
  meetingDays: [],
  startHhmm: '09:00',
  endHhmm: '09:50',
  startsOn: '',
  endsOn: '',
};

export function hhmmToMin(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function minToHhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** Validate a class row; returns the error to show, or null when valid. */
export function validateClassForm(c: ClassForm): string | null {
  if (!c.name.trim()) return 'Give the class a name.';
  if (c.meetingDays.length === 0) return 'Pick at least one meeting day.';
  const start = hhmmToMin(c.startHhmm);
  const end = hhmmToMin(c.endHhmm);
  if (start == null || end == null) return 'Use HH:MM times like 09:00.';
  if (end <= start) return 'The end time must be after the start.';
  if (!c.startsOn || !c.endsOn) return 'Pick the semester start and end dates.';
  if (c.endsOn < c.startsOn) return 'The end date must be after the start date.';
  return null;
}

// ---------------------------------------------------------------------------
// Step 4 brain checklist.
// ---------------------------------------------------------------------------

export type BrainCheckState = 'checking' | 'ready' | 'action' | 'failed';

export interface BrainChecks {
  app: BrainCheckState;
  model: BrainCheckState;
  stt: BrainCheckState;
  mic: BrainCheckState;
}

/** Real microphone permission probe (tracks stopped immediately). */
export async function checkMicrophone(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}
