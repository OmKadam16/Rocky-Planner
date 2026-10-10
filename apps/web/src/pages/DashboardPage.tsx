// Dashboard: Today list, Next up, Due soon, Today's tasks, This week,
// Recent voice commands, Memory. Real data + honest empty states.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  AlarmClock,
  CalendarDays,
  CalendarX2,
  Clock,
  Footprints,
  GripVertical,
  History,
  Laptop,
  Lock,
  Mic,
  Plus,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';
import type { Assignment, ClassRow, Command, Task } from '@rocky/core';
import type { Profile } from '@rocky/core';
import { addDays, weekdayOf } from '@rocky/core';
import {
  formatRange,
  insertSampleEvents,
  isSeedEnabled,
  nowMinutesLocal,
  todayLocal,
  useOccurrences,
} from '../lib/remote';
import {
  fetchClasses,
  fetchOpenAssignments,
  fetchRecentCommands,
  fetchTasksForDate,
  insertTask,
  readProfile,
  setAssignmentStatus,
} from '../lib/queries';
import { displayNameFor } from '../lib/profile';
import {
  dueChipLabel,
  dueSoonAssignments,
  formatClock,
  greetingForHour,
  leaveByLabel,
  nextUpCountdown,
  nextUpOccurrence,
  urgencyFor,
} from '../lib/dashboard';
import { usePhonePaired } from '../lib/useDevices';
import { useSession } from '../lib/auth';
import { EmptyState } from '../components/Page';
import { kindToken } from '../components/OccurrenceRow';
import { TaskRow } from '../components/TaskRow';
import { DemoBadge } from '../components/DemoBadge';

const PAIR_NUDGE_KEY = 'rocky.pairNudgeDismissed';
const DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const URG_ICON = { danger: AlarmClock, warning: Clock, neutral: CalendarDays } as const;
const URG_TONE = {
  danger: { bg: 'var(--danger-soft)', fg: 'var(--danger)' },
  warning: { bg: 'var(--warning-soft)', fg: 'var(--warning)' },
  neutral: { bg: 'var(--surface2)', fg: 'var(--ink2)' },
} as const;
const ASG_STATUS: Assignment['status'][] = ['todo', 'in_progress', 'done'];
const ASG_LABEL: Record<Assignment['status'], string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
};

function kickerDate(today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d);
  return `${DOW_FULL[dt.getDay()]}, ${MON_FULL[dt.getMonth()]} ${dt.getDate()}`.toUpperCase();
}

function commandStatus(cmd: Command): { tone: 'success' | 'accent' | 'danger'; label: string } {
  if (cmd.status === 'done') return { tone: 'success', label: 'Done' };
  if (cmd.status === 'error') return { tone: 'danger', label: 'Error' };
  return { tone: 'accent', label: 'Working…' };
}

export function DashboardPage() {
  const today = useMemo(() => todayLocal(), []);
  const nowMin = useMemo(() => nowMinutesLocal(), []);
  const hour = useMemo(() => new Date().getHours(), []);
  const monday = useMemo(() => addDays(today, -((weekdayOf(today) + 6) % 7)), [today]);
  const sunday = useMemo(() => addDays(monday, 6), [monday]);
  const { user } = useSession();
  const navigate = useNavigate();
  const phone = usePhonePaired(true);
  const week = useOccurrences(monday, sunday, true);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [commands, setCommands] = useState<Command[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [newTask, setNewTask] = useState('');
  const [taskError, setTaskError] = useState<string | null>(null);
  const [asgError, setAsgError] = useState<string | null>(null);
  const [nudgeDismissed, setNudgeDismissed] = useState(() => {
    try {
      return localStorage.getItem(PAIR_NUDGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let alive = true;
    void readProfile().then((p) => alive && setProfile(p));
    Promise.all([
      fetchTasksForDate(today),
      fetchOpenAssignments(),
      fetchClasses(),
      fetchRecentCommands(5),
    ])
      .then(([t, a, c, cmds]) => {
        if (!alive) return;
        setTasks(t);
        setAssignments(a);
        setClasses(c);
        setCommands(cmds);
      })
      .catch((e: unknown) => {
        if (alive) setLoadError(e instanceof Error ? e.message : 'Could not load the dashboard.');
      });
    return () => {
      alive = false;
    };
  }, [today]);

  const name = displayNameFor(profile?.display_name, profile?.full_name, user?.email ?? null);
  const todayOccs = useMemo(() => {
    const list = week.byDate.get(today) ?? [];
    return [...list].sort((a, b) => a.startMin - b.startMin);
  }, [week.byDate, today]);
  const nextUp = useMemo(() => nextUpOccurrence(todayOccs, nowMin), [todayOccs, nowMin]);
  const dueSoon = useMemo(
    () => dueSoonAssignments(assignments, Date.now()).slice(0, 5),
    [assignments],
  );
  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const dueDates = useMemo(() => {
    const set = new Set<string>();
    for (const a of assignments) {
      if (!a.due_at || a.status === 'done') continue;
      const d = new Date(Date.parse(a.due_at));
      if (!Number.isNaN(d.getTime())) {
        set.add(
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        );
      }
    }
    return set;
  }, [assignments]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(monday, i)),
    [monday],
  );

  const dismissNudge = useCallback(() => {
    try {
      localStorage.setItem(PAIR_NUDGE_KEY, '1');
    } catch {
      /* ignore */
    }
    setNudgeDismissed(true);
  }, []);

  const seed = useCallback(async () => {
    setSeeding(true);
    setSeedError(null);
    try {
      await insertSampleEvents();
      week.refetch();
    } catch (e) {
      setSeedError(e instanceof Error ? e.message : 'Could not insert sample events.');
    } finally {
      setSeeding(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addTask = useCallback(async () => {
    const title = newTask.trim();
    if (!title) return;
    setTaskError(null);
    try {
      const row = await insertTask(title, today);
      setTasks((list) => [...list, row]);
      setNewTask('');
    } catch (e) {
      setTaskError(e instanceof Error ? e.message : 'Could not add the task.');
    }
  }, [newTask, today]);

  const cycleAssignment = useCallback(async (a: Assignment, next: Assignment['status']) => {
    setAsgError(null);
    const prev = a.status;
    setAssignments((list) => list.map((x) => (x.id === a.id ? { ...x, status: next } : x)));
    try {
      await setAssignmentStatus(a.id, next);
    } catch (e) {
      setAssignments((list) => list.map((x) => (x.id === a.id ? { ...x, status: prev } : x)));
      setAsgError(e instanceof Error ? e.message : 'Could not update the assignment.');
    }
  }, []);

  const showNudge = phone.paired === false && !nudgeDismissed;
  const openTasks = tasks.filter((t) => !t.done).length;

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-4 py-6 md:px-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink3">
          {kickerDate(today)}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-[32px] md:leading-[1.15]">
          {greetingForHour(hour)}{name ? `, ${name}` : ''}
        </h1>
      </div>
      {showNudge && (
        <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4" role="status">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-accent-soft text-accent-ink">
            <Smartphone size={18} aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[15px] font-bold">Connect your phone</span>
            <span className="text-sm text-ink2">
              See today&apos;s plan and talk to Rocky from your pocket.{' '}
              <Link to="/settings/devices" className="font-bold text-accent-ink">
                Pair a phone
              </Link>
            </span>
          </div>
          <button type="button" onClick={dismissNudge} aria-label="Dismiss" className="grid h-8 w-8 flex-none place-items-center rounded-lg text-ink3 hover:text-ink1">
            <X size={16} aria-hidden />
          </button>
        </div>
      )}
      {loadError && (
        <p role="alert" className="text-sm text-danger">{loadError}</p>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)_minmax(0,1fr)]">
        {/* Today */}
        <section aria-label="Today" className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between px-1 pb-1">
            <h2 className="text-[15px] font-bold">Today</h2>
            <Link to="/calendar" className="text-[13px] font-semibold text-accent-ink">
              Open calendar
            </Link>
          </div>
          {week.loading ? (
            <p className="px-1 py-4 text-sm text-ink3">Loading today…</p>
          ) : todayOccs.length === 0 ? (
            <div className="px-1 py-2">
              <EmptyState
                icon={CalendarX2}
                title="Nothing scheduled today"
                body="Your day is wide open. Tell Rocky about it and it lands here."
              />
              {isSeedEnabled() && (
                <button type="button" onClick={() => void seed()} disabled={seeding} className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-warning px-3 text-xs font-bold text-warning disabled:opacity-50">
                  <Sparkles size={14} aria-hidden />
                  {seeding ? 'Inserting…' : 'DEV-ONLY: insert sample events'}
                </button>
              )}
              {seedError && <span role="alert" className="mt-1 block text-xs text-danger">{seedError}</span>}
            </div>
          ) : (
            todayOccs.map((o) => {
              const isNow = nowMin >= o.startMin && nowMin < o.endMin;
              return (
                <div
                  key={o.id}
                  className="flex items-center gap-3 rounded-xl px-2 py-2.5"
                  style={{ background: isNow ? 'var(--accent-soft)' : 'transparent' }}
                >
                  <span className="tnum w-14 flex-none text-xs text-ink2">{formatClock(o.startMin)}</span>
                  <span className="h-2 w-2 flex-none rounded-full" style={{ background: `var(--${kindToken(o.kind)}-edge)` }} aria-hidden />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-semibold">{o.title}</span>
                      {isNow && (
                        <span className="flex-none rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-white">
                          Now
                        </span>
                      )}
                    </span>
                    <span className="tnum text-xs text-ink2">{formatRange(o.startMin, o.endMin)}</span>
                  </span>
                  {o.fixed ? (
                    <Lock size={15} aria-label="Fixed" className="shrink-0 text-ink3" />
                  ) : (
                    <GripVertical size={15} aria-label="Flexible" className="shrink-0 text-ink3" />
                  )}
                </div>
              );
            })
          )}
        </section>

        {/* Middle: Next up + Due soon + Tasks */}
        <div className="flex flex-col gap-5">
          <section aria-label="Next up" className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5">
            {nextUp ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.06em] text-ink2">
                    Next up · {nextUpCountdown(nextUp.startMin, nowMin)}
                  </span>
                  {nextUp.fixed && (
                    <span className="flex items-center gap-1 text-xs text-ink2">
                      <Lock size={12} aria-hidden /> Fixed
                    </span>
                  )}
                </div>
                <h2 className="text-2xl font-bold tracking-tight">{nextUp.title}</h2>
                <p className="tnum text-sm text-ink2">
                  {formatRange(nextUp.startMin, nextUp.endMin)}
                  {nextUp.subtitle ? ` · ${nextUp.subtitle}` : ''}
                </p>
                {nextUp.travelMin > 0 && (
                  <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-surface2 px-3 py-1.5 text-xs font-semibold text-ink1">
                    <Footprints size={13} aria-hidden />
                    {leaveByLabel(nextUp.startMin, nextUp.travelMin)}
                  </span>
                )}
              </>
            ) : (
              <>
                <h2 className="text-[15px] font-bold">Next up</h2>
                <p className="text-sm text-ink2">You&apos;re clear for the rest of the day.</p>
              </>
            )}
          </section>

          <section aria-label="Due soon" className="flex flex-col rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between px-1 pb-1">
              <h2 className="text-[15px] font-bold">Due soon</h2>
              <span className="text-xs text-ink3">
                {dueSoon.length === 0 ? 'nothing due' : `${dueSoon.length} assignment${dueSoon.length === 1 ? '' : 's'}`}
              </span>
            </div>
            {dueSoon.length === 0 ? (
              <p className="px-1 py-3 text-sm text-ink2">Nothing due in the next week. Enjoy it while it lasts.</p>
            ) : (
              dueSoon.map((a, i) => {
                const ms = Date.parse(a.due_at!);
                const urg = urgencyFor(ms, Date.now());
                const tone = URG_TONE[urg];
                const UrgIcon = URG_ICON[urg];
                const cls = a.class_id ? classById.get(a.class_id) : undefined;
                return (
                  <div key={a.id} className="flex items-start justify-between gap-3 px-1 py-3" style={{ borderTop: i ? '1px solid var(--line)' : '0' }}>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[15px] font-semibold">{a.title}</span>
                      {(cls || true) && (
                        <span className="truncate text-xs text-ink2">
                          {[cls?.name, cls?.code].filter(Boolean).join(' · ') || 'Assignment'}
                        </span>
                      )}
                    </span>
                    <span className="flex flex-none flex-col items-end gap-1.5">
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: tone.bg, color: tone.fg }}>
                        <UrgIcon size={12} aria-hidden />
                        {dueChipLabel(a.due_at!, Date.now())}
                      </span>
                      <select
                        value={a.status}
                        onChange={(e) => void cycleAssignment(a, e.target.value as Assignment['status'])}
                        aria-label={`Status for ${a.title}`}
                        className="h-9 rounded-lg border border-line bg-surface px-2 text-[13px] font-semibold text-ink1 outline-none focus:border-accent"
                      >
                        {ASG_STATUS.map((s) => (
                          <option key={s} value={s}>{ASG_LABEL[s]}</option>
                        ))}
                      </select>
                    </span>
                  </div>
                );
              })
            )}
            {asgError && <span role="alert" className="px-1 text-xs text-danger">{asgError}</span>}
          </section>

          <section aria-label="Today's tasks" className="flex flex-col rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between px-1 pb-1">
              <h2 className="text-[15px] font-bold">Today&apos;s tasks</h2>
              <span className="text-xs text-ink3">{openTasks} open</span>
            </div>
            {tasks.map((t) => {
              const cls = t.class_id ? classById.get(t.class_id) : undefined;
              return (
                <div key={t.id} className="flex items-center gap-3 px-1 py-1.5">
                  <div className="min-w-0 flex-1">
                    <TaskRow task={t} onChanged={(next) => setTasks((list) => list.map((x) => (x.id === next.id ? next : x)))} />
                  </div>
                  {cls && (
                    <span className="tnum flex-none text-xs text-ink3">{cls.code ?? cls.name}</span>
                  )}
                </div>
              );
            })}
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-dashed border-line px-3">
              <Plus size={14} aria-hidden className="shrink-0 text-ink3" />
              <input
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void addTask();
                }}
                placeholder="Add a task, press Enter"
                aria-label="Add a task for today"
                className="h-11 w-full bg-transparent text-sm text-ink1 outline-none placeholder:text-ink4"
              />
            </div>
            {taskError && <span role="alert" className="px-1 pt-1 text-xs text-danger">{taskError}</span>}
            {tasks.length === 0 && (
              <p className="px-1 pt-2 text-sm text-ink2">No tasks for today yet.</p>
            )}
          </section>
        </div>

        {/* Right: This week + Recent + Memory */}
        <div className="flex flex-col gap-5">
          <section aria-label="This week" className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-[15px] font-bold">This week</h2>
              <span className="flex items-center gap-1.5 text-xs text-ink2">
                <span className="h-[7px] w-[7px] rounded-full bg-danger" aria-hidden /> Deadline
              </span>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map((d, i) => {
                const count = week.byDate.get(d)?.length ?? 0;
                const isToday = d === today;
                return (
                  <div
                    key={d}
                    className="flex flex-col items-center gap-1 rounded-lg py-1.5"
                    style={{ background: isToday ? 'var(--accent-soft)' : 'transparent' }}
                  >
                    <span className="text-[11px] font-semibold text-ink3">{DAY_SHORT[i]}</span>
                    <span className="tnum text-lg font-bold" style={{ color: isToday ? 'var(--accent-ink)' : 'var(--ink1)' }}>
                      {Number(d.slice(8))}
                    </span>
                    <span className="flex h-8 items-end gap-[3px]" aria-label={`${count} events`}>
                      {count === 0 ? (
                        <span className="mb-3 h-[3px] w-5 rounded-full bg-line" aria-hidden />
                      ) : (
                        Array.from({ length: Math.min(6, count) }).map((_, b) => (
                          <span
                            key={b}
                            aria-hidden
                            className="w-[3px] rounded-full"
                            style={{ height: 10 + ((b * 7) % 18), background: isToday ? 'var(--accent)' : 'var(--ink4)' }}
                          />
                        ))
                      )}
                    </span>
                    <span className="h-[7px]" aria-hidden>
                      {dueDates.has(d) && <span className="block h-[7px] w-[7px] rounded-full bg-danger" />}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section aria-label="Recent voice commands" className="flex flex-col rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between px-1 pb-1">
              <h2 className="text-[15px] font-bold">Recent voice commands</h2>
              <Link to="/activity" className="text-[13px] font-semibold text-accent-ink">Activity</Link>
            </div>
            {commands.length === 0 ? (
              <div className="px-1 py-1">
                <EmptyState icon={History} title="No commands yet" body="Talk to Rocky and the conversation shows up here." />
              </div>
            ) : (
              commands.map((c) => {
                const st = commandStatus(c);
                const text = (c.transcript ?? c.text ?? '').trim() || '(voice message)';
                const when = new Date(c.created_at);
                return (
                  <div key={c.id} className="flex items-center gap-2.5 px-1 py-2">
                    <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-surface2 text-ink2">
                      {c.source === 'phone' ? <Smartphone size={15} aria-hidden /> : <Laptop size={15} aria-hidden />}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">“{text}”</span>
                      <span className="truncate text-xs text-ink2">
                        {formatClock(when.getHours() * 60 + when.getMinutes())} · {c.reply_text ?? (c.status === 'done' ? 'Done' : 'Working…')}
                      </span>
                    </span>
                    <span className="flex-none rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: st.tone === 'success' ? 'var(--success-soft)' : st.tone === 'danger' ? 'var(--danger-soft)' : 'var(--accent-soft)', color: st.tone === 'success' ? 'var(--success)' : st.tone === 'danger' ? 'var(--danger)' : 'var(--accent-ink)' }}>
                      {st.label}
                    </span>
                  </div>
                );
              })
            )}
          </section>

          <section aria-label="Memory" className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-[15px] font-bold">Memory</h2>
              <span className="flex items-center gap-1.5 text-xs text-ink3">
                <span className="h-[7px] w-[7px] rounded-full bg-ink4" aria-hidden /> Recording off
              </span>
            </div>
            <button
              type="button"
              onClick={() => navigate('/memory')}
              className="flex items-center gap-2.5 rounded-xl border border-line bg-surface2 px-3.5 py-3 text-left"
            >
              <History size={15} aria-hidden className="shrink-0 text-ink3" />
              <span className="min-w-0 flex-1 truncate text-sm text-ink2">What was I reading on Wednesday?</span>
              <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-accent text-white">
                <Mic size={15} aria-hidden />
              </span>
            </button>
            <span className="flex items-center gap-1.5 px-1 text-xs text-ink3">
              <Lock size={11} aria-hidden /> Only on this laptop. Nothing is uploaded.
            </span>
          </section>
        </div>
      </div>
      <DemoBadge />
    </div>
  );
}
