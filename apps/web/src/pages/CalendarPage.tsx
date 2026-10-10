// Calendar: Day / Week / Month over real occurrences (core expandEvents).
// Read-only for now — drag to move, resize, and double-click-create land in
// the next build.

import { useMemo, useState } from 'react';
import { CalendarX2, ChevronLeft, ChevronRight, MousePointer2 } from 'lucide-react';
import { addDays, weekdayOf } from '@rocky/core';
import { todayLocal, useOccurrences, weekDates, weekStartOf } from '../lib/remote';
import { Card, EmptyState, PageHeader } from '../components/Page';
import { OccurrenceRow, kindToken } from '../components/OccurrenceRow';

type CalView = 'day' | 'week' | 'month';

const VIEWS: { id: CalView; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function shiftMonth(date: string, delta: number): string {
  const [y, m] = date.split('-').map(Number);
  const d = new Date(y!, m! - 1 + delta, 1);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-01`;
}

function monthCells(firstOfMonth: string): { start: string; end: string; cells: string[] } {
  const lead = weekdayOf(firstOfMonth);
  const start = addDays(firstOfMonth, -lead);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return { start, end: addDays(start, 41), cells };
}

function longLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y!, m! - 1, d).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function monthLabel(firstOfMonth: string): string {
  const [y, m] = firstOfMonth.split('-').map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

export function CalendarPage() {
  const today = useMemo(() => todayLocal(), []);
  const [view, setView] = useState<CalView>('day');
  const [sel, setSel] = useState(today);

  const range = useMemo(() => {
    if (view === 'day') return { from: sel, to: sel };
    if (view === 'week') {
      const ws = weekStartOf(sel);
      return { from: ws, to: addDays(ws, 6) };
    }
    const first = sel.slice(0, 7) + '-01';
    const { start, end } = monthCells(first);
    return { from: start, to: end };
  }, [view, sel]);

  const slice = useOccurrences(range.from, range.to, true);

  const step = (dir: 1 | -1) => {
    if (view === 'day') setSel((s) => addDays(s, dir));
    else if (view === 'week') setSel((s) => addDays(s, dir * 7));
    else setSel((s) => shiftMonth(s, dir));
  };

  const monthInfo = useMemo(() => {
    if (view !== 'month') return null;
    const first = sel.slice(0, 7) + '-01';
    return { first, ...monthCells(first) };
  }, [view, sel]);

  const selOccs = useMemo(() => {
    const list = slice.byDate.get(sel) ?? [];
    return [...list].sort((a, b) => a.startMin - b.startMin);
  }, [slice.byDate, sel]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8">
      <PageHeader
        title="Calendar"
        sub="Fixed blocks are locked; flexible ones move when Rocky replans."
        actions={
          <div role="tablist" aria-label="Calendar view" className="flex rounded-xl border border-line bg-surface p-1">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={view === v.id}
                onClick={() => setView(v.id)}
                className="h-9 rounded-lg px-4 text-sm font-semibold"
                style={{
                  background: view === v.id ? 'var(--surface2)' : 'transparent',
                  color: view === v.id ? 'var(--ink1)' : 'var(--ink3)',
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
        }
      />

      <Card>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous"
            className="grid h-9 w-9 place-items-center rounded-lg border border-line text-ink2 hover:text-ink1"
          >
            <ChevronLeft size={17} aria-hidden />
          </button>
          <div className="flex flex-col items-center">
            <span className="text-[15px] font-bold">
              {view === 'month' && monthInfo ? monthLabel(monthInfo.first) : longLabel(sel)}
            </span>
            {sel !== today && (
              <button
                type="button"
                onClick={() => setSel(today)}
                className="text-xs font-bold text-accent-ink"
              >
                Back to today
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Next"
            className="grid h-9 w-9 place-items-center rounded-lg border border-line text-ink2 hover:text-ink1"
          >
            <ChevronRight size={17} aria-hidden />
          </button>
        </div>

        {slice.loading ? (
          <p className="py-6 text-center text-sm text-ink3">Loading…</p>
        ) : slice.error ? (
          <p role="alert" className="py-6 text-center text-sm text-danger">{slice.error}</p>
        ) : view === 'day' ? (
          selOccs.length === 0 ? (
            <EmptyState
              icon={CalendarX2}
              title="No events this day"
              body="Tell Rocky — “gym at 7 tomorrow” — and it lands here."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {selOccs.map((o) => (
                <OccurrenceRow key={o.id} occ={o} />
              ))}
            </div>
          )
        ) : view === 'week' ? (
          <div className="grid grid-cols-7 gap-2 overflow-x-auto">
            {weekDates(weekStartOf(sel)).map((d) => {
              const list = [...(slice.byDate.get(d) ?? [])].sort((a, b) => a.startMin - b.startMin);
              const dayNum = Number(d.slice(8));
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setSel(d);
                    setView('day');
                  }}
                  className="flex min-w-[104px] flex-col gap-1.5 rounded-xl border border-line p-2 text-left"
                  style={{ background: d === today ? 'var(--accent-soft)' : 'transparent' }}
                  aria-label={`${longLabel(d)}, ${list.length} events. Open day view.`}
                >
                  <span className="flex items-baseline justify-between">
                    <span className="text-[11px] font-bold uppercase text-ink3">
                      {DAY_NAMES[weekdayOf(d)]}
                    </span>
                    <span className="tnum text-sm font-bold">{dayNum}</span>
                  </span>
                  {list.length === 0 ? (
                    <span className="py-2 text-center text-[11px] text-ink4">—</span>
                  ) : (
                    list.slice(0, 4).map((o) => (
                      <span
                        key={o.id}
                        className="truncate rounded-md px-1.5 py-1 text-[11px] font-semibold"
                        style={{
                          background: `var(--${kindToken(o.kind)}-bg)`,
                        }}
                      >
                        {o.title}
                      </span>
                    ))
                  )}
                  {list.length > 4 && (
                    <span className="text-[11px] font-semibold text-ink3">+{list.length - 4} more</span>
                  )}
                </button>
              );
            })}
          </div>
        ) : monthInfo ? (
          <div className="flex flex-col gap-1">
            <div className="grid grid-cols-7 gap-1">
              {DAY_NAMES.map((n) => (
                <span key={n} className="py-1 text-center text-[11px] font-bold uppercase text-ink3">
                  {n}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthInfo.cells.map((d) => {
                const count = slice.byDate.get(d)?.length ?? 0;
                const inMonth = d.slice(0, 7) === monthInfo.first.slice(0, 7);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setSel(d);
                      setView('day');
                    }}
                    aria-label={`${longLabel(d)}, ${count} events. Open day view.`}
                    className="flex min-h-[52px] flex-col items-center justify-start gap-1 rounded-lg border border-line p-1"
                    style={{
                      opacity: inMonth ? 1 : 0.4,
                      background: d === today ? 'var(--accent-soft)' : 'transparent',
                      borderColor: d === sel ? 'var(--accent)' : 'var(--line)',
                    }}
                  >
                    <span className="tnum text-xs font-bold">{Number(d.slice(8))}</span>
                    <span className="flex gap-0.5" aria-hidden>
                      {Array.from({ length: Math.min(3, count) }).map((_, i) => (
                        <span key={i} className="h-1.5 w-1.5 rounded-full bg-accent" />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </Card>

      <p className="flex items-start gap-2 text-sm text-ink3">
        <MousePointer2 size={15} aria-hidden className="mt-0.5 shrink-0" />
        Drag to move, resize, and double-click to create land in the next build. Fixed class blocks stay locked.
      </p>
    </div>
  );
}
