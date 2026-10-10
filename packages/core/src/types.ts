// SHARED CONTRACT (Agent A + Agent B). Mirrors supabase/migrations. Change only with both agents.
// Times: minutes since midnight in the user's local time (start 0-1439, end 1-1440). Dates: "YYYY-MM-DD". Weekdays: 0 = Sunday.

export type Theme = "system" | "dark" | "light";
export type EventKind = "class" | "commitment" | "study" | "personal" | "break";
export type Priority = "high" | "med" | "low";
export type RepeatFreq = "none" | "daily" | "weekly";
export type ExceptionKind = "skip" | "move";
export type AssignmentStatus = "todo" | "in_progress" | "done";
export type DeviceRole = "laptop" | "phone";
export type CommandSource = "phone" | "laptop";
export type CommandKind = "audio" | "text";
export type CommandStatus = "queued" | "transcribing" | "thinking" | "done" | "error";

export interface Profile {
  user_id: string;
  full_name: string | null;
  display_name: string | null;
  school: string | null;
  program: string | null;
  year: string | null;
  traits: string[];
  hobbies: string[];
  study_styles: string[];
  about_me: string | null;
  theme: Theme;
  due_date_reminders: boolean;
  wake_min: number;
  sleep_min: number;
  timezone: string | null;
  /** Set when the /setup wizard finishes (or is skipped). NULL = not onboarded. */
  onboarded_at: string | null;
  created_at: string;
}

export interface ClassRow {
  id: string;
  user_id: string;
  name: string;
  professor: string | null;
  category: string | null;
  code: string | null;
  semester: string | null;
  starts_on: string | null;
  ends_on: string | null;
  start_min: number | null;
  end_min: number | null;
  meeting_days: number[];
  created_at: string;
}

export interface Assignment {
  id: string;
  user_id: string;
  class_id: string | null;
  title: string;
  status: AssignmentStatus;
  due_at: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  title: string;
  task_date: string;
  done: boolean;
  class_id: string | null;
  position: number;
  created_at: string;
}

export interface EventRow {
  id: string;
  user_id: string;
  title: string;
  subtitle: string | null;
  kind: EventKind;
  event_date: string;
  start_min: number;
  end_min: number;
  fixed: boolean;
  priority: Priority;
  travel_min: number;
  class_id: string | null;
  repeat_freq: RepeatFreq;
  /** Weekly only. Empty or null means the weekday of event_date. */
  repeat_days: number[] | null;
  repeat_until: string | null;
  created_at: string;
}

export interface EventException {
  id: string;
  user_id: string;
  event_id: string;
  /** The original date of the occurrence being skipped or moved. */
  occurrence_date: string;
  kind: ExceptionKind;
  /** Move only. null = same date. */
  new_date: string | null;
  new_start_min: number | null;
  new_end_min: number | null;
  created_at: string;
}

export interface Device {
  id: string;
  user_id: string;
  role: DeviceRole;
  name: string | null;
  last_seen: string;
  pair_code: string | null;
  pair_expires_at: string | null;
  created_at: string;
}

export interface Command {
  id: string;
  user_id: string;
  source: CommandSource;
  kind: CommandKind;
  audio_path: string | null;
  text: string | null;
  status: CommandStatus;
  transcript: string | null;
  reply_text: string | null;
  /** The scheduler Diff that was applied (see scheduler/types.ts), used for undo. */
  diff: unknown;
  error: string | null;
  stt_ms: number | null;
  llm_ms: number | null;
  total_ms: number | null;
  created_at: string;
  updated_at: string;
}

/** Result of `claim_pair(code, phone_name)`. */
export interface ClaimPairResult {
  status: "ok" | "invalid" | "expired" | "wrong_account";
  laptop_device_id?: string;
  phone_device_id?: string;
}

/** Laptop counts as offline when its heartbeat is older than this. */
export const DEVICE_OFFLINE_AFTER_MS = 45_000;

/** One dated instance of an event after recurrence and exceptions are applied. */
export interface Occurrence {
  /** `${eventId}:${occurrenceDate}` */
  id: string;
  eventId: string;
  /** The date this occurrence belongs to in the series (before any move). */
  occurrenceDate: string;
  /** The date it actually happens on. */
  date: string;
  startMin: number;
  endMin: number;
  title: string;
  subtitle: string | null;
  kind: EventKind;
  fixed: boolean;
  priority: Priority;
  travelMin: number;
  classId: string | null;
  recurring: boolean;
  /** True when an exception moved it away from the series slot. */
  moved: boolean;
  /** The source event row (series row for recurring events). */
  event: EventRow;
}
