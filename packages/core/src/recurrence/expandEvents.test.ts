import { describe, expect, it } from "vitest";
import { ev, ex, h } from "../testing";
import { expandEvents, occurrenceKey } from "./expandEvents";

const dates = (list: { date: string }[]) => list.map((o) => o.date);

describe("expandEvents", () => {
  it("returns a one-off event only on its date", () => {
    const e = ev({ id: "a", title: "Dentist", event_date: "2026-10-13", start_min: h(14), end_min: h(15) });
    expect(expandEvents([e], [], "2026-10-12", "2026-10-18")).toHaveLength(1);
    expect(expandEvents([e], [], "2026-10-14", "2026-10-18")).toHaveLength(0);
    const [o] = expandEvents([e], [], "2026-10-13", "2026-10-13");
    expect(o).toMatchObject({ id: "a:2026-10-13", eventId: "a", recurring: false, moved: false, startMin: h(14) });
    expect(occurrenceKey(o!)).toBe("a");
  });

  it("expands daily events up to repeat_until", () => {
    const e = ev({ id: "d", title: "Walk", event_date: "2026-10-10", start_min: h(7), end_min: h(7, 30), repeat_freq: "daily", repeat_until: "2026-10-14" });
    expect(dates(expandEvents([e], [], "2026-10-08", "2026-10-20"))).toEqual(["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14"]);
  });

  it("expands weekly events on chosen days (0 = Sunday)", () => {
    const e = ev({ id: "g", title: "Gym", event_date: "2026-10-05", start_min: h(18), end_min: h(19), repeat_freq: "weekly", repeat_days: [1, 3, 5] });
    expect(dates(expandEvents([e], [], "2026-10-11", "2026-10-18"))).toEqual(["2026-10-12", "2026-10-14", "2026-10-16"]);
  });

  it("defaults weekly days to the weekday of event_date", () => {
    const e = ev({ id: "w", title: "Club", event_date: "2026-10-13", start_min: h(17), end_min: h(18), repeat_freq: "weekly", repeat_days: [] });
    expect(dates(expandEvents([e], [], "2026-10-01", "2026-10-31"))).toEqual(["2026-10-13", "2026-10-20", "2026-10-27"]);
  });

  it("skips and moves single occurrences", () => {
    const e = ev({ id: "g", title: "Gym", event_date: "2026-10-05", start_min: h(18), end_min: h(19), repeat_freq: "weekly", repeat_days: [1, 3, 5] });
    const out = expandEvents(
      [e],
      [
        ex({ event_id: "g", occurrence_date: "2026-10-12", kind: "skip" }),
        ex({ event_id: "g", occurrence_date: "2026-10-14", kind: "move", new_start_min: h(20), new_end_min: h(21) }),
        ex({ event_id: "g", occurrence_date: "2026-10-16", kind: "move", new_date: "2026-10-17", new_start_min: h(9), new_end_min: h(10) }),
      ],
      "2026-10-11",
      "2026-10-18",
    );
    expect(out.map((o) => [o.id, o.date, o.startMin, o.moved])).toEqual([
      ["g:2026-10-14", "2026-10-14", h(20), true],
      ["g:2026-10-16", "2026-10-17", h(9), true],
    ]);
  });

  it("includes occurrences moved into the range and drops ones moved out", () => {
    const e = ev({ id: "g", title: "Gym", event_date: "2026-10-05", start_min: h(18), end_min: h(19), repeat_freq: "weekly", repeat_days: [1] });
    const exs = [
      ex({ event_id: "g", occurrence_date: "2026-10-19", kind: "move", new_date: "2026-10-18", new_start_min: h(10), new_end_min: h(11) }),
      ex({ event_id: "g", occurrence_date: "2026-10-12", kind: "move", new_date: "2026-10-10", new_start_min: h(10), new_end_min: h(11) }),
    ];
    expect(expandEvents([e], exs, "2026-10-11", "2026-10-18").map((o) => o.id)).toEqual(["g:2026-10-19"]);
  });

  it("ignores exceptions for dates that are not occurrences", () => {
    const e = ev({ id: "g", title: "Gym", event_date: "2026-10-05", start_min: h(18), end_min: h(19), repeat_freq: "weekly", repeat_days: [1] });
    const exs = [ex({ event_id: "g", occurrence_date: "2026-10-13", kind: "move", new_date: "2026-10-14", new_start_min: h(9), new_end_min: h(10) })];
    expect(dates(expandEvents([e], exs, "2026-10-11", "2026-10-18"))).toEqual(["2026-10-12"]);
  });

  it("keeps an event that ends exactly at midnight", () => {
    const e = ev({ id: "n", title: "Night study", event_date: "2026-10-12", start_min: h(23), end_min: 1440 });
    expect(expandEvents([e], [], "2026-10-12", "2026-10-12")[0]?.endMin).toBe(1440);
  });

  it("produces each date once across DST changes", () => {
    const e = ev({ id: "d", title: "Meds", event_date: "2026-03-01", start_min: h(8), end_min: h(8, 15), repeat_freq: "daily" });
    const march = dates(expandEvents([e], [], "2026-03-06", "2026-03-10"));
    expect(march).toEqual(["2026-03-06", "2026-03-07", "2026-03-08", "2026-03-09", "2026-03-10"]);
    const nov = dates(expandEvents([e], [], "2026-10-31", "2026-11-02"));
    expect(nov).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("sorts by date then start time", () => {
    const a = ev({ id: "a", title: "B", event_date: "2026-10-13", start_min: h(9), end_min: h(10) });
    const b = ev({ id: "b", title: "A", event_date: "2026-10-12", start_min: h(12), end_min: h(13) });
    const c = ev({ id: "c", title: "C", event_date: "2026-10-12", start_min: h(8), end_min: h(9) });
    expect(expandEvents([a, b, c], [], "2026-10-12", "2026-10-13").map((o) => o.eventId)).toEqual(["c", "b", "a"]);
  });
});
