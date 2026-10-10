// Dashboard: greeting, today timeline, Next up, Due soon, Today's tasks,
// Recent commands. All real data (Supabase rows + core expandEvents); honest
// empty states, no hard-coded personal data.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  CalendarDays,
  CalendarX2,
  CheckCircle2,
  ChevronRight,
  History,
  Laptop,
  ListTodo,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';
import type { Assignment, Command, Task } from '@rocky/core';
import type { Profile } from '@rocky/core';
import {
  insertSampleEvents,
  isSeedEnabled,
  nowMinutesLocal,
  todayLocal,
  useOccurrences,
} from '../lib/remote';
import {
  fetchOpenAssignments,
  fetchRecentCommands,
  fetchTasksForDate,
  readProfile,
} from '../lib/queries';
import { displayNameFor } from '../lib/profile';
import {
  dueLabel,
  dueSoonAssignments,
  greetingForHour,
  nextUpOccurrence,
} from '../lib/dashboard';
import { usePhonePaired } from '../lib/useDevices';
import { useSession } from '../lib/auth';
import { Card, CardTitle, EmptyState, PageHeader } from '../components/Page';
import { OccurrenceRow } from '../components/OccurrenceRow';
import { TaskRow } from '../components/TaskRow';
import { StatusBadge } from '../components/StatusBadge';
import { DemoBadge } from '../components/DemoBadge';

const PAIR_NUDGE_KEY = 'rocky.pairNudgeDismissed';

function commandStatus(cmd: Command): { tone: 'success' | 'accent' | 'danger'; label: string } {
  if (cmd.status === 'done') return { tone: 'success', label: 'Done' };
  if (cmd.status === 'error') return { tone: 'danger', label: 'Error' };
  return { tone: 'accent', label: 'Working…' };
}

export function DashboardPage() {
  const today = useMemo(() => todayLocal(), []);
  const nowMin = useMemo(() => nowMinutesLocal(), []);
  const hour = useMemo(() => new Date().getHours(), []);
  const { user } = useSession();
  const phone = usePhonePaired(true);
  const day = useOccurrences(today, today, true);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [commands, setCommands] = useState<Command[]>([]);
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [nudgeDismissed, setNudgeDismissed] = useState(() => {
    try {
      return localStorage.getItem(PAIR_NUDGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let alive = true;
    void readProfile().then((p) => {
      if (alive) setProfile(p);
    });
    void fetchTasksForDate(today)
      .then((t) => alive && setTasks(t))
      .catch((e: unknown) => alive && setTasksError(e instanceof Error ? e.message : 'Could not load tasks.'));
    void fetchOpenAssignments().then((a) => {
      if (alive) setAssignments(a);
    });
    void fetchRecentCommands(5).then((c) => {
      if (alive) setCommands(c);
    });
    return () => {
      alive = false;
    };
  }, [today]);

  const name = displayNameFor(profile?.display_name, profile?.full_name, user?.email ?? null);
  const nextUp = useMemo(() => nextUpOccurrence(day.occurrences, nowMin), [day.occurrences, nowMin]);
  const dueSoon = useMemo(
    () => dueSoonAssignments(assignments, Date.now()).slice(0, 5),
    [assignments],
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
      day.refetch();
    } catch (e) {
      setSeedError(e instanceof Error ? e.message : 'Could not insert sample events.');
    } finally {
      setSeeding(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showNudge = phone.paired === false && !nudgeDismissed;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8">
      <PageHeader
        title={`${greetingForHour(hour)}${name ? `, ${name}` : ''}`}
        sub={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        actions={
          <Link
            to="/calendar"
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-line bg-surface px-4 text-sm font-bold text-ink1"
          >
            <CalendarDays size={16} aria-hidden />
            Open calendar
          </Link>
        }
      />

      {showNudge && (
        <div
          className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4"
          role="status"
        >
          <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-accent-soft text-accent-ink">
            <Smartphone size={18} aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[15px] font-bold">Connect your phone</span>
            <span className="text-sm text-ink2">
              See today&apos;s plan and talk to Rocky from your pocket.
            </span>
            <Link to="/settings/devices" className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-accent-ink">
              Pair a phone <ChevronRight size={15} aria-hidden />
            </Link>
          </div>
          <button
            type="button"
            onClick={dismissNudge}
            aria-label="Dismiss"
            className="grid h-8 w-8 flex-none place-items-center rounded-lg text-ink3 hover:text-ink1"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card labelledBy="dash-today">
            <CardTitle id="dash-today">Today&apos;s timeline</CardTitle>
            {day.loading ? (
              <p className="text-sm text-ink3">Loading today…</p>
            ) : day.error ? (
              <p role="alert" className="text-sm text-danger">{day.error}</p>
            ) : day.occurrences.length === 0 ? (
              <EmptyState
                icon={CalendarX2}
                title="Nothing scheduled today"
                body="Your day is wide open. New events appear here when you add them or tell Rocky about them."
              />
            ) : (
              <div className="flex flex-col gap-2">
                {day.occurrences.map((o) => (
                  <OccurrenceRow key={o.id} occ={o} nowMin={nowMin} />
                ))}
              </div>
            )}
            {isSeedEnabled() && (
              <div className="flex flex-col gap-1.5 border-t border-dashed border-warning pt-3">
                <button
                  type="button"
                  onClick={() => void seed()}
                  disabled={seeding}
                  className="inline-flex h-9 items-center gap-2 self-start rounded-lg border border-warning px-3 text-xs font-bold text-warning disabled:opacity-50"
                >
                  <Sparkles size={14} aria-hidden />
                  {seeding ? 'Inserting…' : 'DEV-ONLY: insert sample events'}
                </button>
                {seedError && (
                  <span role="alert" className="text-xs text-danger">{seedError}</span>
                )}
              </div>
            )}
          </Card>

          <Card labelledBy="dash-next">
            <CardTitle id="dash-next">Next up</CardTitle>
            {nextUp ? (
              <OccurrenceRow occ={nextUp} nowMin={nowMin} />
            ) : (
              <p className="text-sm text-ink2">You&apos;re clear for the rest of the day.</p>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card labelledBy="dash-due">
            <CardTitle id="dash-due">Due soon</CardTitle>
            {dueSoon.length === 0 ? (
              <p className="text-sm text-ink2">Nothing due in the next week. Enjoy it while it lasts.</p>
            ) : (
              <ul className="flex list-none flex-col gap-1 p-0">
                {dueSoon.map((a) => (
                  <li key={a.id} className="flex items-center gap-2.5 rounded-xl px-2 py-2">
                    <CheckCircle2 size={16} aria-hidden className="shrink-0 text-ink3" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.title}</span>
                    <span className="shrink-0 text-xs font-semibold text-ink2">
                      {dueLabel(a.due_at!, Date.now())}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card labelledBy="dash-tasks">
            <div className="flex items-center justify-between gap-2">
              <CardTitle id="dash-tasks">Today&apos;s tasks</CardTitle>
              <Link to="/tasks" className="inline-flex items-center gap-1 text-xs font-bold text-accent-ink">
                All tasks <ChevronRight size={13} aria-hidden />
              </Link>
            </div>
            {tasksError ? (
              <p role="alert" className="text-sm text-danger">{tasksError}</p>
            ) : tasks.length === 0 ? (
              <EmptyState
                icon={ListTodo}
                title="No tasks for today"
                body="Add tasks from the Tasks page. They show up here every morning."
              />
            ) : (
              <div className="flex flex-col gap-0.5">
                {tasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    onChanged={(next) =>
                      setTasks((list) => list.map((x) => (x.id === next.id ? next : x)))
                    }
                  />
                ))}
              </div>
            )}
          </Card>

          <Card labelledBy="dash-recent">
            <CardTitle id="dash-recent">Recent commands</CardTitle>
            {commands.length === 0 ? (
              <EmptyState
                icon={History}
                title="No commands yet"
                body="Talk to Rocky from the laptop or your phone and the conversation shows up here."
              />
            ) : (
              <ul className="flex list-none flex-col gap-2 p-0">
                {commands.map((c) => {
                  const st = commandStatus(c);
                  const text = (c.transcript ?? c.text ?? '').trim() || '(voice message)';
                  return (
                    <li key={c.id} className="flex items-start gap-2.5 rounded-xl bg-surface2 px-3 py-2.5">
                      {c.source === 'phone' ? (
                        <Smartphone size={15} aria-hidden className="mt-0.5 shrink-0 text-ink3" />
                      ) : (
                        <Laptop size={15} aria-hidden className="mt-0.5 shrink-0 text-ink3" />
                      )}
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate text-sm font-medium">{text}</span>
                        {c.reply_text && (
                          <span className="truncate text-xs text-ink2">{c.reply_text}</span>
                        )}
                      </span>
                      <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
      <DemoBadge />
    </div>
  );
}
