import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEVICE_OFFLINE_AFTER_MS,
  addDays,
  expandEvents,
  localNow,
  weekdayOf,
  type EventException,
  type EventRow,
  type Occurrence,
} from '@rocky/core';
import {
  getSupabase,
  isSupabaseConfigured,
  readLaptopLastSeen,
} from './supabase';
import { subscribeChannel } from './realtime';

// ---------------------------------------------------------------------------
// Dates (local time zone; core does the DST-correct math).
// ---------------------------------------------------------------------------

export function todayLocal(now: Date = new Date()): string {
  try {
    return localNow(now, Intl.DateTimeFormat().resolvedOptions().timeZone).date;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function nowMinutesLocal(now: Date = new Date()): number {
  try {
    return localNow(now, Intl.DateTimeFormat().resolvedOptions().timeZone).minute;
  } catch {
    return now.getHours() * 60 + now.getMinutes();
  }
}

/** Sunday-first week containing `date`. */
export function weekStartOf(date: string): string {
  return addDays(date, -weekdayOf(date));
}

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** "7:00 – 8:30 PM" style range for an occurrence. */
export function formatRange(startMin: number, endMin: number): string {
  const fmt = (m: number) => {
    const h24 = Math.floor(m / 60);
    const mm = m % 60;
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return mm === 0 ? `${h12}:00` : `${h12}:${String(mm).padStart(2, '0')}`;
  };
  const endSuffix = endMin < 12 * 60 ? ' AM' : ' PM';
  return `${fmt(startMin)} – ${fmt(endMin)}${endSuffix}`;
}

export function minutesToHHmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Laptop presence — the ONLY source of the online/offline chip.
// ---------------------------------------------------------------------------

export type PresenceStatus = 'connecting' | 'online' | 'offline';

export function statusFromLastSeen(lastSeenMs: number | null, now: number = Date.now()): PresenceStatus {
  if (lastSeenMs == null) return 'connecting';
  return now - lastSeenMs > DEVICE_OFFLINE_AFTER_MS ? 'offline' : 'online';
}

export interface LaptopPresenceState {
  status: PresenceStatus;
  laptopName: string;
  lastSeenMs: number | null;
}

/** Polls + subscribes to the laptop row; offline <=> last_seen older than 45 s. */
export function useLaptopPresence(enabled: boolean): LaptopPresenceState {
  const [state, setState] = useState<LaptopPresenceState>({
    status: 'connecting',
    laptopName: 'your laptop',
    lastSeenMs: null,
  });

  useEffect(() => {
    if (!enabled || !isSupabaseConfigured()) return;
    let alive = true;
    const sb = getSupabase();
    if (!sb) return;

    const refresh = async () => {
      const presence = await readLaptopLastSeen();
      if (!alive) return;
      if (!presence) {
        // No laptop row yet (fresh account): stay "connecting" (amber),
        // never claim offline without a last_seen to judge.
        setState((s) => ({ ...s, status: 'connecting' }));
        return;
      }
      setState({
        status: statusFromLastSeen(presence.lastSeenMs),
        laptopName: presence.laptopName,
        lastSeenMs: presence.lastSeenMs,
      });
    };

    void refresh();
    const tick = window.setInterval(refresh, 5000);
    const channel = subscribeChannel(sb, 'remote-laptop-presence', (ch) =>
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, () =>
        void refresh(),
      ),
    );
    return () => {
      alive = false;
      window.clearInterval(tick);
      void sb.removeChannel(channel);
    };
  }, [enabled]);

  return state;
}

// ---------------------------------------------------------------------------
// Calendar reads (web-owned wiring over core types + expandEvents).
// Agent A may move this into packages/core/api later; the row shapes stay.
// ---------------------------------------------------------------------------

export interface CalendarSlice {
  occurrences: Occurrence[];
  byDate: Map<string, Occurrence[]>;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

async function fetchRows(
  from: string,
  to: string,
): Promise<{ events: EventRow[]; exceptions: EventException[] }> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured.');
  // Series start on/before `to`; one-offs before `from` are dropped client-side.
  const { data: events, error: eventsError } = await sb
    .from('events')
    .select('*')
    .lte('event_date', to)
    .order('event_date', { ascending: true });
  if (eventsError) throw new Error(eventsError.message);
  // Exceptions that could touch the window (moves may come from outside it).
  const { data: exceptions, error: exError } = await sb
    .from('event_exceptions')
    .select('*')
    .gte('occurrence_date', addDays(from, -370))
    .lte('occurrence_date', addDays(to, 370));
  if (exError) throw new Error(exError.message);
  const rows = (events ?? []) as EventRow[];
  return {
    events: rows.filter((e) => e.repeat_freq !== 'none' || e.event_date >= from),
    exceptions: (exceptions ?? []) as EventException[],
  };
}

/**
 * Occurrences for [from, to] via core expandEvents, kept live with Realtime
 * on events + event_exceptions. DELETEs carry only the key under RLS, so
 * every change (including deletes) triggers a refetch.
 */
export function useOccurrences(from: string, to: string, enabled: boolean): CalendarSlice {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [exceptions, setExceptions] = useState<EventException[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const rangeKey = `${from}:${to}`;

  useEffect(() => {
    if (!enabled || !isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    const sb = getSupabase();
    if (!sb) {
      setLoading(false);
      return;
    }
    fetchRows(from, to)
      .then(({ events: ev, exceptions: ex }) => {
        if (!alive) return;
        setEvents(ev);
        setExceptions(ex);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'Could not load events.');
        setLoading(false);
      });
    const channel = subscribeChannel(sb, 'remote-calendar', (ch) =>
      ch
        .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () =>
          setNonce((n) => n + 1),
        )
        .on('postgres_changes', { event: '*', schema: 'public', table: 'event_exceptions' }, () =>
          setNonce((n) => n + 1),
        ),
    );
    return () => {
      alive = false;
      void sb.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, rangeKey, nonce]);

  const occurrences = expandEvents(events, exceptions, from, to);
  const byDate = new Map<string, Occurrence[]>();
  for (const o of occurrences) {
    const list = byDate.get(o.date) ?? [];
    list.push(o);
    byDate.set(o.date, list);
  }
  const refetch = useCallback(() => setNonce((n) => n + 1), []);
  return { occurrences, byDate, loading, error, refetch };
}

// ---------------------------------------------------------------------------
// DEV-ONLY sample seed. Gated on import.meta.env.DEV + explicit flag; never
// set the flag in render.yaml. Until the brain writes events, this gives the
// phone timeline something real to render (rows belong to the signed-in user
// via RLS defaults — no user_id is sent from the client).
// ---------------------------------------------------------------------------

export function isSeedEnabled(): boolean {
  try {
    return import.meta.env.DEV === true && import.meta.env.VITE_ROCKY_DEV_SEED === '1';
  } catch {
    return false;
  }
}

type SeedRow = Omit<EventRow, 'id' | 'user_id' | 'created_at'>;

export async function insertSampleEvents(): Promise<{ inserted: number }> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured.');
  const today = todayLocal();
  const wd = weekdayOf(today);
  // Next Mon/Wed/Fri strictly after today for the recurring lecture.
  const days: number[] = [1, 3, 5].map((d) => (d - wd + 7) % 7 || 7);
  const firstLecture = addDays(today, Math.min(...days));
  const rows: SeedRow[] = [
    {
      title: 'Morning lecture',
      subtitle: 'Intro series',
      kind: 'class',
      event_date: firstLecture,
      start_min: 9 * 60,
      end_min: 10 * 60 + 30,
      fixed: true,
      priority: 'high',
      travel_min: 0,
      class_id: null,
      repeat_freq: 'weekly',
      repeat_days: [1, 3, 5],
      repeat_until: addDays(firstLecture, 55),
    },
    {
      title: 'Study block',
      subtitle: 'Exam prep',
      kind: 'study',
      event_date: today,
      start_min: 16 * 60,
      end_min: 17 * 60 + 30,
      fixed: false,
      priority: 'med',
      travel_min: 0,
      class_id: null,
      repeat_freq: 'daily',
      repeat_days: null,
      repeat_until: addDays(today, 13),
    },
    {
      title: 'Gym session',
      subtitle: null,
      kind: 'personal',
      event_date: today,
      start_min: 18 * 60,
      end_min: 19 * 60,
      fixed: false,
      priority: 'low',
      travel_min: 0,
      class_id: null,
      repeat_freq: 'none',
      repeat_days: null,
      repeat_until: null,
    },
    {
      title: 'Dentist appointment',
      subtitle: 'Bring insurance card',
      kind: 'commitment',
      event_date: addDays(today, 1),
      start_min: 14 * 60,
      end_min: 15 * 60,
      fixed: true,
      priority: 'high',
      travel_min: 20,
      class_id: null,
      repeat_freq: 'none',
      repeat_days: null,
      repeat_until: null,
    },
  ];
  const { error } = await sb.from('events').insert(rows);
  if (error) throw new Error(error.message);
  return { inserted: rows.length };
}

// ---------------------------------------------------------------------------
// Queued voice commands (offline outbox, interim until the brain relay).
// Stores transcripts only — no audio leaves the phone yet.
// ---------------------------------------------------------------------------

export interface QueuedCommand {
  text: string;
  atMs: number;
}

const QUEUE_KEY = 'rocky.voiceQueue';
const QUEUE_MAX = 5;

export function readQueue(): QueuedCommand[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const list = raw ? (JSON.parse(raw) as QueuedCommand[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function enqueueCommand(text: string): QueuedCommand[] {
  const list = [...readQueue(), { text, atMs: Date.now() }].slice(-QUEUE_MAX);
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  return list;
}

export function clearQueue(): void {
  try {
    localStorage.removeItem(QUEUE_KEY);
  } catch {
    /* ignore */
  }
}

export function useQueueVersion(): [number, () => void] {
  const [v, setV] = useState(0);
  const bump = useCallback(() => setV((n) => n + 1), []);
  return [v, bump];
}

export function useNowTick(intervalMs = 30_000): number {
  const [, setTick] = useState(0);
  const ref = useRef(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      ref.current += 1;
      setTick(ref.current);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return ref.current;
}
