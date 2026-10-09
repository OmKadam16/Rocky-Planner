// SHARED CONTRACT (Agent A + Agent B). The LLM returns exactly one Intent object.
// `intentJsonSchema` is passed to Ollama as `format`; `IntentSchema` (zod) validates the result.
// The LLM never computes dates or minutes: days are words or ISO dates, times are "HH:mm".
import { z } from "zod";

export const INTENT_NAMES = [
  "add_event",
  "move_event",
  "cancel_event",
  "query_day",
  "replan",
  "shift_day",
  "add_task",
  "add_assignment",
  "complete_task",
  "undo",
  "memory_search",
  "forget",
  "pause_memory",
  "chitchat",
] as const;
export type IntentName = (typeof INTENT_NAMES)[number];

export const MEMORY_RANGES = ["last_hour", "today", "yesterday", "this_week"] as const;

const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$|^24:00$/;
const DAY = /^(today|tonight|tomorrow|yesterday|sunday|monday|tuesday|wednesday|thursday|friday|saturday|\d{4}-\d{2}-\d{2})$/i;

/** Every key is present in LLM output; missing keys default to null so hand-written intents stay short. */
const opt = <T extends z.ZodType>(schema: T) => schema.nullable().default(null);

export const IntentSchema = z.object({
  intent: z.enum(INTENT_NAMES),
  /** Title of a new item (add_event, add_task, add_assignment). */
  title: opt(z.string().min(1)),
  /** Fuzzy reference to an existing item (move_event, cancel_event, complete_task). */
  target: opt(z.string().min(1)),
  /** Which day's occurrence of `target` ("cancel gym tomorrow"). */
  targetDay: opt(z.string().regex(DAY)),
  /** Day for the new item / destination day of a move / day to query or shift. */
  day: opt(z.string().regex(DAY)),
  start: opt(z.string().regex(HHMM)),
  end: opt(z.string().regex(HHMM)),
  durationMin: opt(z.number().int().min(5).max(1440)),
  fixed: opt(z.boolean()),
  priority: opt(z.enum(["high", "med", "low"])),
  travelMin: opt(z.number().int().min(0).max(240)),
  /** shift_day: minutes to push (negative pulls earlier). */
  shiftMin: opt(z.number().int().min(-720).max(720)),
  /** Place relative to another item instead of a clock time ("after dinner"). */
  anchor: opt(z.object({ relation: z.enum(["after", "before"]), target: z.string().min(1) })),
  /** Recurring items: "one" occurrence (default) or "all" when the user says every/all. */
  scope: opt(z.enum(["one", "all"])),
  memory: opt(
    z.object({
      text: z.string().nullable().default(null),
      day: z.string().regex(DAY).nullable().default(null),
      range: z.enum(MEMORY_RANGES).nullable().default(null),
    }),
  ),
  /** Allow Rocky to move flexible items out of the way. Default true. */
  rearrangeOthers: opt(z.boolean()),
  /** A question to ask the user when the request is ambiguous. */
  clarify: opt(z.string().min(1)),
});

export type Intent = z.output<typeof IntentSchema>;
export type IntentInput = z.input<typeof IntentSchema>;

/** Builds a full Intent from a partial one (tests, fast path). Throws on invalid input. */
export function makeIntent(input: IntentInput): Intent {
  return IntentSchema.parse(input);
}

export function parseIntent(raw: unknown): { ok: true; intent: Intent } | { ok: false; error: string } {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, error: "not JSON" };
    }
  }
  const r = IntentSchema.safeParse(value);
  return r.success ? { ok: true, intent: r.data } : { ok: false, error: r.error.message };
}

const nullable = (type: string, extra: Record<string, unknown> = {}) => ({ type: [type, "null"], ...extra });
// Lowercase-only and [0-9] instead of \d: llama.cpp grammar conversion handles plain classes best.
const dayProp = nullable("string", {
  pattern: "^(today|tonight|tomorrow|yesterday|sunday|monday|tuesday|wednesday|thursday|friday|saturday|[0-9]{4}-[0-9]{2}-[0-9]{2})$",
});
const timeProp = nullable("string", { pattern: "^([01]?[0-9]|2[0-3]):[0-5][0-9]$" });

/** JSON schema for Ollama `format`. All keys required (nullable) so small models emit a fixed shape. */
export const intentJsonSchema = {
  type: "object",
  properties: {
    intent: { type: "string", enum: [...INTENT_NAMES] },
    title: nullable("string"),
    target: nullable("string"),
    targetDay: dayProp,
    day: dayProp,
    start: timeProp,
    end: timeProp,
    durationMin: nullable("integer"),
    fixed: nullable("boolean"),
    priority: { type: ["string", "null"], enum: ["high", "med", "low", null] },
    travelMin: nullable("integer"),
    shiftMin: nullable("integer"),
    anchor: {
      type: ["object", "null"],
      properties: {
        relation: { type: "string", enum: ["after", "before"] },
        target: { type: "string" },
      },
      required: ["relation", "target"],
    },
    scope: { type: ["string", "null"], enum: ["one", "all", null] },
    memory: {
      type: ["object", "null"],
      properties: {
        text: nullable("string"),
        day: dayProp,
        range: { type: ["string", "null"], enum: [...MEMORY_RANGES, null] },
      },
      required: ["text", "day", "range"],
    },
    rearrangeOthers: nullable("boolean"),
    clarify: nullable("string"),
  },
  required: [
    "intent",
    "title",
    "target",
    "targetDay",
    "day",
    "start",
    "end",
    "durationMin",
    "fixed",
    "priority",
    "travelMin",
    "shiftMin",
    "anchor",
    "scope",
    "memory",
    "rearrangeOthers",
    "clarify",
  ],
} as const;
