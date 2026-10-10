import { describe, expect, it } from "vitest";
import { IntentSchema, intentJsonSchema, makeIntent, parseIntent } from "./intentSchema";

describe("intentSchema", () => {
  it("keeps the zod schema and the Ollama JSON schema in sync", () => {
    expect(Object.keys(intentJsonSchema.properties).sort()).toEqual(Object.keys(IntentSchema.shape).sort());
    expect([...intentJsonSchema.required].sort()).toEqual(Object.keys(IntentSchema.shape).sort());
  });

  it("accepts a full LLM object with verbatim time words", () => {
    const raw = JSON.stringify({
      intent: "add_event",
      title: "Meet friend",
      target: null,
      targetDayText: null,
      dayText: "today",
      timeText: "7 tonight",
      durationMin: 90,
      fixed: true,
      priority: "high",
      travelMin: 20,
      shiftMin: null,
      anchor: null,
      scope: null,
      memory: null,
      rearrangeOthers: true,
      clarify: null,
    });
    const r = parseIntent(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.intent).toMatchObject({ intent: "add_event", timeText: "7 tonight", durationMin: 90 });
  });

  it("keeps clock-looking and relative phrases verbatim (code resolves them)", () => {
    expect(parseIntent({ intent: "add_event", title: "Gym", timeText: "3 to 4" }).ok).toBe(true);
    expect(parseIntent({ intent: "add_event", title: "Walk", timeText: "after dinner" }).ok).toBe(true);
    expect(parseIntent({ intent: "cancel_event", target: "gym", targetDayText: "Thursday" }).ok).toBe(true);
  });

  it("fills missing keys with null", () => {
    expect(makeIntent({ intent: "undo" })).toMatchObject({ intent: "undo", title: null, anchor: null, memory: null });
  });

  it("rejects bad output", () => {
    expect(parseIntent("not json").ok).toBe(false);
    expect(parseIntent({ intent: "launch_rocket" }).ok).toBe(false);
    expect(parseIntent({ intent: "add_event", timeText: "x".repeat(121) }).ok).toBe(false);
    expect(parseIntent({ intent: "add_event", dayText: "x".repeat(41) }).ok).toBe(false);
    expect(parseIntent({ intent: "add_event", priority: "urgent" }).ok).toBe(false);
  });

  it("accepts anchors, scope and memory queries", () => {
    expect(parseIntent({ intent: "move_event", target: "study", anchor: { relation: "after", target: "dinner" } }).ok).toBe(true);
    expect(parseIntent({ intent: "cancel_event", target: "gym", scope: "all" }).ok).toBe(true);
    expect(parseIntent({ intent: "memory_search", memory: { text: "EEG papers", day: "wednesday", range: null } }).ok).toBe(true);
    expect(parseIntent({ intent: "forget", memory: { text: null, day: null, range: "last_hour" } }).ok).toBe(true);
  });
});
