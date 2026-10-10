// SHARED CONTRACT (Agent A + Agent B). The LLM returns exactly one Intent object.
// `intentJsonSchema` is passed to Ollama as `format`; `IntentSchema` (zod) validates the result.
// The LLM never computes dates or minutes: it COPIES the user's time/day WORDS verbatim into
// `timeText`/`dayText` ("3 to 4", "after dinner", "tomorrow", "Thursday") and code resolves them.
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

/** Free-text day words copied verbatim ("tomorrow", "Thursday", "2026-10-20") or null. */
const dayText = () => opt(z.string().min(1).max(40));

/** Every key is present in LLM output; missing keys default to null so hand-written intents stay short. */
const opt = <T extends z.ZodType>(schema: T) => schema.nullable().default(null);

export const IntentSchema = z.object({
  intent: z.enum(INTENT_NAMES),
  /** Title of a new item (add_event, add_task, add_assignment). */
  title: opt(z.string().min(1)),
  /** Fuzzy reference to an existing item (move_event, cancel_event, complete_task). */
  target: opt(z.string().min(1)),
  /** Which day's occurrence of `target` ("cancel gym tomorrow"). */
  targetDayText: dayText(),
  /** Day for the new item / destination day of a move / day to query or shift. */
  dayText: dayText(),
  /** Time words copied verbatim ("3 to 4", "7 tonight", "after dinner") or null. Never clock times. */
  timeText: opt(z.string().min(1).max(120)),
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
      day: z.string().min(1).max(40).nullable().default(null),
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
// Free-text day/time words: no patterns — the model copies words verbatim and code resolves them.
// Lowercase-only and [0-9] instead of \d: llama.cpp grammar conversion handles plain classes best.
const dayTextProp = nullable("string");
const timeTextProp = nullable("string");

/** JSON schema for Ollama `format`. All keys required (nullable) so small models emit a fixed shape. */
export const intentJsonSchema = {
  type: "object",
  properties: {
    intent: { type: "string", enum: [...INTENT_NAMES] },
    title: nullable("string"),
    target: nullable("string"),
    targetDayText: dayTextProp,
    dayText: dayTextProp,
    timeText: timeTextProp,
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
        day: dayTextProp,
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
    "targetDayText",
    "dayText",
    "timeText",
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
