// Test fixtures (not exported from the package index).
import { expandEvents } from "./recurrence/expandEvents";
import { DEFAULT_SETTINGS, type ScheduleSettings, type ScheduleState } from "./scheduler/types";
import type { EventException, EventRow } from "./types";

let seq = 0;

export function ev(p: Partial<EventRow> & Pick<EventRow, "title" | "event_date" | "start_min" | "end_min">): EventRow {
  return {
    id: p.id ?? `e${++seq}`,
    user_id: "u1",
    subtitle: null,
    kind: p.fixed ? "commitment" : "personal",
    fixed: false,
    priority: "med",
    travel_min: 0,
    class_id: null,
    repeat_freq: "none",
    repeat_days: null,
    repeat_until: null,
    created_at: "2026-10-01T00:00:00Z",
    ...p,
  };
}

export function ex(p: Partial<EventException> & Pick<EventException, "event_id" | "occurrence_date" | "kind">): EventException {
  return {
    id: `x${++seq}`,
    user_id: "u1",
    new_date: null,
    new_start_min: null,
    new_end_min: null,
    created_at: "2026-10-01T00:00:00Z",
    ...p,
  };
}

export function stateOf(
  events: EventRow[],
  exceptions: EventException[] = [],
  range: { from: string; to: string } = { from: "2026-10-12", to: "2026-10-19" },
  settings: Partial<ScheduleSettings> = {},
): ScheduleState {
  return { occurrences: expandEvents(events, exceptions, range.from, range.to), range, settings: { ...DEFAULT_SETTINGS, ...settings } };
}

export const h = (hh: number, mm = 0) => hh * 60 + mm;

export function ids(): () => string {
  let n = 0;
  return () => `new-${++n}`;
}
