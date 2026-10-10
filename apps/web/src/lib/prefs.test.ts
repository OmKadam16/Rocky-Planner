import { describe, expect, it } from 'vitest';
import { parseVoiceSpeed } from './prefs';

describe('parseVoiceSpeed (settings sheet segmented control)', () => {
  it('accepts 0.8 / 1 / 1.2 and falls back to 1×', () => {
    expect(parseVoiceSpeed('0.8')).toBe(0.8);
    expect(parseVoiceSpeed('1')).toBe(1);
    expect(parseVoiceSpeed('1.2')).toBe(1.2);
    expect(parseVoiceSpeed(null)).toBe(1);
    expect(parseVoiceSpeed('')).toBe(1);
    expect(parseVoiceSpeed('2')).toBe(1);
    expect(parseVoiceSpeed('fast')).toBe(1);
  });
});
