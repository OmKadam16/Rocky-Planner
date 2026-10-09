import { describe, expect, it } from 'vitest';
import { mockResultFor, nextMockScript } from './mockTalk';

describe('mock talk scripts (dev-only UI driver)', () => {
  it('alternates result and clarify so every state is demonstrable', () => {
    const a = nextMockScript();
    const b = nextMockScript();
    expect(new Set([a.kind, b.kind])).toEqual(new Set(['result', 'clarify']));
    expect(a.transcript.length).toBeGreaterThan(0);
  });

  it('builds a result with diff rows and plausible latencies', () => {
    const r = mockResultFor('Move gym to 7 pm');
    expect(r.transcript).toBe('Move gym to 7 pm');
    expect(r.moved.length).toBeGreaterThan(0);
    expect(r.sttMs).toBeGreaterThan(0);
    expect(r.llmMs).toBeGreaterThan(0);
    expect(r.totalMs).toBeGreaterThan(r.sttMs + r.llmMs);
  });
});
