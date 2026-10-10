// Classes: real class rows + their next open assignment. Read-only for now —
// the add/edit class dialog lands in the next build.

import { useEffect, useMemo, useState } from 'react';
import { GraduationCap, PencilLine } from 'lucide-react';
import type { Assignment, ClassRow } from '@rocky/core';
import { fetchClasses, fetchOpenAssignments } from '../lib/queries';
import { dueLabel } from '../lib/dashboard';
import { minutesToHHmm } from '../lib/remote';
import { Card, EmptyState, PageHeader } from '../components/Page';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function scheduleText(c: ClassRow): string {
  const days = [...c.meeting_days].sort((a, b) => a - b).map((d) => DAY_SHORT[d] ?? '');
  const time =
    c.start_min != null && c.end_min != null
      ? `${minutesToHHmm(c.start_min)}–${minutesToHHmm(c.end_min)}`
      : null;
  if (days.length === 0 && !time) return 'No weekly schedule yet';
  if (days.length === 0) return time!;
  return time ? `${days.join(' · ')} · ${time}` : days.join(' · ');
}

export function ClassesPage() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchClasses(), fetchOpenAssignments()])
      .then(([c, a]) => {
        if (!alive) return;
        setClasses(c);
        setAssignments(a);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'Could not load classes.');
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const nextByClass = useMemo(() => {
    const map = new Map<string, Assignment>();
    for (const a of assignments) {
      if (!a.class_id || !a.due_at) continue;
      const prev = map.get(a.class_id);
      if (!prev || !prev.due_at || Date.parse(a.due_at) < Date.parse(prev.due_at)) {
        map.set(a.class_id, a);
      }
    }
    return map;
  }, [assignments]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8">
      <PageHeader
        title="Classes"
        sub="Each class with a weekly schedule becomes a locked block on your calendar."
      />
      {loading ? (
        <p className="text-sm text-ink3">Loading classes…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-danger">{error}</p>
      ) : classes.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No classes yet"
          body="Add your courses and Rocky locks their meeting times on the calendar so nothing ever double-books them."
        />
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2">
          {classes.map((c) => {
            const next = nextByClass.get(c.id);
            const meta = [c.code, c.professor, c.category, c.semester].filter(Boolean).join(' · ');
            return (
              <Card key={c.id}>
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-cls-bg text-cls-fg">
                    <GraduationCap size={18} aria-hidden />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[16px] font-bold">{c.name}</span>
                    {meta && <span className="truncate text-xs text-ink2">{meta}</span>}
                    <span className="tnum text-xs font-semibold text-ink3">{scheduleText(c)}</span>
                  </div>
                </div>
                <div className="rounded-xl bg-surface2 px-3 py-2.5 text-sm">
                  {next?.due_at ? (
                    <span>
                      <span className="font-semibold">Next up: {next.title}</span>{' '}
                      <span className="text-ink2">· {dueLabel(next.due_at)}</span>
                    </span>
                  ) : (
                    <span className="text-ink2">No open assignments.</span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <p className="flex items-start gap-2 text-sm text-ink3">
        <PencilLine size={15} aria-hidden className="mt-0.5 shrink-0" />
        Adding and editing classes lands in the next build. Class meeting times sync to locked calendar blocks automatically.
      </p>
    </div>
  );
}
