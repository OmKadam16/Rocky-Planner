import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarX2, MoreVertical, Sprout } from 'lucide-react';
import { addDays, weekdayOf } from '@rocky/core';
import {
  formatRange,
  insertSampleEvents,
  isSeedEnabled,
  nowMinutesLocal,
  todayLocal,
  useLaptopPresence,
  useNowTick,
  useOccurrences,
  weekDates,
  weekStartOf,
} from '../../lib/remote';
import { useShowLatency } from '../../lib/prefs';
import { DayTimeline } from './DayTimeline';
import { PX_PER_HOUR } from './blocks';
import { EventSheet } from './EventSheet';
import { SettingsSheet } from './SettingsSheet';
import { TalkButton, type TalkLatency } from './TalkButton';
import { kindPrefix, nextUp } from './blocks';

const WEEKDAY_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function prettyDate(iso: string): { weekday: string; md: string } {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  const dt = new Date(y, m - 1, d);
  const weekday = dt.toLocaleDateString('en-US', { weekday: 'long' });
  return { weekday, md: `${MONTH_SHORT[m - 1]} ${d}` };
}

/**
 * Phone home screen (B3): read-only calendar + talk button.
 * Header date + laptop chip, week strip, day timeline / week agenda,
 * event bottom sheet, settings sheet. No editing here by design.
 */
export function PhoneHome({ onUnpaired }: { onUnpaired: () => void }) {
  const today = todayLocal();
  const [selected, setSelected] = useState(today);
  const [view, setView] = useState<'day' | 'week'>('day');
  const [openId, setOpenId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [latency, setLatency] = useState<TalkLatency | null>(null);
  const [seedBusy, setSeedBusy] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [showLatency] = useShowLatency();

  const weekStart = weekStartOf(selected);
  const weekEnd = addDays(weekStart, 6);
  const presence = useLaptopPresence(true);
  const { byDate, loading, error, refetch } = useOccurrences(weekStart, weekEnd, true);
  useNowTick(30_000);
  const nowMin = nowMinutesLocal();

  const dayList = useMemo(() => byDate.get(selected) ?? [], [byDate, selected]);
  const openOccurrence = useMemo(
    () => dayList.find((o) => o.id === openId) ?? null,
    [dayList, openId],
  );
  const next = selected === today ? nextUp(dayList, nowMin) : null;
  const { weekday, md } = prettyDate(selected);

  // Auto-scroll the day timeline to now (today) or the first event, once per
  // selected date. The pb-40 below keeps the last blocks clear of the
  // fixed talk dock.
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const scrolledKey = useRef<string | null>(null);
  useEffect(() => {
    if (view !== 'day' || dayList.length === 0) return;
    const key = `${selected}:${dayList.length}`;
    if (scrolledKey.current === key) return;
    scrolledKey.current = key;
    const el = timelineRef.current;
    if (!el) return;
    const anchorMin = selected === today ? nowMin : dayList[0]!.startMin;
    const y = el.getBoundingClientRect().top + window.scrollY + (anchorMin / 60) * PX_PER_HOUR;
    window.scrollTo({ top: Math.max(0, y - window.innerHeight * 0.3), behavior: 'smooth' });
  }, [view, selected, dayList, nowMin, today]);

  const chip =
    presence.status === 'online'
      ? { dot: 'var(--success)', label: 'Online' }
      : presence.status === 'offline'
        ? { dot: 'var(--danger)', label: 'Offline' }
        : { dot: 'var(--warning)', label: 'Connecting…' };

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
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col bg-bg text-ink1">
      {/* Header */}
      <header className="flex items-center gap-2 px-5 pt-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[22px] font-bold leading-tight tracking-tight">{weekday}</h1>
          <p className="text-sm text-ink2">
            {md}
            {selected !== today && (
              <>
                {' · '}
                <button type="button" onClick={() => setSelected(today)} className="font-bold text-accent-ink">
                  Today
                </button>
              </>
            )}
          </p>
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-bold"
          style={{ background: 'var(--surface2)', color: 'var(--ink1)' }}
          title={`Laptop: ${presence.laptopName} — ${chip.label}`}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: chip.dot }} aria-hidden />
          {chip.label}
        </span>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-surface text-ink2"
        >
          <MoreVertical size={19} aria-hidden />
        </button>
      </header>

      {/* Day / Week toggle */}
      <div className="px-5 pt-3">
        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-line bg-surface p-1" role="group" aria-label="Calendar view">
          {(['day', 'week'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className="h-9 rounded-xl text-sm font-bold capitalize"
              style={{
                background: view === v ? 'var(--accent)' : 'transparent',
                color: view === v ? '#fff' : 'var(--ink2)',
              }}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Week strip */}
      <div className="px-5 pt-3">
        <div className="grid grid-cols-7 gap-1" role="group" aria-label="Week">
          {weekDates(weekStart).map((d) => {
            const isSel = d === selected;
            const isToday = d === today;
            const hasEvents = (byDate.get(d) ?? []).length > 0;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setSelected(d)}
                aria-label={`${prettyDate(d).weekday}, ${prettyDate(d).md}${isToday ? ', today' : ''}`}
                aria-pressed={isSel}
                className="flex h-[60px] flex-col items-center justify-center gap-[3px] rounded-[14px]"
                style={{
                  background: isSel ? 'var(--accent)' : 'var(--surface)',
                  color: isSel ? '#fff' : 'var(--ink1)',
                  outline: !isSel && isToday ? '1.5px solid var(--accent)' : 'none',
                }}
              >
                <span className="text-xs font-semibold opacity-85">{WEEKDAY_SHORT[weekdayOf(d)]}</span>
                <span className="text-[16px] font-bold">{Number(d.slice(8, 10))}</span>
                <span
                  aria-hidden
                  className="h-[5px] w-[5px] rounded-full"
                  style={{ background: hasEvents ? (isSel ? '#fff' : 'var(--accent)') : 'transparent' }}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 px-5 pb-40 pt-3">
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
            {next && (
              <button
                type="button"
                onClick={() => setOpenId(next.id)}
                className="flex items-center gap-2 rounded-2xl bg-accent-soft px-3.5 py-2.5 text-left text-sm font-semibold text-ink1"
              >
                <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-white">Next up</span>
                <span className="min-w-0 flex-1 truncate">{next.title}</span>
                <span className="tnum text-xs text-ink2">{formatRange(next.startMin, next.endMin)}</span>
              </button>
            )}
            {dayList.length === 0 ? (
              <EmptyDay onSeed={isSeedEnabled() ? seed : null} seedBusy={seedBusy} seedError={seedError} />
            ) : (
              <div ref={timelineRef} className="overflow-x-hidden">
                <DayTimeline
                  occurrences={dayList}
                  isToday={selected === today}
                  nowMin={nowMin}
                  onOpen={(o) => setOpenId(o.id)}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            {weekDates(weekStart).map((d) => {
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
        <SettingsSheet presence={presence} onClose={() => setSettingsOpen(false)} onUnpaired={onUnpaired} />
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

