import type { LocalNow } from "../dates";
import type { EventRow, ExceptionKind, Occurrence } from "../types";

export interface ScheduleSettings {
  /** Automatic placement only happens between wake and sleep. Explicit user times may fall outside. */
  wakeMin: number;
  sleepMin: number;
  /** Minimum gap after each item when Rocky places things. */
  bufferMin: number;
}

export const DEFAULT_SETTINGS: ScheduleSettings = { wakeMin: 420, sleepMin: 1380, bufferMin: 0 };

export interface ScheduleState {
  /** Expanded occurrences for the horizon (see expandEvents). */
  occurrences: Occurrence[];
  /** The dates the occurrences were expanded for, inclusive. */
  range: { from: string; to: string };
  settings: ScheduleSettings;
}

/**
 * One change to the calendar. `occurrence` scope touches one dated instance
 * (an exception row for recurring events); `series` scope touches the event row itself.
 */
export type Change =
  | { op: "add"; scope: "occurrence" | "series"; after: Occurrence }
  | { op: "remove"; scope: "occurrence" | "series"; before: Occurrence }
  | { op: "move"; scope: "occurrence" | "series"; before: Occurrence; after: Occurrence };

export interface Diff {
  changes: Change[];
  /** Flexible items that were displaced but had no free slot. They stay where they were. */
  unscheduled: Occurrence[];
}

export interface ApplyOptions {
  /** Id generator for new events. Defaults to "new-1", "new-2", ... */
  newId?: () => string;
  userId?: string;
  /** The diff to revert for an `undo` intent (the last applied, not yet undone). */
  lastDiff?: Diff | null;
}

export interface ApplyResult {
  /** False when the intent is not a calendar intent (tasks, memory, chitchat): the caller handles it. */
  handled: boolean;
  state: ScheduleState;
  diff: Diff;
  /** Spoken reply, templated from the diff (never written by the LLM). */
  reply: string;
  /** Set when Rocky needs an answer before doing anything (or for unscheduled items). */
  clarify: string | null;
}

export type { LocalNow };

/** Database writes needed to persist a Diff. The brain executes these in order. */
export type Mutation =
  /** created_at is left to the database; user_id is omitted when unknown (the column defaults to auth.uid()). */
  | { table: "events"; op: "insert"; row: Omit<EventRow, "created_at" | "user_id"> & { user_id?: string } }
  | { table: "events"; op: "update"; id: string; patch: Partial<Pick<EventRow, "event_date" | "start_min" | "end_min">> }
  | { table: "events"; op: "delete"; id: string }
  | {
      table: "event_exceptions";
      op: "upsert";
      row: {
        event_id: string;
        occurrence_date: string;
        kind: ExceptionKind;
        new_date: string | null;
        new_start_min: number | null;
        new_end_min: number | null;
      };
    }
  | { table: "event_exceptions"; op: "delete"; eventId: string; occurrenceDate: string };
