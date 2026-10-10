import { describe, expect, it } from 'vitest';
import {
  CHIP_GROUPS,
  EMPTY_CLASS,
  canSkipStep,
  chipsToProfile,
  hhmmToMin,
  minToHhmm,
  nextLabel,
  postLoginTarget,
  stepHint,
  validateClassForm,
  wizardStep,
} from './onboarding';

describe('wizard navigation (design: Back/Continue/Skip)', () => {
  it('allows Skip only on step 2 (About you) and step 5 (Phone)', () => {
    expect(canSkipStep(1)).toBe(false);
    expect(canSkipStep(2)).toBe(true);
    expect(canSkipStep(3)).toBe(false);
    expect(canSkipStep(4)).toBe(false);
    expect(canSkipStep(5)).toBe(true);
  });

  it('labels the step-5 action Go to dashboard', () => {
    expect(nextLabel(1)).toBe('Continue');
    expect(nextLabel(5)).toBe('Go to dashboard');
  });

  it('shows the design hint text per step', () => {
    expect(stepHint(4)).toBe('Runs fully offline once set up');
    expect(stepHint(5)).toBe('You can pair a phone later in Settings → Devices');
    expect(stepHint(1)).toBe('');
    expect(stepHint(3)).toBe('');
  });

  it('moves through steps with skip rules enforced', () => {
    expect(wizardStep(1, 'next')).toBe(2);
    expect(wizardStep(2, 'skip')).toBe(3);
    expect(wizardStep(3, 'skip')).toBe(3); // not allowed: stays
    expect(wizardStep(5, 'skip')).toBe(5); // stays: finishing handled by save
    expect(wizardStep(2, 'back')).toBe(1);
    expect(wizardStep(1, 'back')).toBe(1);
  });
});

describe('postLoginTarget (onboarding gate)', () => {
  it('sends unfinished users to /setup', () => {
    expect(postLoginTarget(false, '/dashboard')).toBe('/setup');
    expect(postLoginTarget(false, '/calendar')).toBe('/setup');
  });

  it('sends finished users to their target or /dashboard', () => {
    expect(postLoginTarget(true, '/dashboard')).toBe('/dashboard');
    expect(postLoginTarget(true, '/calendar')).toBe('/calendar');
    expect(postLoginTarget(true, '')).toBe('/dashboard');
    expect(postLoginTarget(true, 'https://evil.com/')).toBe('/dashboard');
  });

  it('never gates the phone flow', () => {
    expect(postLoginTarget(false, '/remote')).toBe('/remote');
    expect(postLoginTarget(false, '/remote?pair=K7P2QM')).toBe('/remote?pair=K7P2QM');
    expect(postLoginTarget(true, '/remote?pair=K7P2QM')).toBe('/remote?pair=K7P2QM');
  });
});

describe('chip groups (no Pomodoro anywhere)', () => {
  it('has Traits / Hobbies / Study style without Pomodoro', () => {
    expect(CHIP_GROUPS.map((g) => g.title)).toEqual(['Traits', 'Hobbies', 'Study style']);
    const all = CHIP_GROUPS.flatMap((g) => g.items);
    expect(all).not.toContain('Pomodoro');
    expect(all).toContain('Morning person');
    expect(all).toContain('Practice problems');
  });

  it('sorts selected chips into profile columns', () => {
    expect(chipsToProfile(['Morning person', 'Gym', 'Flashcards', 'Unknown chip'])).toEqual({
      traits: ['Morning person'],
      hobbies: ['Gym'],
      study_styles: ['Flashcards'],
    });
  });
});

describe('class form validation', () => {
  const valid = {
    ...EMPTY_CLASS,
    name: 'Biology Lecture',
    meetingDays: [1, 3, 5],
    startHhmm: '09:00',
    endHhmm: '09:50',
    startsOn: '2026-08-24',
    endsOn: '2026-12-18',
  };

  it('accepts a complete row', () => {
    expect(validateClassForm(valid)).toBeNull();
  });

  it('rejects missing pieces with a message', () => {
    expect(validateClassForm({ ...valid, name: '' })).toBe('Give the class a name.');
    expect(validateClassForm({ ...valid, meetingDays: [] })).toBe('Pick at least one meeting day.');
    expect(validateClassForm({ ...valid, startHhmm: '10:00', endHhmm: '09:00' })).toBe(
      'The end time must be after the start.',
    );
    expect(validateClassForm({ ...valid, startsOn: '' })).toBe('Pick the semester start and end dates.');
    expect(validateClassForm({ ...valid, startsOn: '2026-12-18', endsOn: '2026-08-24' })).toBe(
      'The end date must be after the start date.',
    );
  });

  it('converts HH:MM both ways', () => {
    expect(hhmmToMin('09:50')).toBe(590);
    expect(hhmmToMin('9:5')).toBeNull();
    expect(hhmmToMin('25:00')).toBeNull();
    expect(minToHhmm(590)).toBe('09:50');
  });
});
