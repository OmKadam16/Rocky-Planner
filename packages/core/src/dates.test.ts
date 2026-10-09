import { describe, expect, it } from "vitest";
import { addDays, daysBetween, formatHHmm, isIsoDate, localNow, parseHHmm, resolveDay, speakDay, speakTime, weekdayOf } from "./dates";

describe("dates", () => {
  it("runs under a DST zone so local-time bugs surface", () => {
    expect(process.env.TZ).toBe("America/New_York");
  });

  it("adds days across DST changes without skipping or repeating dates", () => {
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09"); // spring forward
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02"); // fall back
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(daysBetween("2026-03-01", "2026-04-01")).toBe(31);
  });

  it("computes weekdays with 0 = Sunday", () => {
    expect(weekdayOf("2026-10-09")).toBe(5); // Friday
    expect(weekdayOf("2026-10-11")).toBe(0);
    expect(weekdayOf("2026-11-01")).toBe(0);
  });

  it("parses and formats HH:mm", () => {
    expect(parseHHmm("19:30")).toBe(1170);
    expect(parseHHmm("7:05")).toBe(425);
    expect(parseHHmm("24:00")).toBe(1440);
    expect(parseHHmm("24:30")).toBeNull();
    expect(parseHHmm("12:60")).toBeNull();
    expect(parseHHmm("noon")).toBeNull();
    expect(formatHHmm(1170)).toBe("19:30");
    expect(isIsoDate("2026-02-30")).toBe(false);
  });

  it("speaks times", () => {
    expect(speakTime(1140)).toBe("7 pm");
    expect(speakTime(1170)).toBe("7:30 pm");
    expect(speakTime(720)).toBe("noon");
    expect(speakTime(0)).toBe("midnight");
    expect(speakTime(1440)).toBe("midnight");
    expect(speakTime(545)).toBe("9:05 am");
  });

  it("resolves spoken days", () => {
    const fri = "2026-10-09";
    expect(resolveDay(null, fri)).toBe(fri);
    expect(resolveDay("tonight", fri)).toBe(fri);
    expect(resolveDay("tomorrow", fri)).toBe("2026-10-10");
    expect(resolveDay("Friday", fri)).toBe(fri);
    expect(resolveDay("monday", fri)).toBe("2026-10-12");
    expect(resolveDay("thursday", fri)).toBe("2026-10-15");
    expect(resolveDay("2026-12-01", fri)).toBe("2026-12-01");
    expect(resolveDay("someday", fri)).toBeNull();
    expect(speakDay("2026-10-12", fri)).toBe("Monday");
    expect(speakDay("2026-10-20", fri)).toBe("Oct 20");
  });

  it("converts instants to local wall time on DST days", () => {
    // 2026-03-08 07:30Z = 03:30 EDT (2:00-2:59 does not exist that day).
    expect(localNow(new Date("2026-03-08T07:30:00Z"), "America/New_York")).toEqual({ date: "2026-03-08", minute: 210 });
    // 2026-11-01 05:30Z = 01:30 EDT, 06:30Z = 01:30 EST (the hour repeats).
    expect(localNow(new Date("2026-11-01T05:30:00Z"), "America/New_York")).toEqual({ date: "2026-11-01", minute: 90 });
    expect(localNow(new Date("2026-11-01T06:30:00Z"), "America/New_York")).toEqual({ date: "2026-11-01", minute: 90 });
    // Late evening UTC is already tomorrow in India.
    expect(localNow(new Date("2026-10-09T20:00:00Z"), "Asia/Kolkata")).toEqual({ date: "2026-10-10", minute: 90 });
  });
});
