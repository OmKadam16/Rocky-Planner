// Tasks: real task rows grouped by day, with working Done checkboxes.
// Adding tasks lands in the next build.

import { useEffect, useMemo, useState } from 'react';
import { ListTodo, Plus } from 'lucide-react';
import { addDays } from '@rocky/core';
import type { Task } from '@rocky/core';
import { fetchTasksRange } from '../lib/queries';
import { todayLocal } from '../lib/remote';
import { Card, CardTitle, EmptyState, PageHeader } from '../components/Page';
import { TaskRow } from '../components/TaskRow';

function dayLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDays(today, 1)) return 'Tomorrow';
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y!, m! - 1, d).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

export function TasksPage() {
  const today = useMemo(() => todayLocal(), []);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchTasksRange(today, addDays(today, 7))
      .then((t) => {
        if (!alive) return;
        setTasks(t);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'Could not load tasks.');
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [today]);

  const groups = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      const list = map.get(t.task_date) ?? [];
      list.push(t);
      map.set(t.task_date, list);
    }
    return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  }, [tasks]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-8">
      <PageHeader title="Tasks" sub="Today plus the next seven days." />
      {loading ? (
        <p className="text-sm text-ink3">Loading tasks…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-danger">{error}</p>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="No tasks this week"
          body="Tasks you add show up here, grouped by day, with a checkbox to mark them done."
        />
      ) : (
        groups.map(([date, list]) => (
          <Card key={date} labelledBy={`tasks-${date}`}>
            <CardTitle id={`tasks-${date}`}>{dayLabel(date, today)}</CardTitle>
            <div className="flex flex-col gap-0.5">
              {list.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onChanged={(next) =>
                    setTasks((all) => all.map((x) => (x.id === next.id ? next : x)))
                  }
                />
              ))}
            </div>
          </Card>
        ))
      )}
      <p className="flex items-start gap-2 text-sm text-ink3">
        <Plus size={15} aria-hidden className="mt-0.5 shrink-0" />
        Adding tasks lands in the next build. Voice commands (“add a task…”) create them once the brain is running.
      </p>
    </div>
  );
}
