import { beforeEach, describe, expect, it } from 'vitest';
import {
  CLASS_DAYS,
  HOBBY_CHIPS,
  STUDY_CHIPS,
  TRAIT_CHIPS,
  WIZARD_STEPS,
  YEAR_OPTIONS,
  isWizardDone,
  markWizardDone,
  minToTimeInput,
  timeInputToMin,
  toggleChip,
} from './wizard';

beforeEach(() => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
    },
    configurable: true,
    writable: true,
  });
});

describe('wizard static lists', () => {
  it('has five steps in design order', () => {
    expect([...WIZARD_STEPS]).toEqual(['Profile', 'About you', 'Classes', 'Brain', 'Phone']);
  });

  it('offers years, days, and chips — with no Pomodoro anywhere', () => {
    expect(YEAR_OPTIONS).toContain('2nd year');
    expect(CLASS_DAYS).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    const allChips = [...TRAIT_CHIPS, ...HOBBY_CHIPS, ...STUDY_CHIPS];
    expect(allChips.length).toBeGreaterThan(0);
    for (const chip of allChips) {
      expect(chip.toLowerCase()).not.toContain('pomodoro');
    }
  });
});

describe('toggleChip', () => {
  it('adds missing chips and removes present ones', () => {
    expect(toggleChip([], 'Gym')).toEqual(['Gym']);
    expect(toggleChip(['Gym'], 'Gym')).toEqual([]);
    expect(toggleChip(['Gym'], 'Soccer')).toEqual(['Gym', 'Soccer']);
  });
});

describe('time inputs (class schedule)', () => {
  it('converts HH:MM both ways and rejects junk', () => {
    expect(timeInputToMin('09:30')).toBe(570);
    expect(timeInputToMin('9:30')).toBe(570);
    expect(timeInputToMin('')).toBeNull();
    expect(timeInputToMin('24:00')).toBeNull();
    expect(timeInputToMin('9:99')).toBeNull();
    expect(minToTimeInput(570)).toBe('09:30');
  });
});

describe('wizard completion flag (per account, local only)', () => {
  it('round-trips without touching anyone else', () => {
    expect(isWizardDone('u1')).toBe(false);
    markWizardDone('u1');
    expect(isWizardDone('u1')).toBe(true);
    expect(isWizardDone('u2')).toBe(false);
  });
});
