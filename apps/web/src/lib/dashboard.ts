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
export function dueLabel(dueAt: string, nowMs: number = Date.now()): string {  const ms = Date.parse(dueAt);
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

// --- Next-up + Due-soon presentation (Dashboard cards, design-matched) ---

/** "NOW" / "IN 25 MIN" / "IN 1H 48M" for the Next-up kicker. */
export function nextUpCountdown(startMin: number, nowMin: number): string {
  const diff = startMin - nowMin;
  if (diff <= 0) return 'NOW';
  if (diff < 60) return `IN ${diff} MIN`;
  return `IN ${Math.floor(diff / 60)}H ${diff % 60}M`;
}

/** Phone NEXT pill: "in 18 min" / "in 1h 48m" / "now". */
export function nextUpCountdownShort(startMin: number, nowMin: number): string {
  const diff = startMin - nowMin;
  if (diff <= 0) return 'now';
  if (diff < 60) return `in ${diff} min`;
  return `in ${Math.floor(diff / 60)}h ${diff % 60}m`;
}

function h12mm(date: Date): string {
  const h24 = date.getHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const suffix = h24 < 12 ? 'AM' : 'PM';
  return `${h12}:${String(date.getMinutes()).padStart(2, '0')} ${suffix}`;
}

/** Minutes since midnight → "9:00 AM" (Today-list time column). */
export function formatClock(min: number): string {
  const h24 = Math.floor(min / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const suffix = h24 < 12 ? 'AM' : 'PM';
  return `${h12}:${String(min % 60).padStart(2, '0')} ${suffix}`;
}

/** "Leave by 12:15 · 15 min walk" for events with a travel buffer. */
export function leaveByLabel(startMin: number, travelMin: number): string {
  const leave = startMin - travelMin;
  const h24 = Math.floor(leave / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `Leave by ${h12}:${String(leave % 60).padStart(2, '0')} · ${travelMin} min walk`;
}

export type Urgency = 'danger' | 'warning' | 'neutral';

/**
 * Chip urgency: due today/overdue danger, within 3 days warning, else
 * neutral. Color is never the only signal — the chip always has text.
 */
export function urgencyFor(dueMs: number, nowMs: number): Urgency {
  const due = new Date(dueMs);
  const now = new Date(nowMs);
  const same =
    due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth() &&
    due.getDate() === now.getDate();
  if (same || dueMs < nowMs) return 'danger';
  if (dueMs - nowMs <= 3 * 24 * 60 * 60 * 1000) return 'warning';
  return 'neutral';
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Tonight 11:59 PM" / "Overdue" / "Mon, Oct 12" (locale-independent). */
export function dueChipLabel(dueAt: string, nowMs: number = Date.now()): string {
  const ms = Date.parse(dueAt);
  if (Number.isNaN(ms)) return '';
  const due = new Date(ms);
  const now = new Date(nowMs);
  const same =
    due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth() &&
    due.getDate() === now.getDate();
  if (same) return ms < nowMs ? 'Overdue' : `Tonight ${h12mm(due)}`;
  if (ms < nowMs) return 'Overdue';
  return `${DOW[due.getDay()]}, ${MON[due.getMonth()]} ${due.getDate()}`;
}
