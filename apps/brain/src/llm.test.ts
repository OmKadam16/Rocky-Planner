import { describe, expect, it, vi } from "vitest";
import {
  CLARIFY_FALLBACK,
  DEFAULT_MODEL,
  SYSTEM_PROMPT,
  buildPrompt,
  extractIntent,
  type FetchImpl,
} from "./llm";

const NOW = { date: "2026-10-12", weekday: "Monday", timezone: "America/New_York" };

function okFetch(content: string, onCall?: (body: Record<string, unknown>) => void): FetchImpl {
  return (async (_url: string, init?: { body?: unknown }) => {
    if (onCall && init?.body) onCall(JSON.parse(String(init.body)));
    return { ok: true, status: 200, json: async () => ({ message: { content } }) };
  }) as FetchImpl;
}

const VALID = JSON.stringify({
  intent: "add_event",
  title: "Gym",
  target: null,
  targetDayText: null,
  dayText: null,
  timeText: "3 to 4",
  durationMin: null,
  fixed: null,
  priority: null,
  travelMin: null,
  shiftMin: null,
  anchor: null,
  scope: null,
  memory: null,
  rearrangeOthers: null,
  clarify: null,
});

describe("extractIntent", () => {
  it("parses valid JSON on the first try", async () => {
    const seen: Record<string, unknown>[] = [];
    const r = await extractIntent("gym 3 to 4", { scheduleText: "", now: NOW }, { fetchImpl: okFetch(VALID, (b) => seen.push(b)) });
    expect(r.intent.intent).toBe("add_event");
    expect(r.intent.timeText).toBe("3 to 4");
    expect(r.source).toBe("llm");
    expect(r.attempts).toBe(1);
    expect(r.retried).toBe(false);
    // Stateless per call: model + schema format on every request.
    expect(seen[0]?.model).toBe(DEFAULT_MODEL);
    expect(seen[0]).toHaveProperty("format");
    expect(seen[0]).toHaveProperty("think", false);
  });

  it("defaults to qwen3.5:2b and honors ROCKY_LLM", async () => {
    expect(DEFAULT_MODEL).toBe("qwen3.5:2b");
    const seen: Record<string, unknown>[] = [];
    await extractIntent("hi", { scheduleText: "", now: NOW }, { fetchImpl: okFetch(VALID, (b) => seen.push(b)), model: "custom:tag" });
    expect(seen[0]?.model).toBe("custom:tag");
  });

  it("retries once on malformed JSON, then succeeds", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      const content = calls === 1 ? "not json at all" : VALID;
      return { ok: true, status: 200, json: async () => ({ message: { content } }) };
    }) as FetchImpl;
    const r = await extractIntent("gym 3 to 4", { scheduleText: "", now: NOW }, { fetchImpl });
    expect(r.intent.timeText).toBe("3 to 4");
    expect(r.attempts).toBe(2);
    expect(r.retried).toBe(true);
    expect(calls).toBe(2);
  });

  it("returns a clarify intent after two schema-invalid replies", async () => {
    const bad = JSON.stringify({ intent: "add_event", title: 42 });
    const r = await extractIntent("blah", { scheduleText: "", now: NOW }, { fetchImpl: okFetch(bad) });
    expect(r.attempts).toBe(2);
    expect(r.intent.clarify).toBe(CLARIFY_FALLBACK);
  });

  it("returns a clarify intent when the network fails twice", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("fetch failed");
    }) as unknown as FetchImpl;
    const r = await extractIntent("blah", { scheduleText: "", now: NOW }, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(r.intent.clarify).toBe(CLARIFY_FALLBACK);
  });

  it("returns a clarify intent on repeated HTTP errors", async () => {
    const fetchImpl = (async () => ({ ok: false, status: 500, json: async () => ({}) })) as FetchImpl;
    const r = await extractIntent("blah", { scheduleText: "", now: NOW }, { fetchImpl });
    expect(r.attempts).toBe(2);
    expect(r.intent.clarify).toBe(CLARIFY_FALLBACK);
  });
});

describe("buildPrompt", () => {
  it("keeps the prompt short and puts the utterance last", () => {
    const p = buildPrompt("Gym|19:00-20:00|flex", NOW, "move gym to 7");
    expect(p).toContain("2026-10-12");
    expect(p).toContain("Gym|19:00-20:00|flex");
    expect(p.trimEnd().endsWith('"move gym to 7"')).toBe(true);
  });

  it("instructs verbatim time words in the system prompt", () => {
    expect(SYSTEM_PROMPT).toMatch(/verbatim/i);
    expect(SYSTEM_PROMPT).toContain("timeText");
    expect(SYSTEM_PROMPT).toMatch(/NEVER convert to clock times/);
  });
});
