// Calendar: Day time-grid, Week columns, Month dots — all real occurrences.
// Read-only: drag to move, resize, and creating events land in the next
// build. Fixed blocks show a lock, flexible ones a grip.

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarX2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Flag,
  Footprints,
  GripVertical,
  Lock,
  MousePointer2,
  Plus,
} from 'lucide-react';
import type { Occurrence, Task } from '@rocky/core';
import { addDays, weekdayOf } from '@rocky/core';
import { fetchOpenAssignments, fetchTasksForDate } from '../lib/queries';
import type { Assignment } from '@rocky/core';
import { todayLocal, useOccurrences, weekDates, weekStartOf } from '../lib/remote';
import { dueChipLabel } from '../lib/dashboard';
import { EmptyState } from '../components/Page';
import { kindToken } from '../components/OccurrenceRow';
import { TaskRow } from '../components/TaskRow';

type CalView = 'day' | 'week' | 'month';

const VIEWS: { id: CalView; label: string }[] = [
  { id: 'month', label: 'Month' },
  { id: 'week', label: 'Week' },
  { id: 'day', label: 'Day' },
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HR = 44;
const S0 = 8 * 60;
const HOURS = Array.from({ length: 16 }, (_, i) => S0 + i * 60);
const KIND_DOT: { label: string; token: string }[] = [
  { label: 'Class', token: 'cls' },
  { label: 'Commitment', token: 'com' },
  { label: 'Study', token: 'stu' },
  { label: 'Personal', token: 'per' },
  { label: 'Break', token: 'brk' },
  { label: 'Deadline', token: 'ddl' },
];

function shiftMonth(date: string, delta: number): string {
  const [y, m] = date.split('-').map(Number);
  const d = new Date(y!, m! - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function monthCells(firstOfMonth: string): { start: string; end: string; cells: string[] } {
  const lead = weekdayOf(firstOfMonth);
  const start = addDays(firstOfMonth, -lead);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return { start, end: addDays(start, 41), cells };
}

function hourLabel(min: number): string {
  const h24 = Math.floor(min / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12} ${h24 < 12 ? 'AM' : 'PM'}`;
}

function clockLabel(min: number): string {
  const h24 = Math.floor(min / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(min % 60).padStart(2, '0')}`;
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
  return new Date(y!, m! - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
function localDateOf(iso: string): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Due banner time: "11:59 PM" for tonight dues, full chip label otherwise. */
function tonightTime(dueAt: string): string {
  const label = dueChipLabel(dueAt);
  return label.startsWith('Tonight ') ? label.slice('Tonight '.length) : label;
}

function DayBlock({ occ }: { occ: Occurrence }) {
  const token = kindToken(occ.kind);
  const top = Math.max(0, ((occ.startMin - S0) / 60) * HR + 1);
  const h = Math.max(20, ((occ.endMin - occ.startMin) / 60) * HR - 3);
  const roomy = occ.endMin - occ.startMin >= 45;
  return (
    <div
      className="absolute flex items-center gap-2 overflow-hidden rounded-[10px] px-3"
      style={{
        top,
        height: h,
        left: 0,
        right: 0,
        background: `var(--${token}-bg)`,
        color: `var(--${token}-fg)`,
        border: '1px solid transparent',
        borderTop: occ.fixed
          ? `1px solid var(--${token}-edge)`
          : `2px dashed var(--${token}-edge)`,
      }}
      title={`${occ.title}, ${clockLabel(occ.startMin)}–${clockLabel(occ.endMin)}${occ.fixed ? ', fixed — Rocky will not move this' : ', flexible'}`}
    >
      {occ.fixed ? (
        <Lock size={14} aria-hidden className="shrink-0" />
      ) : (
        <GripVertical size={14} aria-hidden className="shrink-0" />
      )}
      <span className="truncate text-sm font-semibold">{occ.title}</span>
      {roomy && occ.subtitle && (
        <span className="truncate text-xs" style={{ opacity: 0.8 }}>{occ.subtitle}</span>
      )}
      <span className="flex-1" />
      {roomy && occ.priority !== 'med' && (
        <span className="flex shrink-0 items-center gap-1 text-xs">
          <span
            className="h-[7px] w-[7px] rounded-full"
            style={{ background: occ.priority === 'high' ? 'var(--danger)' : 'var(--ink3)' }}
            aria-hidden
          />
          {occ.priority === 'high' ? 'High' : 'Low'}
        </span>
      )}
      <span className="tnum shrink-0 text-xs font-semibold">
        {clockLabel(occ.startMin)}–{clockLabel(occ.endMin)}
      </span>
    </div>
  );
}

export function CalendarPage() {
  const today = useMemo(() => todayLocal(), []);
  const nowMin = useMemo(
    () => new Date().getHours() * 60 + new Date().getMinutes(),
    [],
  );
  const [view, setView] = useState<CalView>('day');
  const [sel, setSel] = useState(today);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

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

  useEffect(() => {
    let alive = true;
    void fetchTasksForDate(sel).then((t) => alive && setTasks(t));
    void fetchOpenAssignments().then((a) => alive && setAssignments(a));
    return () => {
      alive = false;
    };
  }, [sel]);

  const step = (dir: 1 | -1) => {
    if (view === 'day') setSel((s) => addDays(s, dir));
    else if (view === 'week') setSel((s) => addDays(s, dir * 7));
    else setSel((s) => shiftMonth(s, dir));
  };

  const selOccs = useMemo(() => {
    const list = slice.byDate.get(sel) ?? [];
    return [...list].sort((a, b) => a.startMin - b.startMin);
  }, [slice.byDate, sel]);

  const dueToday = useMemo(
    () => assignments.filter((a) => a.due_at && localDateOf(a.due_at) === sel).slice(0, 2),
    [assignments, sel],
  );

  const monthInfo = useMemo(() => {
    if (view !== 'month') return null;
    const first = sel.slice(0, 7) + '-01';
    return { first, ...monthCells(first) };
  }, [view, sel]);

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-4 py-6 md:px-6">
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
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
            <span className="flex items-center gap-1.5">
              <button type="button" onClick={() => step(-1)} aria-label="Previous" className="grid h-9 w-9 place-items-center rounded-lg border border-line text-ink2 hover:text-ink1">
                <ChevronLeft size={17} aria-hidden />
              </button>
              <button type="button" onClick={() => step(1)} aria-label="Next" className="grid h-9 w-9 place-items-center rounded-lg border border-line text-ink2 hover:text-ink1">
                <ChevronRight size={17} aria-hidden />
              </button>
              <button type="button" onClick={() => setSel(today)} className="h-9 rounded-lg border border-line px-3 text-sm font-semibold text-ink1">
                Today
              </button>
            </span>
            <span className="flex items-center gap-1 text-xl font-bold tracking-tight">
              {view === 'month' && monthInfo ? monthLabel(monthInfo.first) : longLabel(sel)}
              <ChevronDown size={16} aria-hidden className="text-ink3" />
            </span>
            <span className="ml-auto" />
            <button
              type="button"
              disabled
              title="Creating events by hand lands in the next build — tell Rocky instead"
              className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-accent px-4 text-sm font-bold text-white disabled:opacity-50"
            >
              <Plus size={15} aria-hidden />
              New event
            </button>
          </div>

          {slice.loading ? (
            <p className="py-10 text-center text-sm text-ink3">Loading…</p>
          ) : slice.error ? (
            <p role="alert" className="py-10 text-center text-sm text-danger">{slice.error}</p>
          ) : view === 'day' ? (
            <div className="flex flex-col gap-3">
              {dueToday.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-2.5 rounded-xl border border-danger bg-danger-soft px-4 py-2.5 text-sm"
                >
                  <Flag size={14} aria-hidden className="shrink-0 text-danger" />
                  <span className="font-bold">
                    {sel === today ? 'Due tonight' : 'Due'}: {a.title}
                  </span>
                  <span className="tnum ml-auto shrink-0 text-[13px] text-ink1">
                    {a.due_at ? tonightTime(a.due_at) : ''}
                  </span>
                </div>
              ))}
              {selOccs.length === 0 && dueToday.length === 0 ? (
                <EmptyState
                  icon={CalendarX2}
                  title="No events this day"
                  body="Tell Rocky — “gym at 7 tomorrow” — and it lands here."
                />
              ) : (
                <div className="relative rounded-2xl border border-line bg-surface p-4">
                  <div className="relative" style={{ height: HOURS.length * HR }}>
                    {HOURS.map((h) => (
                      <div key={h} className="absolute inset-x-0 flex gap-3" style={{ top: ((h - S0) / 60) * HR }}>
                        <span className="tnum w-11 flex-none -translate-y-1/2 text-right text-xs text-ink3">
                          {hourLabel(h)}
                        </span>
                        <span className="mb-auto h-px flex-1 bg-line" aria-hidden />
                      </div>
                    ))}
                    {sel === today && nowMin >= S0 && nowMin < S0 + HOURS.length * 60 && (
                      <div className="absolute inset-x-0" style={{ top: ((nowMin - S0) / 60) * HR }}>
                        <div className="flex items-center gap-3">
                          <span className="tnum w-11 flex-none -translate-y-1/2 text-right text-xs font-bold text-danger">
                            {clockLabel(nowMin)}
                          </span>
                          <span className="relative h-0.5 flex-1 bg-danger" aria-hidden>
                            <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-danger" />
                          </span>
                        </div>
                      </div>
                    )}
                    <div className="absolute bottom-0 right-0 top-0 left-[68px]">
                      {selOccs.map(
                        (o) =>
                          o.travelMin > 0 && (
                            <div
                              key={`${o.id}-travel`}
                              className="absolute flex items-center gap-1.5 overflow-hidden rounded-lg px-2 text-[11px] text-ink2"
                              style={{
                                top: Math.max(0, ((o.startMin - o.travelMin - S0) / 60) * HR + 1),
                                height: Math.max(16, (o.travelMin / 60) * HR - 2),
                                left: 0,
                                right: 0,
                                background:
                                  'repeating-linear-gradient(135deg, var(--line) 0 5px, transparent 5px 10px)',
                              }}
                            >
                              <Footprints size={11} aria-hidden />
                              {o.travelMin} min travel
                            </div>
                          ),
                      )}
                      {selOccs.map((o) => (
                        <DayBlock key={o.id} occ={o} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : view === 'week' ? (
            <div className="grid grid-cols-7 gap-2 overflow-x-auto">
              {weekDates(weekStartOf(sel)).map((d) => {
                const list = [...(slice.byDate.get(d) ?? [])].sort((a, b) => a.startMin - b.startMin);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setSel(d);
                      setView('day');
                    }}
                    className="flex min-w-[104px] flex-col gap-1.5 rounded-xl border border-line bg-surface p-2 text-left"
                    style={d === today ? { borderColor: 'var(--accent)' } : undefined}
                    aria-label={`${longLabel(d)}, ${list.length} events. Open day view.`}
                  >
                    <span className="flex items-baseline justify-between px-0.5">
                      <span className="text-[11px] font-bold uppercase text-ink3">{DAY_NAMES[weekdayOf(d)]}</span>
                      <span className="tnum text-sm font-bold">{Number(d.slice(8))}</span>
                    </span>
                    {list.length === 0 ? (
                      <span className="py-3 text-center text-[11px] text-ink4">—</span>
                    ) : (
                      list.slice(0, 5).map((o) => (
                        <span
                          key={o.id}
                          className="flex items-center gap-1 truncate rounded-md px-1.5 py-1 text-[11px] font-semibold"
                          style={{ background: `var(--${kindToken(o.kind)}-bg)`, color: `var(--${kindToken(o.kind)}-fg)` }}
                        >
                          {o.fixed ? <Lock size={10} aria-hidden className="shrink-0" /> : <GripVertical size={10} aria-hidden className="shrink-0" />}
                          <span className="truncate">{o.title}</span>
                        </span>
                      ))
                    )}
                    {list.length > 5 && (
                      <span className="px-1 text-[11px] font-semibold text-ink3">+{list.length - 5} more</span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : monthInfo ? (
            <div className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-4">
              <div className="grid grid-cols-7 gap-1">
                {DAY_NAMES.map((n) => (
                  <span key={n} className="py-1 text-center text-[11px] font-bold uppercase text-ink3">{n}</span>
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
          <p className="flex items-start gap-2 text-sm text-ink3">
            <MousePointer2 size={15} aria-hidden className="mt-0.5 shrink-0" />
            Drag to move, resize, and creating events by hand land in the next build. Fixed class blocks stay locked.
          </p>
        </div>

        {/* Right rail */}
        <div className="flex flex-col gap-5">
          <section aria-label="Day tasks" className="flex flex-col rounded-2xl border border-line bg-surface p-4">
            <h2 className="px-1 pb-1 text-[15px] font-bold">
              {sel === today ? "Today's tasks" : `Tasks · ${longLabel(sel)}`}
            </h2>
            {tasks.length === 0 ? (
              <p className="px-1 py-2 text-sm text-ink2">No tasks this day.</p>
            ) : (
              tasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onChanged={(next) => setTasks((list) => list.map((x) => (x.id === next.id ? next : x)))}
                />
              ))
            )}
          </section>
          <section aria-label="Unscheduled" className="flex flex-col gap-2">
            <h2 className="text-[15px] font-bold">Unscheduled</h2>
            <div className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-3 text-sm text-ink2">
              <CalendarX2 size={15} aria-hidden className="shrink-0 text-ink3" />
              Everything fit today.
            </div>
          </section>
          <section aria-label="How blocks work" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
            <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-ink3">How blocks work</h2>
            <div className="flex gap-2.5">
              <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-surface2 text-ink1">
                <Lock size={14} aria-hidden />
              </span>
              <p className="text-[13px] leading-snug text-ink2">
                <b className="text-ink1">Fixed.</b> Solid edge and a lock. Rocky never moves these.
              </p>
            </div>
            <div className="flex gap-2.5">
              <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-surface2 text-ink1">
                <GripVertical size={14} aria-hidden />
              </span>
              <p className="text-[13px] leading-snug text-ink2">
                <b className="text-ink1">Flexible.</b> Dashed top edge and a grip. Rocky can move these.
              </p>
            </div>
            <ul className="grid list-none grid-cols-2 gap-x-3 gap-y-1.5 p-0">
              {KIND_DOT.map((k) => (
                <li key={k.label} className="flex items-center gap-1.5 text-xs text-ink2">
                  <span className="h-2.5 w-2.5 rounded-[4px]" style={{ background: `var(--${k.token}-edge)` }} aria-hidden />
                  {k.label}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
