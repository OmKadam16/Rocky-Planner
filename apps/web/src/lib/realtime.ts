import type { SupabaseClient } from '@supabase/supabase-js';

let channelSeq = 0;

/**
 * Unique Realtime channel per subscription.
 *
 * supabase-js throws when `.on()` is called on a channel name that is
 * already subscribed elsewhere on the page (e.g. two components mounting
 * `devices` listeners on /dashboard renders it blank). Every caller must go
 * through this helper so names never collide, and must `removeChannel` the
 * returned channel on cleanup.
 *
 * Usage:
 *   const channel = subscribeChannel(sb, 'devices', (ch) =>
 *     ch.on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, refresh),
 *   );
 *   return () => { void sb.removeChannel(channel); };
 */
export function subscribeChannel(
  sb: SupabaseClient,
  base: string,
  attach: (channel: ReturnType<SupabaseClient['channel']>) => void,
): ReturnType<SupabaseClient['channel']> {
  channelSeq += 1;
  const channel = sb.channel(`${base}-${channelSeq}-${Math.random().toString(36).slice(2, 8)}`);
  attach(channel);
  channel.subscribe();
  return channel;
}

/** Deterministic name builder (tested): base + per-subscription suffix. */
export function uniqueChannelName(base: string, seq: number, rand: string): string {
  return `${base}-${seq}-${rand}`;
}
