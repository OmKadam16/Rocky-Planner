import { intentJsonSchema, makeIntent, parseIntent, type Intent } from "@rocky/core";

// Ollama client: the model returns intent JSON only. Stateless per call —
// every request carries the model, the schema `format` and the full prompt.
// Deterministic date/time math lives in packages/core (timePhrase,
// scheduler); this file never computes a time.

// Live-measured on the laptop: qwen3.5:2b does ~119 tok/s, ~0.8 s per call
// on a ~1000-token prompt. It copies intent + fields reliably but must NOT
// be trusted with clock times ("3 to 4" -> 09:00) or days ("after dinner"
// -> Thursday): time/day WORDS go verbatim into timeText/dayText.
export const DEFAULT_MODEL = "qwen3.5:2b";
const KEEP_ALIVE = "30m";
const NUM_PREDICT = 300;

export const CLARIFY_FALLBACK = "Sorry, I didn't catch that. Could you say it again?";

export const SYSTEM_PROMPT = `You turn one spoken student request into ONE JSON object for a calendar program.
Rules (copy words verbatim — never compute, convert, or invent):
1. Copy time words EXACTLY into "timeText" ("3 to 4", "7 tonight", "after dinner"). NEVER convert to clock times like "19:00".
2. Copy day words EXACTLY into "dayText"/"targetDayText" ("tomorrow", "Thursday") or null. NEVER invent a day.
3. "durationMin"/"shiftMin" are integers from words ("hour and a half" is 90, "20 minutes late" is 20).
4. Output ONLY the JSON object. Include EVERY key below; use null when the words don't say.
5. If the request is ambiguous, set "clarify" to your question instead of guessing.

Keys: intent, title, target, targetDayText, dayText, timeText, durationMin, fixed, priority, travelMin, shiftMin, anchor, scope, memory, rearrangeOthers, clarify.
Intents: add_event, move_event, cancel_event, query_day, replan, shift_day, add_task, add_assignment, complete_task, undo, memory_search, forget, pause_memory, chitchat.
Example with every key (nulls included):
{"intent":"add_event","title":"Meet friend","target":null,"targetDayText":null,"dayText":"today","timeText":"7 tonight","durationMin":90,"fixed":null,"priority":null,"travelMin":null,"shiftMin":null,"anchor":null,"scope":null,"memory":null,"rearrangeOthers":null,"clarify":null}
Short examples (unmentioned keys are null):
"I'm meeting a friend at 7 tonight for an hour and a half" -> {"intent":"add_event","title":"Meet friend","dayText":"today","timeText":"7 tonight","durationMin":90}
"Move my study block after dinner" -> {"intent":"move_event","target":"study block","timeText":"after dinner"}
"I'm running 20 minutes late" -> {"intent":"shift_day","shiftMin":20}
"What's my day look like" -> {"intent":"query_day"}
"What's on Thursday" -> {"intent":"query_day","dayText":"Thursday"}
"Cancel gym tomorrow" -> {"intent":"cancel_event","target":"gym","targetDayText":"tomorrow"}
"Undo that" -> {"intent":"undo"}
"Gym 3 to 4" -> {"intent":"add_event","title":"Gym","timeText":"3 to 4"}
"Move gym to Thursday at 6" -> {"intent":"move_event","target":"gym","targetDayText":"Thursday","timeText":"6"}
"Remind me to email Prof Lin" -> {"intent":"add_task","title":"Email Prof Lin"}
"What was I reading on Wednesday" -> {"intent":"memory_search","memory":{"text":null,"day":"Wednesday","range":null}}
"Pause memory" -> {"intent":"pause_memory"}`;

export interface LlmNow {
  date: string;
  weekday: string;
  timezone: string;
}

export interface LlmContext {
  /** Compact schedule lines: `id|title|start-end|fixed/flex|priority`. */
  scheduleText: string;
  now: LlmNow;
}

/** User message: identical prefix every call (Ollama reuses the cached prefix), utterance last. */
export function buildPrompt(scheduleText: string, now: LlmNow, utterance: string): string {
  return `Schedule:\n${scheduleText || "(empty)"}\nNow: ${now.date} (${now.weekday}), ${now.timezone}\nRequest: "${utterance}"`;
}

export type FetchImpl = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const defaultFetch: FetchImpl = (url, init) =>
  globalThis.fetch(url, init) as Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface ExtractOptions {
  model?: string;
  endpoint?: string;
  fetchImpl?: FetchImpl;
}

export interface ExtractResult {
  intent: Intent;
  source: "llm";
  /** Total ms across attempts. */
  ms: number;
  attempts: 1 | 2;
  retried: boolean;
}

function clarifyIntent(): Intent {
  return makeIntent({ intent: "chitchat", clarify: CLARIFY_FALLBACK });
}

function stripFences(content: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(content);
  return (fenced?.[1] ?? content).trim();
}

async function oneAttempt(
  fetchImpl: FetchImpl,
  url: string,
  body: Record<string, unknown>,
): Promise<Intent | null> {
  let res: { ok: boolean; status: number; json(): Promise<unknown> };
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    return null;
  }
  const content = (payload as { message?: { content?: unknown } })?.message?.content;
  if (typeof content !== "string") return null;
  const parsed = parseIntent(stripFences(content));
  return parsed.ok ? parsed.intent : null;
}

/**
 * Runs one intent extraction: prompt -> Ollama (schema-enforced JSON) ->
 * zod validation. Retries ONCE on any failure, then returns a clarify
 * intent so the user is asked to repeat instead of acting on garbage.
 */
export async function extractIntent(
  utterance: string,
  ctx: LlmContext,
  opts: ExtractOptions = {},
): Promise<ExtractResult> {
  const model = opts.model ?? process.env.ROCKY_LLM ?? DEFAULT_MODEL;
  const endpoint = (opts.endpoint ?? process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434").replace(/\/$/, "");
  const fetchImpl = opts.fetchImpl ?? defaultFetch;
  const started = Date.now();
  const body = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildPrompt(ctx.scheduleText, ctx.now, utterance) },
    ],
    format: intentJsonSchema,
    stream: false,
    keep_alive: KEEP_ALIVE,
    think: false,
    options: { temperature: 0.1, num_predict: NUM_PREDICT },
  };
  const url = `${endpoint}/api/chat`;
  const first = await oneAttempt(fetchImpl, url, body);
  if (first) return { intent: first, source: "llm", ms: Date.now() - started, attempts: 1, retried: false };
  const second = await oneAttempt(fetchImpl, url, body);
  if (second) return { intent: second, source: "llm", ms: Date.now() - started, attempts: 2, retried: true };
  return { intent: clarifyIntent(), source: "llm", ms: Date.now() - started, attempts: 2, retried: true };
}
