import { describe, expect, it } from "vitest";
import { parseDurationMinutes, tryFastPath } from "./fastpath";

const MON = "2026-10-12";

describe("tryFastPath: query/undo", () => {
  it("answers day queries without the LLM", () => {
    expect(tryFastPath("what's my day look like", MON)).toMatchObject({
      source: "fast_path",
      intent: { intent: "query_day", dayText: null },
    });
    expect(tryFastPath("what's on thursday", MON)).toMatchObject({
      intent: { intent: "query_day", dayText: "thursday" },
    });
    expect(tryFastPath("what's next", MON)).toMatchObject({ intent: { intent: "query_day" } });
  });
  it("undoes without the LLM", () => {
    expect(tryFastPath("undo that", MON)).toMatchObject({ intent: { intent: "undo" } });
    expect(tryFastPath("undo", MON)).toMatchObject({ intent: { intent: "undo" } });
  });
  it("treats cancel-that phrasing as undo, never cancel_event", () => {
    for (const words of ["cancel that", "scratch that", "never mind", "forget that", "take that back"]) {
      const hit = tryFastPath(words, MON);
      expect(hit).toMatchObject({ intent: { intent: "undo" } });
      expect(hit?.intent.intent).not.toBe("cancel_event");
    }
  });
});

describe("tryFastPath: cancel/move with times", () => {
  it("cancels with an optional day", () => {
    expect(tryFastPath("cancel gym", MON)).toMatchObject({
      intent: { intent: "cancel_event", target: "gym", targetDayText: null },
    });
    expect(tryFastPath("cancel gym tomorrow", MON)).toMatchObject({
      intent: { intent: "cancel_event", target: "gym", targetDayText: "tomorrow" },
    });
    expect(tryFastPath("delete dentist on thursday", MON)).toMatchObject({
      intent: { intent: "cancel_event", target: "dentist", targetDayText: "thursday" },
    });
  });
  it("moves to clock times, days and after-phrases", () => {
    expect(tryFastPath("move gym to 7", MON)).toMatchObject({
      intent: { intent: "move_event", target: "gym", timeText: "7", dayText: null },
    });
    expect(tryFastPath("move gym to tomorrow at 7", MON)).toMatchObject({
      intent: { intent: "move_event", target: "gym", dayText: "tomorrow", timeText: "7" },
    });
    expect(tryFastPath("move my study block after dinner", MON)).toMatchObject({
      intent: { intent: "move_event", target: "my study block", timeText: "after dinner" },
    });
    // Unparseable time falls through to the LLM instead of guessing.
    expect(tryFastPath("move gym to sometime", MON)).toBeNull();
  });
  it("adds with rigid patterns only", () => {
    expect(tryFastPath("add gym tomorrow at 7", MON)).toMatchObject({
      intent: { intent: "add_event", title: "gym", dayText: "tomorrow", timeText: "7" },
    });
    expect(tryFastPath("schedule dentist at 3 pm for an hour", MON)).toMatchObject({
      intent: { intent: "add_event", title: "dentist", timeText: "3 pm", durationMin: 60 },
    });
    // No verb/day/at shape -> LLM.
    expect(tryFastPath("gym 3 to 4", MON)).toBeNull();
    expect(tryFastPath("remind me to call mom", MON)).toBeNull();
  });
});

describe("tryFastPath: shift_day", () => {
  it("hears lateness in words", () => {
    expect(tryFastPath("i'm running 20 minutes late", MON)).toMatchObject({
      intent: { intent: "shift_day", shiftMin: 20 },
    });
    expect(tryFastPath("push everything by 15", MON)).toMatchObject({
      intent: { intent: "shift_day", shiftMin: 15 },
    });
    expect(tryFastPath("running 10 min late", MON)).toMatchObject({
      intent: { intent: "shift_day", shiftMin: 10 },
    });
    expect(tryFastPath("shift my day later by 30", MON)).toMatchObject({
      intent: { intent: "shift_day", shiftMin: 30 },
    });
  });
});

describe("tryFastPath: memory + fallthrough", () => {
  it("handles pause/forget/memory_search", () => {
    expect(tryFastPath("pause memory", MON)).toMatchObject({ intent: { intent: "pause_memory" } });
    expect(tryFastPath("forget last hour", MON)).toMatchObject({
      intent: { intent: "forget", memory: { text: null, day: null, range: "last_hour" } },
    });
    expect(tryFastPath("forget the last hour", MON)).toMatchObject({
      intent: { intent: "forget", memory: { text: null, day: null, range: "last_hour" } },
    });
    expect(tryFastPath("what was i reading on wednesday", MON)).toMatchObject({
      intent: { intent: "memory_search", memory: { text: "reading", day: "wednesday", range: null } },
    });
  });
  it("returns null for everything else", () => {
    expect(tryFastPath("what's the meaning of life", MON)).toBeNull();
    expect(tryFastPath("", MON)).toBeNull();
  });
});

describe("parseDurationMinutes", () => {
  it("copies durations from words", () => {
    expect(parseDurationMinutes("an hour")).toBe(60);
    expect(parseDurationMinutes("for an hour")).toBe(60);
    expect(parseDurationMinutes("hour and a half")).toBe(90);
    expect(parseDurationMinutes("an hour and a half")).toBe(90);
    expect(parseDurationMinutes("half an hour")).toBe(30);
    expect(parseDurationMinutes("45 minutes")).toBe(45);
    expect(parseDurationMinutes("2 hours")).toBe(120);
    expect(parseDurationMinutes("sometime")).toBeNull();
  });
});
