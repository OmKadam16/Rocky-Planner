import type { LocalNow } from "../dates";
import type { Occurrence, Priority } from "../types";
import type { ScheduleSettings } from "./types";

export interface Interval {
  start: number;
  end: number;
}

/** Time an item blocks: its travel buffer before it, plus the settings buffer after it. */
export function busyInterval(o: Pick<Occurrence, "startMin" | "endMin" | "travelMin">, bufferMin: number): Interval {
  return { start: o.startMin - o.travelMin, end: o.endMin + bufferMin };
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, med: 1, low: 2 };

/** Higher priority first, then earlier start. */
export function byPriority(a: Occurrence, b: Occurrence): number {
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.startMin - b.startMin;
}

/** 0 morning (< 12:00), 1 afternoon (< 17:00), 2 evening. */
export function partOfDay(minute: number): number {
  return minute < 720 ? 0 : minute < 1020 ? 1 : 2;
}

/** Penalty (in minutes of distance) for landing in a different part of the day. */
const PART_OF_DAY_PENALTY = 180;

/**
 * The window Rocky may auto-place into on `date`: waking hours, never in the past,
 * starting at the next quarter hour when the date is today.
 */
export function placementWindow(date: string, now: LocalNow, s: ScheduleSettings): Interval {
  const end = s.sleepMin > s.wakeMin ? s.sleepMin : 1440;
  if (date < now.date) return { start: end, end };
  const start = date === now.date ? Math.max(s.wakeMin, Math.ceil(now.minute / 15) * 15) : s.wakeMin;
  return { start, end };
}

export interface SlotRequest {
  durationMin: number;
  travelMin: number;
  preferredStart: number;
  /** Busy intervals of everything else on that day (see busyInterval). */
  busy: Interval[];
  window: Interval;
  bufferMin: number;
}

/**
 * Start minute of the free slot nearest to `preferredStart`, preferring the same part of the day.
 * Ties go to the later slot (pushing things later feels more natural than earlier). null if nothing fits.
 */
export function findSlot(r: SlotRequest): number | null {
  const sorted = [...r.busy].sort((a, b) => a.start - b.start);
  const gaps: Interval[] = [];
  let cursor = r.window.start;
  const limit = r.window.end + r.bufferMin;
  for (const b of sorted) {
    if (b.end <= cursor) continue;
    if (b.start >= limit) break;
    if (b.start > cursor) gaps.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < limit) gaps.push({ start: cursor, end: limit });

  let best: { start: number; score: number } | null = null;
  for (const g of gaps) {
    const lo = g.start + r.travelMin;
    const hi = Math.min(g.end - r.bufferMin, r.window.end) - r.durationMin;
    if (lo > hi) continue;
    const start = Math.min(Math.max(r.preferredStart, lo), hi);
    const score = Math.abs(start - r.preferredStart) + (partOfDay(start) === partOfDay(r.preferredStart) ? 0 : PART_OF_DAY_PENALTY);
    if (!best || score < best.score || (score === best.score && start > best.start)) best = { start, score };
  }
  return best ? best.start : null;
}
