// Dashboard derivations — pure functions over core rows (tested below).
// Data fetching lives in queries.ts; core expandEvents builds occurrences.

import type { Assignment, Occurrence } from '@rocky/core';

export function greetingForHour(hour: number): 'Good morning' | 'Good afternoon' | 'Good evening' {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** First occurrence that has not ended yet (occurrences must be same-day). */
export function nextUpOccurrence(occs: Occurrence[], nowMin: number): Occurrence | null {
  const upcoming = occs
    .filter((o) => o.endMin > nowMin)
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  return upcoming[0] ?? null;
}

const DUE_SOON_MS = 7 * 24 * 60 * 60 * 1000;

/** Open assignments due within the horizon (overdue first), oldest due first. */
export function dueSoonAssignments(
  assignments: Assignment[],
  nowMs: number,
  horizonMs: number = DUE_SOON_MS,
): Assignment[] {
  return assignments
    .filter((a) => {
      if (a.status === 'done' || !a.due_at) return false;
      const ms = Date.parse(a.due_at);
      if (Number.isNaN(ms)) return false;
      return ms <= nowMs + horizonMs;
    })
    .sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!));
}

/** "Overdue" / "Due today" / "Due tomorrow" / "Due Mon, Oct 13". */
export function dueLabel(dueAt: string, nowMs: number = Date.now()): string {
  const ms = Date.parse(dueAt);
  if (Number.isNaN(ms)) return '';
  const sameDay = (x: Date, y: Date) =>
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate();
  const due = new Date(ms);
  const now = new Date(nowMs);
  if (ms < nowMs && !sameDay(due, now)) return 'Overdue';
  if (sameDay(due, now)) return ms < nowMs ? 'Overdue' : 'Due today';
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (sameDay(due, tomorrow)) return 'Due tomorrow';
  return `Due ${due.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`;
}
