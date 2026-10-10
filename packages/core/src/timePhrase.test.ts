import { describe, expect, it } from "vitest";
import { looksLikeExplicitRange, parseTimeText, resolveDayText } from "./timePhrase";

// Reference Monday: 2026-10-12. Parser is pure: no clock, no I/O.
const MON = "2026-10-12";
const TUE = "2026-10-13";
const THU = "2026-10-15";

describe("parseTimeText: bare hours", () => {
  it("reads bare 1-6 as PM (live failure: '3 to 4' was 09:00)", () => {
    expect(parseTimeText("3")).toEqual({ kind: "clock", startMin: 900, endMin: null });
    expect(parseTimeText("3pm")).toEqual({ kind: "clock", startMin: 900, endMin: null });
    expect(parseTimeText("3 pm")).toEqual({ kind: "clock", startMin: 900, endMin: null });
    expect(parseTimeText("3am")).toEqual({ kind: "clock", startMin: 180, endMin: null });
  });
  it("reads bare 7-11 as AM unless an evening marker is present", () => {
    expect(parseTimeText("7")).toEqual({ kind: "clock", startMin: 420, endMin: null });
    expect(parseTimeText("9")).toEqual({ kind: "clock", startMin: 540, endMin: null });
    expect(parseTimeText("11")).toEqual({ kind: "clock", startMin: 660, endMin: null });
    expect(parseTimeText("7 tonight")).toEqual({ kind: "clock", startMin: 1140, endMin: null });
    expect(parseTimeText("7 in the evening")).toEqual({ kind: "clock", startMin: 1140, endMin: null });
    expect(parseTimeText("9 in the morning")).toEqual({ kind: "clock", startMin: 540, endMin: null });
  });
  it("reads noon, midnight and bare 12", () => {
    expect(parseTimeText("noon")).toEqual({ kind: "clock", startMin: 720, endMin: null });
    expect(parseTimeText("midnight")).toEqual({ kind: "clock", startMin: 0, endMin: null });
    expect(parseTimeText("12")).toEqual({ kind: "clock", startMin: 720, endMin: null });
  });
  it("reads clock times with minutes", () => {
    expect(parseTimeText("3:30")).toEqual({ kind: "clock", startMin: 930, endMin: null });
    expect(parseTimeText("3:30pm")).toEqual({ kind: "clock", startMin: 930, endMin: null });
    expect(parseTimeText("7:45 am")).toEqual({ kind: "clock", startMin: 465, endMin: null });
    expect(parseTimeText("15:00")).toEqual({ kind: "clock", startMin: 900, endMin: null });
  });
  it("reads half past and quarter to/past", () => {
    expect(parseTimeText("half past 3")).toEqual({ kind: "clock", startMin: 930, endMin: null });
    expect(parseTimeText("quarter past 5")).toEqual({ kind: "clock", startMin: 1035, endMin: null });
    expect(parseTimeText("quarter to 4")).toEqual({ kind: "clock", startMin: 945, endMin: null });
  });
  it("ignores filler words", () => {
    expect(parseTimeText("at 7")).toEqual({ kind: "clock", startMin: 420, endMin: null });
    expect(parseTimeText("around 8")).toEqual({ kind: "clock", startMin: 480, endMin: null });
  });
});

describe("parseTimeText: ranges", () => {
  it("reads '3 to 4' as 3-4 pm", () => {
    expect(parseTimeText("3 to 4")).toEqual({ kind: "clock", startMin: 900, endMin: 960 });
    expect(parseTimeText("3-4")).toEqual({ kind: "clock", startMin: 900, endMin: 960 });
    expect(parseTimeText("from 3 until 5")).toEqual({ kind: "clock", startMin: 900, endMin: 1020 });
    expect(parseTimeText("3:30 to 5")).toEqual({ kind: "clock", startMin: 930, endMin: 1020 });
    expect(parseTimeText("3 to 4 pm")).toEqual({ kind: "clock", startMin: 900, endMin: 960 });
    expect(parseTimeText("between 3 and 4")).toEqual({ kind: "clock", startMin: 900, endMin: 960 });
  });
  it("keeps morning ranges in the morning", () => {
    expect(parseTimeText("7 to 8")).toEqual({ kind: "clock", startMin: 420, endMin: 480 });
    expect(parseTimeText("7pm to 8pm")).toEqual({ kind: "clock", startMin: 1140, endMin: 1200 });
  });
  it("hears the evening in '10 to midnight' and the workday in '9 to 5'", () => {
    expect(parseTimeText("10 to midnight")).toEqual({ kind: "clock", startMin: 1320, endMin: 1440 });
    expect(parseTimeText("9 to 5")).toEqual({ kind: "clock", startMin: 540, endMin: 1020 });
    expect(parseTimeText("11 to 12")).toEqual({ kind: "clock", startMin: 660, endMin: 720 });
  });
  it("rejects backwards and out-of-range spans", () => {
    expect(parseTimeText("5 to 3")).toBeNull();
    expect(parseTimeText("25:00")).toBeNull();
  });
});

describe("parseTimeText: bare hours relative to now", () => {
  const afternoon = { nowMin: 900, isToday: true, eveningHint: false };
  const morning = { nowMin: 360, isToday: true, eveningHint: false };
  const future = { isToday: false, eveningHint: false };
  const futureEvening = { isToday: false, eveningHint: true };
  it("picks the next occurrence at or after now when the day is today", () => {
    expect(parseTimeText("7", afternoon)).toEqual({ kind: "clock", startMin: 1140, endMin: null });
    expect(parseTimeText("7", morning)).toEqual({ kind: "clock", startMin: 420, endMin: null });
    expect(parseTimeText("7", { nowMin: 1200, isToday: true, eveningHint: false })).toBeNull();
  });
  it("keeps 1-6 PM on future days, and hears evening events in 7-11", () => {
    expect(parseTimeText("8", future)).toEqual({ kind: "clock", startMin: 480, endMin: null });
    expect(parseTimeText("3", future)).toEqual({ kind: "clock", startMin: 900, endMin: null });
    expect(parseTimeText("7", futureEvening)).toEqual({ kind: "clock", startMin: 1140, endMin: null });
    expect(parseTimeText("8", futureEvening)).toEqual({ kind: "clock", startMin: 1200, endMin: null });
  });
  it("lets explicit markers beat the clock", () => {
    expect(parseTimeText("7 am", afternoon)).toEqual({ kind: "clock", startMin: 420, endMin: null });
    expect(parseTimeText("7 pm", morning)).toEqual({ kind: "clock", startMin: 1140, endMin: null });
  });
});

describe("parseTimeText: range re-resolution (never null for plain X to Y)", () => {
  it("lifts the end into the start's half of the day", () => {
    expect(parseTimeText("5 to 7")).toEqual({ kind: "clock", startMin: 1020, endMin: 1140 });
    expect(parseTimeText("9 to 11")).toEqual({ kind: "clock", startMin: 540, endMin: 660 });
    expect(parseTimeText("11 to 1")).toEqual({ kind: "clock", startMin: 660, endMin: 780 });
    expect(parseTimeText("9 pm to 11")).toEqual({ kind: "clock", startMin: 1260, endMin: 1380 });
  });
  it("'7 to 9' follows rule 1 for the start and keeps the end with it", () => {
    expect(parseTimeText("7 to 9", { nowMin: 900, isToday: true, eveningHint: false })).toEqual({
      kind: "clock",
      startMin: 1140,
      endMin: 1260,
    });
    expect(parseTimeText("7 to 9", { nowMin: 360, isToday: true, eveningHint: false })).toEqual({
      kind: "clock",
      startMin: 420,
      endMin: 540,
    });
  });
  it("still rejects genuinely backwards spans", () => {
    expect(parseTimeText("5 to 3")).toBeNull();
  });
});

describe("parseTimeText: day-part defaults (flagged, reply says so)", () => {
  it("defaults only when no clock time is spoken", () => {
    expect(parseTimeText("tonight")).toEqual({ kind: "clock", startMin: 1140, endMin: null, defaulted: true });
    expect(parseTimeText("this afternoon")).toEqual({ kind: "clock", startMin: 840, endMin: null, defaulted: true });
    expect(parseTimeText("this morning")).toEqual({ kind: "clock", startMin: 540, endMin: null, defaulted: true });
    expect(parseTimeText("in the evening")).toEqual({ kind: "clock", startMin: 1080, endMin: null, defaulted: true });
    expect(parseTimeText("7 tonight")).toEqual({ kind: "clock", startMin: 1140, endMin: null });
    expect(parseTimeText("sometime 5-ish")).toBeNull();
  });
});

describe("parseTimeText: after <event> (live failure: invented Thursday)", () => {
  it("returns an anchor reference, never a guessed time", () => {
    expect(parseTimeText("after dinner")).toEqual({ kind: "after", target: "dinner" });
    expect(parseTimeText("After Dinner")).toEqual({ kind: "after", target: "dinner" });
    expect(parseTimeText("right after gym")).toEqual({ kind: "after", target: "gym" });
  });
});

describe("parseTimeText: unparseable", () => {
  it("returns null so the applier asks instead of inventing", () => {
    expect(parseTimeText(null)).toBeNull();
    expect(parseTimeText("")).toBeNull();
    expect(parseTimeText("sometime")).toBeNull();
    expect(parseTimeText("morning")).toBeNull();
    expect(parseTimeText("half past")).toBeNull();
  });
});

describe("looksLikeExplicitRange", () => {
  it("spots real ranges that cross midnight", () => {
    expect(looksLikeExplicitRange("11 pm to 1 am")).toBe(true);
    expect(looksLikeExplicitRange("10pm-2am")).toBe(true);
  });
  it("ignores backwards guesses and non-times", () => {
    expect(looksLikeExplicitRange("5 to 3")).toBe(false);
    expect(looksLikeExplicitRange("sometime")).toBe(false);
    expect(looksLikeExplicitRange(null)).toBe(false);
  });
});

describe("resolveDayText", () => {
  it("maps null/blank to null (the applier defaults, never the parser)", () => {
    expect(resolveDayText(null, MON)).toBeNull();
    expect(resolveDayText("", MON)).toBeNull();
    expect(resolveDayText("  ", MON)).toBeNull();
  });
  it("resolves spoken days against today", () => {
    expect(resolveDayText("today", MON)).toBe(MON);
    expect(resolveDayText("tonight", MON)).toBe(MON);
    expect(resolveDayText("tomorrow", MON)).toBe(TUE);
    expect(resolveDayText("Thursday", MON)).toBe(THU);
    expect(resolveDayText("2026-10-20", MON)).toBe("2026-10-20");
  });
  it("returns null for invented days", () => {
    expect(resolveDayText("someday", MON)).toBeNull();
    expect(resolveDayText("next week", MON)).toBeNull();
  });
});
