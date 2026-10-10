import { describe, expect, it, vi } from 'vitest';
import { subscribeChannel, uniqueChannelName } from './realtime';

describe('uniqueChannelName', () => {
  it('builds distinct names per subscription', () => {
    const a = uniqueChannelName('remote-calendar', 1, 'abc123');
    const b = uniqueChannelName('remote-calendar', 2, 'def456');
    expect(a).toBe('remote-calendar-1-abc123');
    expect(b).toBe('remote-calendar-2-def456');
    expect(a).not.toBe(b);
  });
});

describe('subscribeChannel (the /dashboard blank-screen crash)', () => {
  function fakeClient() {
    const subscribed = new Set<string>();
    const removed: string[] = [];
    const sb = {
      channel: vi.fn((name: string) => {
        // Mirrors supabase-js: .on() on an already-subscribed name throws,
        // which is what blanked /dashboard and /settings/voice.
        if (subscribed.has(name)) {
          throw new Error(`tried to subscribe ${name} twice`);
        }
        const handlers: Array<() => void> = [];
        return {
          name,
          on: vi.fn(() => {
            handlers.push(() => {});
            return { on: vi.fn(), subscribe: vi.fn() };
          }),
          subscribe: vi.fn(() => {
            subscribed.add(name);
            return { name };
          }),
        };
      }),
      removeChannel: vi.fn((ch: { name: string }) => {
        removed.push(ch.name);
      }),
    };
    return { sb, removed };
  }

  it('never reuses a name, even for the same base on one screen', () => {
    const { sb } = fakeClient();
    const names = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const ch = subscribeChannel(sb as never, 'remote-calendar', (c) =>
        (c as { on: (e: string, o: object, cb: () => void) => void }).on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'events' },
          () => {},
        ),
      );
      names.add((ch as unknown as { name: string }).name);
    }
    expect(names.size).toBe(5);
  });

  it('fixed names reproduce the crash (why the helper exists)', () => {
    const { sb } = fakeClient();
    const first = sb.channel('remote-calendar');
    first.subscribe();
    expect(() => sb.channel('remote-calendar')).toThrow(/twice/);
  });

  it('removes the channel on cleanup', () => {
    const { sb, removed } = fakeClient();
    const ch = subscribeChannel(sb as never, 'pair-claim', () => {});
    (sb.removeChannel as ReturnType<typeof vi.fn>)(ch);
    expect(removed).toHaveLength(1);
    expect(removed[0]).toContain('pair-claim-');
  });
});
