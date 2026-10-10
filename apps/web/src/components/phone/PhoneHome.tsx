// Phone home screen: read-only calendar + talk button.
// Fixed header (title, laptop pill + Day/Week, week strip, NEXT, deadline
// flag); only the timeline scrolls. No editing here by design.

import { useEffect, useMemo, useState } from 'react';
import { CalendarX2, Ellipsis, Flag, Sprout } from 'lucide-react';
import { addDays, weekdayOf } from '@rocky/core';
import type { Assignment } from '@rocky/core';
import {
  formatRange,
  insertSampleEvents,
  isSeedEnabled,
  nowMinutesLocal,
  todayLocal,
  useLaptopPresence,
  useNowTick,
  useOccurrences,
} from '../../lib/remote';
import { fetchOpenAssignments } from '../../lib/queries';
import { nextUpCountdownShort } from '../../lib/dashboard';
import { useShowLatency } from '../../lib/prefs';
import { DayTimeline } from './DayTimeline';
import { EventSheet } from './EventSheet';
import { SettingsSheet } from './SettingsSheet';
import { TalkButton, type TalkLatency } from './TalkButton';
import { kindPrefix, nextUp } from './blocks';

const DAY3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function prettyDate(iso: string): { weekday: string; md: string; title: string } {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  const dt = new Date(y, m - 1, d);
  const weekday = dt.toLocaleDateString('en-US', { weekday: 'long' });
  const md = `${MONTH_SHORT[m - 1]} ${d}`;
  return { weekday, md, title: `${weekday}, ${md}` };
}

/** "11:00" — NEXT pill start time, no meridiem like the design. */
function shortClock(min: number): string {
  const h24 = Math.floor(min / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(min % 60).padStart(2, '0')}`;
}

function time12(min: number): string {
  const h24 = Math.floor(min / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(min % 60).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

function localDateOf(iso: string): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function PhoneHome({
  onUnpaired,
  onSwitchLaptop,
}: {
  onUnpaired: () => void;
  onSwitchLaptop: () => void;
}) {
  const today = todayLocal();
  const [selected, setSelected] = useState(today);
  const [view, setView] = useState<'day' | 'week'>('day');
  const [openId, setOpenId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [latency, setLatency] = useState<TalkLatency | null>(null);
  const [seedBusy, setSeedBusy] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [showLatency] = useShowLatency();

  // Monday-first week (design strip runs Mon–Sun).
  const monday = useMemo(
    () => addDays(selected, -((weekdayOf(selected) + 6) % 7)),
    [selected],
  );
  const strip = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);
  const presence = useLaptopPresence(true);
  const { byDate, loading, error, refetch } = useOccurrences(monday, addDays(monday, 6), true);
  useNowTick(30_000);
  const nowMin = nowMinutesLocal();

  useEffect(() => {
    let alive = true;
    void fetchOpenAssignments().then((a) => alive && setAssignments(a));
    return () => {
      alive = false;
    };
  }, []);

  const dayList = useMemo(() => byDate.get(selected) ?? [], [byDate, selected]);
  const openOccurrence = useMemo(
    () => dayList.find((o) => o.id === openId) ?? null,
    [dayList, openId],
  );
  const next = selected === today ? nextUp(dayList, nowMin) : null;
  const dueDates = useMemo(() => {
    const set = new Set<string>();
    for (const a of assignments) {
      if (!a.due_at || a.status === 'done') continue;
      const d = localDateOf(a.due_at);
      if (d) set.add(d);
    }
    return set;
  }, [assignments]);
  const dueFlag = useMemo(
    () => assignments.find((a) => a.due_at && localDateOf(a.due_at) === selected) ?? null,
    [assignments, selected],
  );
  const dueFlagMin = useMemo(() => {
    if (!dueFlag?.due_at) return null;
    const dt = new Date(dueFlag.due_at);
    return Number.isNaN(dt.getTime()) ? null : dt.getHours() * 60 + dt.getMinutes();
  }, [dueFlag]);
  const { title } = prettyDate(selected);

  const pill =
    presence.status === 'online'
      ? { bg: 'var(--success-soft)', fg: 'var(--success)', dot: 'var(--success)', label: 'Laptop online' }
      : presence.status === 'offline'
        ? { bg: 'var(--danger-soft)', fg: 'var(--danger)', dot: 'var(--danger)', label: 'Laptop offline' }
        : { bg: 'var(--warning-soft)', fg: 'var(--warning)', dot: 'var(--warning)', label: 'Connecting…' };

  async function seed() {
    setSeedBusy(true);
    setSeedError(null);
    try {
      await insertSampleEvents();
      refetch();
    } catch (e) {
      setSeedError(e instanceof Error ? e.message : 'Could not insert sample events.');
    } finally {
      setSeedBusy(false);
    }
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col bg-bg text-ink1">
      {/* Fixed header */}
      <header className="flex-none px-5 pt-4">
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 flex-1 truncate text-[28px] font-bold leading-tight tracking-tight">
            {title}
          </h1>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            className="grid h-10 w-10 flex-none place-items-center rounded-xl text-ink1"
          >
            <Ellipsis size={22} aria-hidden />
          </button>
        </div>
        <div className="flex items-center gap-2 pt-2.5">
          <span
            className="inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-bold"
            style={{ background: pill.bg, color: pill.fg }}
            title={`Laptop: ${presence.laptopName}`}
          >
            <span className="h-2 w-2 flex-none rounded-full" style={{ background: pill.dot }} aria-hidden />
            <span className="truncate">{pill.label}</span>
          </span>
          <div className="flex flex-none rounded-xl border border-line bg-surface p-1" role="group" aria-label="Calendar view">
            {(['day', 'week'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className="h-8 rounded-lg px-4 text-sm font-bold capitalize"
                style={{
                  background: view === v ? 'var(--surface2)' : 'transparent',
                  color: view === v ? 'var(--ink1)' : 'var(--ink3)',
                }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 pt-2.5" role="group" aria-label="Week">
          {strip.map((d) => {
            const isSel = d === selected;
            const count = (byDate.get(d) ?? []).length;
            const hasDeadline = dueDates.has(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => setSelected(d)}
                aria-label={`${prettyDate(d).title}${d === today ? ', today' : ''}, ${count} events`}
                aria-pressed={isSel}
                className="flex flex-col items-center gap-0.5 rounded-2xl py-1.5"
                style={{ background: isSel ? 'var(--accent-soft)' : 'transparent' }}
              >
                <span className="text-xs font-semibold text-ink2">{DAY3[weekdayOf(d)]}</span>
                <span
                  className="tnum text-[18px] font-bold"
                  style={{ color: isSel ? 'var(--accent-ink)' : 'var(--ink1)' }}
                >
                  {Number(d.slice(8, 10))}
                </span>
                <span className="flex h-[7px] items-center" aria-hidden>
                  {hasDeadline ? (
                    <span className="h-[6px] w-[6px] rounded-full bg-danger" />
                  ) : count > 0 ? (
                    <span className="h-[6px] w-[6px] rounded-full bg-accent" />
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
        {next && view === 'day' && (
          <div className="mt-2 flex items-center gap-2 rounded-2xl bg-surface px-3.5 py-2.5">
            <span className="flex-none text-xs font-bold uppercase tracking-[0.06em] text-accent-ink">Next</span>
            <button
              type="button"
              onClick={() => setOpenId(next.id)}
              className="min-w-0 flex-1 truncate text-left text-[15px] font-semibold"
            >
              {next.title} <span className="tnum font-normal text-ink2">· {shortClock(next.startMin)}</span>
            </button>
            <span className="tnum flex-none rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent-ink">
              {nextUpCountdownShort(next.startMin, nowMin)}
            </span>
          </div>
        )}
        {dueFlag?.due_at && dueFlagMin != null && view === 'day' && (
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-danger bg-danger-soft px-3.5 py-2 text-sm">
            <Flag size={14} aria-hidden className="shrink-0 text-danger" />
            <span className="min-w-0 flex-1 truncate font-semibold">
              {dueFlag.title} <span className="tnum font-normal">· due {time12(dueFlagMin)}</span>
            </span>
          </div>
        )}
      </header>

      {/* Scrolling timeline only */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-44 pt-3">
        {loading ? (
          <div className="flex flex-col gap-2.5 pt-1" aria-label="Loading calendar">
            {[52, 80, 36, 110].map((h, i) => (
              <span
                key={i}
                className="rk-shimmer rounded-xl bg-surface2"
                style={{ height: h, animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-danger bg-danger-soft p-6 text-center" role="alert">
            <p className="text-[15px] font-bold">Couldn’t load your calendar</p>
            <p className="break-words font-mono text-[11px] text-ink2">{error}</p>
            <button
              type="button"
              onClick={refetch}
              className="inline-flex h-10 items-center rounded-[10px] bg-accent px-4 text-sm font-bold text-white"
            >
              Retry
            </button>
          </div>
        ) : view === 'day' ? (
          <div className="flex flex-col gap-3">
            {dayList.length === 0 ? (
              <EmptyDay onSeed={isSeedEnabled() ? seed : null} seedBusy={seedBusy} seedError={seedError} />
            ) : (
              <DayTimeline
                occurrences={dayList}
                isToday={selected === today}
                nowMin={nowMin}
                onOpen={(o) => setOpenId(o.id)}
              />
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            {strip.map((d) => {
              const list = byDate.get(d) ?? [];
              const pd = prettyDate(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setSelected(d);
                    setView('day');
                  }}
                  className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3.5 text-left"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-bold" style={{ color: d === today ? 'var(--accent-ink)' : 'var(--ink1)' }}>
                      {pd.weekday}, {pd.md}
                    </span>
                    {d === today && (
                      <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-white">Today</span>
                    )}
                    <span className="flex-1" />
                    <span className="text-xs text-ink3">
                      {list.length === 0 ? 'Free' : `${list.length} event${list.length === 1 ? '' : 's'}`}
                    </span>
                  </span>
                  {list.slice(0, 4).map((o) => (
                    <span key={o.id} className="flex items-center gap-2 text-sm">
                      <span aria-hidden className="h-6 w-1 flex-none rounded-full" style={{ background: `var(--${kindPrefix(o.kind)}-edge)` }} />
                      <span className="tnum text-xs text-ink3">{formatRange(o.startMin, o.endMin)}</span>
                      <span className="min-w-0 flex-1 truncate font-medium">{o.title}</span>
                    </span>
                  ))}
                </button>
              );
            })}
            {isSeedEnabled() && (
              <SeedButton onSeed={seed} busy={seedBusy} error={seedError} compact />
            )}
          </div>
        )}
      </div>

      {/* Talk dock */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pb-6">
        <TalkButton laptopOffline={presence.status === 'offline'} onLatency={setLatency} />
      </div>

      {showLatency && latency && (
        <div className="pointer-events-none fixed bottom-2 left-1/2 z-30 -translate-x-1/2">
          <span className="tnum flex gap-2.5 rounded-lg bg-surface2 px-2.5 py-1.5 font-mono text-[11px] text-ink2">
            <span>STT {latency.sttMs}</span>
            <span>AI {latency.llmMs}</span>
            <span>Total {(latency.totalMs / 1000).toFixed(2)}s</span>
          </span>
        </div>
      )}

      {openOccurrence && <EventSheet occurrence={openOccurrence} onClose={() => setOpenId(null)} />}
      {settingsOpen && (
        <SettingsSheet
          presence={presence}
          onClose={() => setSettingsOpen(false)}
          onUnpaired={onUnpaired}
          onSwitchLaptop={() => {
            setSettingsOpen(false);
            onSwitchLaptop();
          }}
        />
      )}
    </div>
  );
}

function EmptyDay({
  onSeed,
  seedBusy,
  seedError,
}: {
  onSeed: (() => void) | null;
  seedBusy: boolean;
  seedError: string | null;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-[20px] bg-surface2 text-ink3">
        <CalendarX2 size={28} aria-hidden />
      </span>
      <p className="text-[17px] font-bold">Nothing scheduled</p>
      <p className="max-w-[260px] text-sm leading-relaxed text-ink2">
        Enjoy the open day — or tell Rocky to plan something.
      </p>
      {onSeed && <SeedButton onSeed={onSeed} busy={seedBusy} error={seedError} />}
    </div>
  );
}

function SeedButton({
  onSeed,
  busy,
  error,
  compact,
}: {
  onSeed: () => void;
  busy: boolean;
  error: string | null;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center gap-2 ${compact ? '' : 'pt-4'}`}>
      <button
        type="button"
        onClick={onSeed}
        disabled={busy}
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-dashed border-warning px-4 text-sm font-bold text-warning disabled:opacity-50"
      >
        <Sprout size={16} aria-hidden />
        {busy ? 'Seeding…' : 'DEV-ONLY: insert 4 sample events'}
      </button>
      {error && <p className="break-words font-mono text-[11px] text-danger">{error}</p>}
      <p className="max-w-[280px] text-center text-[11px] leading-relaxed text-ink4">
        Dev only — until the brain writes events. Rows belong to your signed-in account.
      </p>
    </div>
  );
}
