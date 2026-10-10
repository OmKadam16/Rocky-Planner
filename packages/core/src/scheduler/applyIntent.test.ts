import { describe, expect, it } from "vitest";
import type { LocalNow } from "../dates";
import { makeIntent, type IntentInput } from "../intentSchema";
import { expandEvents } from "../recurrence/expandEvents";
import { ev, h, ids, stateOf } from "../testing";
import type { EventRow, Occurrence } from "../types";
import { applyIntent } from "./applyIntent";
import { diffToMutations } from "./diff";
import type { ScheduleState } from "./types";

const MON = "2026-10-12";
const TUE = "2026-10-13";
const morning: LocalNow = { date: MON, minute: h(8) };

const run = (state: ScheduleState, intent: IntentInput, now: LocalNow = morning, opts = {}) =>
  applyIntent(state, makeIntent(intent), now, { newId: ids(), ...opts });

const on = (state: ScheduleState, date: string) =>
  state.occurrences.filter((o) => o.date === date).map((o) => [o.title, o.startMin, o.endMin] as const);

const find = (state: ScheduleState, title: string, date = MON): Occurrence | undefined =>
  state.occurrences.find((o) => o.title === title && o.date === date);

function calc(): EventRow {
  return ev({
    id: "calc",
    title: "Calculus",
    kind: "class",
    class_id: "class-calc",
    fixed: true,
    event_date: "2026-09-07",
    start_min: h(9),
    end_min: h(10, 15),
    repeat_freq: "weekly",
    repeat_days: [1, 3],
  });
}

/** Monday evening from the demo: dinner, gym, study; a fixed class in the morning. */
function demoDay(): ScheduleState {
  return stateOf([
    calc(),
    ev({ id: "dinner", title: "Dinner", kind: "break", event_date: MON, start_min: h(18), end_min: h(19) }),
    ev({ id: "gym", title: "Gym", event_date: MON, start_min: h(19), end_min: h(20) }),
    ev({ id: "study", title: "Study", kind: "study", event_date: MON, start_min: h(20), end_min: h(21, 30) }),
  ]);
}

describe("add_event", () => {
  it("adds a fixed event over two flexible items and rearranges them (demo 1)", () => {
    const r = run(demoDay(), { intent: "add_event", title: "Meet friend", dayText: "today", timeText: "7 pm", durationMin: 90, fixed: true });
    expect(r.clarify).toBeNull();
    expect(on(r.state, MON)).toEqual([
      ["Calculus", h(9), h(10, 15)],
      ["Dinner", h(18), h(19)],
      ["Meet friend", h(19), h(20, 30)],
      ["Gym", h(20, 30), h(21, 30)],
      ["Study", h(21, 30), h(23)],
    ]);
    expect(r.reply).toBe("Done. Added Meet friend today at 7 pm. Gym moves to 8:30 pm. Study moves to 9:30 pm.");
    expect(r.diff.changes.map((c) => c.op)).toEqual(["add", "move", "move"]);
    expect(find(r.state, "Meet friend")).toMatchObject({ fixed: true, kind: "commitment" });
  });

  it("never moves class blocks", () => {
    const r = run(demoDay(), { intent: "add_event", title: "Coffee", timeText: "9:30 am", durationMin: 30 });
    expect(r.diff.changes).toHaveLength(0);
    expect(r.clarify).toMatch(/overlaps Calculus .* which is class/);
    expect(find(r.state, "Calculus")).toMatchObject({ startMin: h(9) });
  });

  it("reports items that no longer fit and leaves them in place", () => {
    const state = { ...demoDay(), settings: { wakeMin: h(17), sleepMin: h(21), bufferMin: 0 } };
    const r = run(state, { intent: "add_event", title: "Meet friend", timeText: "7 pm", durationMin: 90, fixed: true });
    // Awake 17:00-21:00: Gym still fits 17:00-18:00; Study (90 min) has nowhere to go.
    expect(find(r.state, "Study")).toMatchObject({ startMin: h(20), endMin: h(21, 30) });
    expect(r.diff.unscheduled.map((o) => o.title)).toEqual(["Study"]);
    expect(r.clarify).toBe("Study doesn't fit today anymore. Want me to move it to the next day?");
    expect(r.reply).toContain("Study doesn't fit today anymore");
  });

  it("respects travel buffers when placing and displacing", () => {
    const state = stateOf([ev({ id: "read", title: "Reading", event_date: MON, start_min: h(13), end_min: h(14) })]);
    const r = run(state, { intent: "add_event", title: "Dentist", timeText: "2 pm", durationMin: 60, travelMin: 30, fixed: true });
    // Dentist blocks 13:30-15:00, so Reading moves to the nearest free hour: 12:30-13:30.
    expect(find(r.state, "Reading")).toMatchObject({ startMin: h(12, 30), endMin: h(13, 30) });
  });

  it("does not displace anything when rearrangeOthers is false", () => {
    const r = run(demoDay(), { intent: "add_event", title: "Call mom", timeText: "7 pm", durationMin: 30, rearrangeOthers: false });
    expect(find(r.state, "Gym")).toMatchObject({ startMin: h(19) });
    expect(r.diff.changes).toHaveLength(1);
  });

  it("places higher priority items first when slots are scarce", () => {
    const state = stateOf(
      [
        ev({ id: "low", title: "Laundry", priority: "low", event_date: MON, start_min: h(20), end_min: h(21) }),
        ev({ id: "high", title: "Essay", kind: "study", priority: "high", event_date: MON, start_min: h(20, 30), end_min: h(21, 30) }),
        ev({ id: "blocker", title: "Shift", fixed: true, event_date: MON, start_min: h(7), end_min: h(20) }),
      ],
      [],
      undefined,
      { sleepMin: h(22) },
    );
    const r = run(state, { intent: "add_event", title: "Movie", timeText: "8 pm", durationMin: 60, fixed: true });
    // Only 21:00-22:00 is free after the movie: Essay (high) gets it, Laundry (low) is unscheduled.
    expect(find(r.state, "Essay")).toMatchObject({ startMin: h(21) });
    expect(r.diff.unscheduled.map((o) => o.title)).toEqual(["Laundry"]);
  });

  it("finds a free slot when no time is given", () => {
    const r = run(demoDay(), { intent: "add_event", title: "Study physics", dayText: "today", durationMin: 60 });
    // Now is 8:00; the first free hour is before the 9:00 class.
    expect(find(r.state, "Study physics")).toMatchObject({ startMin: h(8), endMin: h(9), kind: "study", fixed: false });
  });

  it("places 'after dinner' at the end of dinner", () => {
    const r = run(demoDay(), { intent: "add_event", title: "Walk", timeText: "after dinner", durationMin: 30 });
    // Dinner ends 19:00; Walk takes 19:00-19:30 and Gym/Study slide later.
    expect(find(r.state, "Walk")).toMatchObject({ startMin: h(19), endMin: h(19, 30) });
    expect(r.clarify).toBeNull();
  });

  it("asks instead of guessing when the time words don't parse", () => {
    const r = run(demoDay(), { intent: "add_event", title: "Walk", timeText: "whenever" });
    expect(r.clarify).toBe("What time did you mean?");
    expect(r.diff.changes).toHaveLength(0);
  });

  it("asks which day when the day words don't resolve", () => {
    const r = run(demoDay(), { intent: "add_event", title: "Walk", dayText: "someday", timeText: "7 pm" });
    expect(r.clarify).toBe("Which day?");
    expect(r.diff.changes).toHaveLength(0);
  });

  it("asks when the after-event isn't on the calendar", () => {
    const r = run(demoDay(), { intent: "add_event", title: "Walk", timeText: "after brunch" });
    expect(r.clarify).toMatch(/couldn't find brunch/);
    expect(r.diff.changes).toHaveLength(0);
  });

  it("allows an event ending exactly at midnight but not past it", () => {
    const ok = run(stateOf([]), { intent: "add_event", title: "Night read", timeText: "11 pm", durationMin: 60 });
    expect(ok.state.occurrences[0]).toMatchObject({ startMin: h(23), endMin: 1440 });
    const late = run(stateOf([]), { intent: "add_event", title: "Night read", timeText: "11:30 pm", durationMin: 60 });
    expect(late.diff.changes).toHaveLength(0);
    expect(late.clarify).toMatch(/past midnight/);
    const cross = run(stateOf([]), { intent: "add_event", title: "Party", timeText: "11 pm to 1 am" });
    expect(cross.clarify).toMatch(/across midnight/);
  });

  it("asks when the LLM already flagged ambiguity", () => {
    const r = run(demoDay(), { intent: "add_event", title: "Meeting", clarify: "What time is the meeting?" });
    expect(r).toMatchObject({ handled: true, clarify: "What time is the meeting?", reply: "What time is the meeting?" });
    expect(r.diff.changes).toHaveLength(0);
  });
});

describe("move_event", () => {
  it("moves a flexible item after another one (demo 2)", () => {
    const state = stateOf([
      ev({ id: "study", title: "Study block", kind: "study", event_date: MON, start_min: h(15), end_min: h(16) }),
      ev({ id: "dinner", title: "Dinner", kind: "break", event_date: MON, start_min: h(18), end_min: h(19) }),
      ev({ id: "gym", title: "Gym", event_date: MON, start_min: h(19), end_min: h(20) }),
    ]);
    const r = run(state, { intent: "move_event", target: "my study block", anchor: { relation: "after", target: "dinner" } });
    expect(find(r.state, "Study block")).toMatchObject({ startMin: h(20), endMin: h(21) });
    expect(find(r.state, "Gym")).toMatchObject({ startMin: h(19) });
    expect(r.reply).toBe("Done. Study block moves to 8 pm.");
    expect(diffToMutations(r.diff)).toEqual([{ table: "events", op: "update", id: "study", patch: { event_date: MON, start_min: h(20), end_min: h(21) } }]);
  });

  it("moves to an explicit time and displaces what is there", () => {
    const r = run(demoDay(), { intent: "move_event", target: "study", timeText: "7 pm" });
    expect(find(r.state, "Study")).toMatchObject({ startMin: h(19), endMin: h(20, 30) });
    expect(find(r.state, "Gym")).toMatchObject({ startMin: h(20, 30) });
  });

  it("moves to 'after dinner' like the demo", () => {
    const r = run(demoDay(), { intent: "move_event", target: "study", timeText: "after dinner" });
    expect(find(r.state, "Study")).toMatchObject({ startMin: h(19), endMin: h(20, 30) });
  });

  it("refuses to move fixed and class items", () => {
    const r = run(demoDay(), { intent: "move_event", target: "calculus", timeText: "3 pm" });
    expect(r.diff.changes).toHaveLength(0);
    expect(r.reply).toBe("Calculus is a class, so I left it alone. You can change it from Classes.");
    const s2 = stateOf([ev({ id: "work", title: "Work shift", fixed: true, event_date: MON, start_min: h(12), end_min: h(16) })]);
    expect(run(s2, { intent: "move_event", target: "work", timeText: "5 pm" }).reply).toBe("Work shift is fixed, so I left it where it is.");
  });

  it("moves one occurrence of a recurring event with an exception row", () => {
    const gym = ev({ id: "gym", title: "Gym", event_date: "2026-10-05", start_min: h(18), end_min: h(19), repeat_freq: "weekly", repeat_days: [1, 3, 5] });
    const r = run(stateOf([gym]), { intent: "move_event", target: "gym", targetDayText: "monday", timeText: "8 pm" });
    expect(find(r.state, "Gym", MON)).toMatchObject({ startMin: h(20), moved: true });
    expect(find(r.state, "Gym", "2026-10-14")).toMatchObject({ startMin: h(18) });
    expect(diffToMutations(r.diff)).toEqual([
      {
        table: "event_exceptions",
        op: "upsert",
        row: { event_id: "gym", occurrence_date: MON, kind: "move", new_date: MON, new_start_min: h(20), new_end_min: h(21) },
      },
    ]);
  });

  it("moves the whole series only when the user says every/all", () => {
    const gym = ev({ id: "gym", title: "Gym", event_date: "2026-10-05", start_min: h(18), end_min: h(19), repeat_freq: "weekly", repeat_days: [1, 3, 5] });
    const r = run(stateOf([gym]), { intent: "move_event", target: "gym", timeText: "7 am", scope: "all" });
    expect(r.state.occurrences.every((o) => o.startMin === h(7))).toBe(true);
    expect(r.reply).toBe("Done. Every Gym now starts at 7 am.");
    expect(diffToMutations(r.diff)).toEqual([{ table: "events", op: "update", id: "gym", patch: { start_min: h(7), end_min: h(8) } }]);
  });

  it("moves to another day keeping the time when free", () => {
    const r = run(demoDay(), { intent: "move_event", target: "gym", dayText: "tomorrow" });
    expect(find(r.state, "Gym", TUE)).toMatchObject({ startMin: h(19), endMin: h(20) });
    expect(r.reply).toBe("Done. Gym moves to 7 pm tomorrow.");
  });

  it("asks which one when the reference is ambiguous", () => {
    const state = stateOf([
      ev({ id: "a", title: "Study calculus", event_date: MON, start_min: h(13), end_min: h(14) }),
      ev({ id: "b", title: "Study physics", event_date: MON, start_min: h(15), end_min: h(16) }),
    ]);
    const r = run(state, { intent: "move_event", target: "study", timeText: "5 pm" });
    expect(r.clarify).toBe("Which one: Study calculus or Study physics?");
    expect(r.diff.changes).toHaveLength(0);
  });

  it("says when it can't find the target", () => {
    const r = run(demoDay(), { intent: "move_event", target: "piano lesson", timeText: "5 pm" });
    expect(r.clarify).toBe("I couldn't find piano lesson. Which event did you mean?");
  });
});

describe("cancel_event", () => {
  it("cancels one occurrence of a recurring event with a skip (demo 5)", () => {
    const gym = ev({ id: "gym", title: "Gym", event_date: "2026-10-05", start_min: h(18), end_min: h(19), repeat_freq: "weekly", repeat_days: [1, 2, 3] });
    const r = run(stateOf([gym]), { intent: "cancel_event", target: "gym", dayText: "tomorrow" });
    expect(find(r.state, "Gym", TUE)).toBeUndefined();
    expect(find(r.state, "Gym", MON)).toBeDefined();
    expect(find(r.state, "Gym", "2026-10-14")).toBeDefined();
    expect(r.reply).toBe("Done. Cancelled Gym tomorrow.");
    expect(diffToMutations(r.diff)).toEqual([
      { table: "event_exceptions", op: "upsert", row: { event_id: "gym", occurrence_date: TUE, kind: "skip", new_date: null, new_start_min: null, new_end_min: null } },
    ]);
  });

  it("deletes a one-off event", () => {
    const r = run(demoDay(), { intent: "cancel_event", target: "gym" });
    expect(find(r.state, "Gym")).toBeUndefined();
    expect(diffToMutations(r.diff)).toEqual([{ table: "events", op: "delete", id: "gym" }]);
  });

  it("deletes the whole series for every/all", () => {
    const gym = ev({ id: "gym", title: "Gym", event_date: "2026-10-05", start_min: h(18), end_min: h(19), repeat_freq: "daily" });
    const r = run(stateOf([gym]), { intent: "cancel_event", target: "gym", scope: "all" });
    expect(r.state.occurrences).toHaveLength(0);
    expect(diffToMutations(r.diff)).toEqual([{ table: "events", op: "delete", id: "gym" }]);
  });

  it("won't cancel class blocks", () => {
    const r = run(demoDay(), { intent: "cancel_event", target: "calculus" });
    expect(r.diff.changes).toHaveLength(0);
    expect(find(r.state, "Calculus")).toBeDefined();
  });

  it("picks the next upcoming occurrence when no day is given", () => {
    const gym = ev({ id: "gym", title: "Gym", event_date: "2026-10-05", start_min: h(7), end_min: h(8), repeat_freq: "daily" });
    // 8:30 on MondayText: today's 7:00 gym is over, so "cancel gym" means Tuesday's.
    const r = run(stateOf([gym]), { intent: "cancel_event", target: "gym" }, { date: MON, minute: h(8, 30) });
    expect(r.reply).toBe("Done. Cancelled Gym tomorrow.");
  });
});

describe("shift_day", () => {
  it("pushes flexible items back and slides around fixed ones (demo 3)", () => {
    const state = stateOf([
      ev({ id: "s", title: "Study", event_date: MON, start_min: h(10), end_min: h(10, 30) }),
      ev({ id: "c", title: "Lab", fixed: true, event_date: MON, start_min: h(10, 30), end_min: h(11, 30) }),
      ev({ id: "r", title: "Reading", event_date: MON, start_min: h(12), end_min: h(12, 30) }),
      ev({ id: "done", title: "Breakfast", event_date: MON, start_min: h(7), end_min: h(7, 30) }),
    ]);
    const r = run(state, { intent: "shift_day", shiftMin: 20 }, { date: MON, minute: h(9, 40) });
    expect(on(r.state, MON)).toEqual([
      ["Breakfast", h(7), h(7, 30)], // already happened: untouched
      ["Lab", h(10, 30), h(11, 30)], // fixed: untouched
      ["Study", h(11, 30), h(12)], // 10:20 would hit Lab, so it slides after it
      ["Reading", h(12, 20), h(12, 50)],
    ]);
    expect(r.reply).toBe("Done. Pushed 2 things back by 20 minutes. Study moves to 11:30 am.");
  });

  it("reports items pushed past bedtime as unscheduled", () => {
    const state = stateOf([ev({ id: "n", title: "Night read", event_date: MON, start_min: h(23), end_min: 1440 })]);
    const r = run(state, { intent: "shift_day", shiftMin: 30 }, { date: MON, minute: h(22) });
    expect(r.diff.unscheduled.map((o) => o.title)).toEqual(["Night read"]);
    expect(find(r.state, "Night read")).toMatchObject({ startMin: h(23) });
  });

  it("asks for the amount when missing", () => {
    expect(run(demoDay(), { intent: "shift_day" }).clarify).toBe("By how many minutes?");
  });
});

describe("query_day", () => {
  it("lists what's left today (demo 4)", () => {
    const r = run(demoDay(), { intent: "query_day" }, { date: MON, minute: h(12) });
    expect(r.reply).toBe("Still ahead today: Dinner at 6 pm, Gym at 7 pm and Study at 8 pm.");
    expect(r.diff.changes).toHaveLength(0);
  });

  it("lists a whole other day", () => {
    const r = run(demoDay(), { intent: "query_day", dayText: "wednesday" });
    expect(r.reply).toBe("On Wednesday you have Calculus at 9 am.");
  });

  it("handles an empty day", () => {
    expect(run(demoDay(), { intent: "query_day", dayText: "tomorrow" }).reply).toBe("Nothing on your calendar tomorrow.");
  });
});

describe("replan", () => {
  it("untangles overlapping flexible items around fixed ones", () => {
    const state = stateOf([
      ev({ id: "w", title: "Work", fixed: true, event_date: TUE, start_min: h(13), end_min: h(17) }),
      ev({ id: "a", title: "Gym", priority: "low", event_date: TUE, start_min: h(16), end_min: h(17) }),
      ev({ id: "b", title: "Essay", priority: "high", event_date: TUE, start_min: h(17), end_min: h(18) }),
    ]);
    const r = run(state, { intent: "replan", dayText: "tomorrow" });
    expect(on(r.state, TUE)).toEqual([
      ["Gym", h(12), h(13)], // nearest afternoon slot beats 18:00 (evening)
      ["Work", h(13), h(17)],
      ["Essay", h(17), h(18)],
    ]);
  });
});

describe("undo", () => {
  it("reverts the last diff exactly (demo 6)", () => {
    const before = demoDay();
    const added = run(before, { intent: "add_event", title: "Meet friend", timeText: "7 pm", durationMin: 90, fixed: true });
    const undone = run(added.state, { intent: "undo" }, morning, { lastDiff: added.diff });
    expect(on(undone.state, MON)).toEqual(on(before, MON));
    expect(undone.reply).toBe("Undone. Study moves to 8 pm. Gym moves to 7 pm. Cancelled Meet friend today.");
    expect(diffToMutations(undone.diff)).toEqual([
      { table: "events", op: "update", id: "study", patch: { event_date: MON, start_min: h(20), end_min: h(21, 30) } },
      { table: "events", op: "update", id: "gym", patch: { event_date: MON, start_min: h(19), end_min: h(20) } },
      { table: "events", op: "delete", id: "new-1" },
    ]);
  });

  it("restores a skipped recurring occurrence by deleting the exception", () => {
    const gym = ev({ id: "gym", title: "Gym", event_date: "2026-10-05", start_min: h(18), end_min: h(19), repeat_freq: "daily" });
    const cancelled = run(stateOf([gym]), { intent: "cancel_event", target: "gym", dayText: "tomorrow" });
    const undone = run(cancelled.state, { intent: "undo" }, morning, { lastDiff: cancelled.diff });
    expect(find(undone.state, "Gym", TUE)).toBeDefined();
    expect(undone.reply).toBe("Undone. Gym is back tomorrow at 6 pm.");
    expect(diffToMutations(undone.diff)).toEqual([{ table: "event_exceptions", op: "delete", eventId: "gym", occurrenceDate: TUE }]);
  });

  it("re-inserts a deleted one-off event with its original row", () => {
    const cancelled = run(demoDay(), { intent: "cancel_event", target: "gym" });
    const undone = run(cancelled.state, { intent: "undo" }, morning, { lastDiff: cancelled.diff });
    const [m] = diffToMutations(undone.diff);
    expect(m).toMatchObject({ table: "events", op: "insert", row: { id: "gym", title: "Gym", start_min: h(19), user_id: "u1" } });
    expect(m && "row" in m && "created_at" in m.row).toBe(false);
  });

  it("works against a freshly re-expanded state (as the brain will do)", () => {
    const gym = ev({ id: "gym", title: "Gym", event_date: "2026-10-05", start_min: h(18), end_min: h(19), repeat_freq: "weekly", repeat_days: [1] });
    const moved = run(stateOf([gym]), { intent: "move_event", target: "gym", targetDayText: "monday", timeText: "8 pm" });
    const reloaded = stateOf(
      [gym],
      [{ id: "x", user_id: "u1", event_id: "gym", occurrence_date: MON, kind: "move", new_date: MON, new_start_min: h(20), new_end_min: h(21), created_at: "" }],
    );
    const undone = run(reloaded, { intent: "undo" }, morning, { lastDiff: moved.diff });
    expect(find(undone.state, "Gym")).toMatchObject({ startMin: h(18) });
    expect(diffToMutations(undone.diff)).toEqual([{ table: "event_exceptions", op: "delete", eventId: "gym", occurrenceDate: MON }]);
  });

  it("refuses when the calendar changed since", () => {
    const added = run(demoDay(), { intent: "add_event", title: "Meet friend", timeText: "7 pm", durationMin: 90, fixed: true });
    // The user dragged Gym somewhere else after Rocky moved it.
    const dragged = {
      ...added.state,
      occurrences: added.state.occurrences.map((o) => (o.title === "Gym" ? { ...o, startMin: h(16), endMin: h(17) } : o)),
    };
    const r = run(dragged, { intent: "undo" }, morning, { lastDiff: added.diff });
    expect(r.diff.changes).toHaveLength(0);
    expect(r.reply).toMatch(/can't undo that cleanly/);
  });

  it("says when there is nothing to undo", () => {
    expect(run(demoDay(), { intent: "undo" }).reply).toBe("There's nothing to undo.");
  });
});

describe("non-calendar intents", () => {
  it("are passed back to the caller", () => {
    for (const intent of ["add_task", "memory_search", "pause_memory", "chitchat"] as const) {
      expect(run(demoDay(), { intent }).handled).toBe(false);
    }
  });
});

describe("DST days", () => {
  it("schedules on the day clocks change like any other day", () => {
    const sun = "2026-11-01"; // fall back in America/New_York
    const gym = ev({ id: "gym", title: "Gym", event_date: "2026-10-25", start_min: h(18), end_min: h(19), repeat_freq: "weekly", repeat_days: [0] });
    const state = stateOf([gym], [], { from: "2026-10-31", to: "2026-11-02" });
    const r = run(state, { intent: "add_event", title: "Movie", dayText: "tomorrow", timeText: "6 pm", durationMin: 120, fixed: true }, { date: "2026-10-31", minute: h(10) });
    expect(on(r.state, sun)).toEqual([
      ["Gym", h(17), h(18)],
      ["Movie", h(18), h(20)],
    ]);
    const springGym = { ...gym, event_date: "2026-03-01" };
    expect(expandEvents([springGym], [], "2026-03-07", "2026-03-09").map((o) => o.date)).toEqual(["2026-03-08"]);
  });
});
