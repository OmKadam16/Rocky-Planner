import { occurrenceKey, sortOccurrences, expandEvents } from "../recurrence/expandEvents";
import type { EventRow, Occurrence } from "../types";
import type { Change, Diff, Mutation, ScheduleState } from "./types";

export const emptyDiff = (): Diff => ({ changes: [], unscheduled: [] });

export function isEmptyDiff(d: Diff): boolean {
  return d.changes.length === 0;
}

/** The diff that undoes `d`. */
export function invertDiff(d: Diff): Diff {
  const changes = [...d.changes].reverse().map((c): Change => {
    switch (c.op) {
      case "add":
        return { op: "remove", scope: c.scope, before: c.after };
      case "remove":
        return { op: "add", scope: c.scope, after: c.before };
      case "move":
        return { op: "move", scope: c.scope, before: c.after, after: c.before };
    }
  });
  return { changes, unscheduled: [] };
}

const sameSlot = (a: Occurrence, b: Occurrence) => a.date === b.date && a.startMin === b.startMin && a.endMin === b.endMin;

/**
 * True when every `before` in the diff still matches the state, so applying it is safe.
 * Used before undo: if the user edited things since, we ask instead of clobbering.
 */
export function diffApplies(state: ScheduleState, d: Diff): boolean {
  const inRange = (date: string) => date >= state.range.from && date <= state.range.to;
  for (const c of d.changes) {
    if (c.op === "add") {
      const taken = c.scope === "series"
        ? state.occurrences.some((o) => o.eventId === c.after.eventId)
        : state.occurrences.some((o) => occurrenceKey(o) === occurrenceKey(c.after));
      if (taken) return false;
      continue;
    }
    // Series edits: we only know the event still exists if one of its occurrences is in view.
    if (c.scope === "series") continue;
    const cur = state.occurrences.find((o) => occurrenceKey(o) === occurrenceKey(c.before));
    if (cur ? !sameSlot(cur, c.before) : inRange(c.before.date)) return false;
  }
  return true;
}

/** Applies a diff to an in-memory state (pure; returns a new state). */
export function applyDiff(state: ScheduleState, d: Diff): ScheduleState {
  let list = [...state.occurrences];
  for (const c of d.changes) {
    if (c.scope === "series") {
      const eventId = c.op === "add" ? c.after.eventId : c.before.eventId;
      const old = list.filter((o) => o.eventId === eventId);
      list = list.filter((o) => o.eventId !== eventId);
      if (c.op === "add") {
        list.push(...expandEvents([c.after.event], [], state.range.from, state.range.to));
      } else if (c.op === "move") {
        const ev = c.after.event;
        for (const o of old) {
          // Occurrences moved by an exception keep their own slot.
          list.push(o.moved ? { ...o, event: ev } : { ...o, startMin: ev.start_min, endMin: ev.end_min, event: ev });
        }
      }
      continue;
    }
    if (c.op === "add") {
      list.push(c.after);
    } else if (c.op === "remove") {
      const key = occurrenceKey(c.before);
      list = list.filter((o) => occurrenceKey(o) !== key);
    } else {
      const key = occurrenceKey(c.before);
      list = list.filter((o) => occurrenceKey(o) !== key);
      list.push(c.after);
    }
  }
  return { ...state, occurrences: sortOccurrences(list) };
}

/** Exception row that puts a recurring occurrence where `o` says (or clears it when back on the series slot). */
function exceptionFor(o: Occurrence): Mutation {
  const ev = o.event;
  if (o.date === o.occurrenceDate && o.startMin === ev.start_min && o.endMin === ev.end_min) {
    return { table: "event_exceptions", op: "delete", eventId: o.eventId, occurrenceDate: o.occurrenceDate };
  }
  return {
    table: "event_exceptions",
    op: "upsert",
    row: {
      event_id: o.eventId,
      occurrence_date: o.occurrenceDate,
      kind: "move",
      new_date: o.date,
      new_start_min: o.startMin,
      new_end_min: o.endMin,
    },
  };
}

function insertRow(e: EventRow): Mutation {
  const { created_at: _created, user_id, ...rest } = e;
  return { table: "events", op: "insert", row: user_id ? { ...rest, user_id } : rest };
}

/** Translates a diff into database writes. */
export function diffToMutations(d: Diff): Mutation[] {
  const out: Mutation[] = [];
  for (const c of d.changes) {
    if (c.scope === "series") {
      if (c.op === "add") out.push(insertRow(c.after.event));
      else if (c.op === "remove") out.push({ table: "events", op: "delete", id: c.before.eventId });
      else out.push({ table: "events", op: "update", id: c.after.eventId, patch: { start_min: c.after.event.start_min, end_min: c.after.event.end_min } });
      continue;
    }
    switch (c.op) {
      case "add":
        out.push(
          c.after.recurring
            ? exceptionFor(c.after)
            : insertRow({ ...c.after.event, event_date: c.after.date, start_min: c.after.startMin, end_min: c.after.endMin }),
        );
        break;
      case "remove":
        out.push(
          c.before.recurring
            ? {
                table: "event_exceptions",
                op: "upsert",
                row: { event_id: c.before.eventId, occurrence_date: c.before.occurrenceDate, kind: "skip", new_date: null, new_start_min: null, new_end_min: null },
              }
            : { table: "events", op: "delete", id: c.before.eventId },
        );
        break;
      case "move":
        out.push(
          c.after.recurring
            ? exceptionFor(c.after)
            : { table: "events", op: "update", id: c.after.eventId, patch: { event_date: c.after.date, start_min: c.after.startMin, end_min: c.after.endMin } },
        );
        break;
    }
  }
  return out;
}
