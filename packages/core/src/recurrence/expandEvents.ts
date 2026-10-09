import { addDays, daysBetween, toDayNumber, weekdayOf } from "../dates";
import type { EventException, EventRow, Occurrence } from "../types";

export function occurrenceId(eventId: string, occurrenceDate: string): string {
  return `${eventId}:${occurrenceDate}`;
}

/** Stable identity across re-expansion: one-off events are matched by event id because their date can change. */
export function occurrenceKey(o: Pick<Occurrence, "eventId" | "occurrenceDate" | "recurring">): string {
  return o.recurring ? occurrenceId(o.eventId, o.occurrenceDate) : o.eventId;
}

export function isRecurring(e: Pick<EventRow, "repeat_freq">): boolean {
  return e.repeat_freq !== "none";
}

/** True when `date` is an occurrence date of the series (ignoring exceptions). */
export function occursOn(e: EventRow, date: string): boolean {
  if (toDayNumber(date) < toDayNumber(e.event_date)) return false;
  if (e.repeat_until && toDayNumber(date) > toDayNumber(e.repeat_until)) return false;
  switch (e.repeat_freq) {
    case "none":
      return date === e.event_date;
    case "daily":
      return true;
    case "weekly": {
      const days = e.repeat_days && e.repeat_days.length > 0 ? e.repeat_days : [weekdayOf(e.event_date)];
      return days.includes(weekdayOf(date));
    }
  }
}

export function baseOccurrence(e: EventRow, occurrenceDate: string): Occurrence {
  return {
    id: occurrenceId(e.id, occurrenceDate),
    eventId: e.id,
    occurrenceDate,
    date: occurrenceDate,
    startMin: e.start_min,
    endMin: e.end_min,
    title: e.title,
    subtitle: e.subtitle,
    kind: e.kind,
    fixed: e.fixed,
    priority: e.priority,
    travelMin: e.travel_min,
    classId: e.class_id,
    recurring: isRecurring(e),
    moved: false,
    event: e,
  };
}

function applyException(o: Occurrence, ex: EventException | undefined): Occurrence | null {
  if (!ex) return o;
  if (ex.kind === "skip") return null;
  const date = ex.new_date ?? o.date;
  const startMin = ex.new_start_min ?? o.startMin;
  const endMin = ex.new_end_min ?? o.endMin;
  return { ...o, date, startMin, endMin, moved: date !== o.occurrenceDate || startMin !== o.event.start_min || endMin !== o.event.end_min };
}

/**
 * Expands events into dated occurrences whose final date is within [from, to] (inclusive),
 * applying skip/move exceptions. Sorted by date, then start time.
 */
export function expandEvents(events: EventRow[], exceptions: EventException[], from: string, to: string): Occurrence[] {
  const span = daysBetween(from, to);
  if (span < 0) return [];

  const exByKey = new Map<string, EventException>();
  for (const ex of exceptions) exByKey.set(occurrenceId(ex.event_id, ex.occurrence_date), ex);

  const out: Occurrence[] = [];
  const fromDay = toDayNumber(from);
  const toDay = toDayNumber(to);
  const inRange = (date: string) => {
    const d = toDayNumber(date);
    return d >= fromDay && d <= toDay;
  };

  for (const e of events) {
    // Occurrences whose series date is in range (they may move out).
    for (let i = 0; i <= span; i++) {
      const date = addDays(from, i);
      if (!occursOn(e, date)) continue;
      const o = applyException(baseOccurrence(e, date), exByKey.get(occurrenceId(e.id, date)));
      if (o && inRange(o.date)) out.push(o);
    }
  }

  // Occurrences moved into the range from a series date outside it.
  const byId = new Map(events.map((e) => [e.id, e]));
  for (const ex of exceptions) {
    if (ex.kind !== "move" || !ex.new_date || inRange(ex.occurrence_date) || !inRange(ex.new_date)) continue;
    const e = byId.get(ex.event_id);
    if (!e || !occursOn(e, ex.occurrence_date)) continue;
    const o = applyException(baseOccurrence(e, ex.occurrence_date), ex);
    if (o) out.push(o);
  }

  return sortOccurrences(out);
}

export function sortOccurrences(list: Occurrence[]): Occurrence[] {
  return list.sort((a, b) => toDayNumber(a.date) - toDayNumber(b.date) || a.startMin - b.startMin || a.endMin - b.endMin || a.title.localeCompare(b.title));
}
