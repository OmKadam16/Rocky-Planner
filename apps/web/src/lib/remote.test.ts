import { beforeEach, describe, expect, it } from 'vitest';
import {
  enqueueCommand,
  clearQueue,
  formatRange,
  readQueue,
  statusFromLastSeen,
  weekStartOf,
} from './remote';

// Node has no localStorage: back it with a Map so queue persistence is tested.
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

describe('weekStartOf (Sunday-first weeks)', () => {
  it('returns the Sunday of the containing week', () => {
    expect(weekStartOf('2026-10-11')).toBe('2026-10-11'); // Sunday
    expect(weekStartOf('2026-10-12')).toBe('2026-10-11'); // Monday
    expect(weekStartOf('2026-10-17')).toBe('2026-10-11'); // Saturday
    expect(weekStartOf('2026-10-18')).toBe('2026-10-18'); // next Sunday
  });
});

describe('statusFromLastSeen (offline only from last_seen)', () => {
  it('maps freshness to connecting/online/offline', () => {
    const now = 1_000_000;
    expect(statusFromLastSeen(null, now)).toBe('connecting');
    expect(statusFromLastSeen(now, now)).toBe('online');
    expect(statusFromLastSeen(now - 30_000, now)).toBe('online');
    expect(statusFromLastSeen(now - 45_000, now)).toBe('online'); // boundary: strictly older
    expect(statusFromLastSeen(now - 45_001, now)).toBe('offline');
    expect(statusFromLastSeen(now - 300_000, now)).toBe('offline');
  });
});

describe('formatRange', () => {
  it('formats occurrence ranges like the design', () => {
    expect(formatRange(540, 630)).toBe('9:00 – 10:30 AM');
    expect(formatRange(1140, 1170)).toBe('7:00 – 7:30 PM');
    expect(formatRange(690, 810)).toBe('11:30 – 1:30 PM');
  });
});

describe('voice queue (offline outbox)', () => {
  it('persists, appends and caps at 5', () => {
    clearQueue();
    expect(readQueue()).toEqual([]);
    const list = enqueueCommand('first');
    expect(list).toHaveLength(1);
    expect(list[0]!.text).toBe('first');
    expect(readQueue()).toHaveLength(1);
    let capped = list;
    for (let i = 0; i < 6; i++) capped = enqueueCommand(`cmd ${i}`);
    expect(capped).toHaveLength(5);
    expect(capped[4]!.text).toBe('cmd 5');
    expect(readQueue()).toHaveLength(5);
    clearQueue();
    expect(readQueue()).toEqual([]);
  });
});
