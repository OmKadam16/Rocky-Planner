// Calendar dates are plain "YYYY-MM-DD" strings and times are minutes since midnight.
// All arithmetic goes through UTC day numbers, so the host time zone and DST never shift a date.

const MS_PER_DAY = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
export type WeekdayName = (typeof WEEKDAYS)[number];

export function isIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** Days since 1970-01-01 for an ISO date. */
export function toDayNumber(date: string): number {
  const m = ISO_DATE.exec(date);
  if (!m) throw new Error(`Invalid ISO date: ${date}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_PER_DAY;
}

export function fromDayNumber(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromDayNumber(toDayNumber(date) + days);
}

export function daysBetween(from: string, to: string): number {
  return toDayNumber(to) - toDayNumber(from);
}

/** 0 = Sunday. 1970-01-01 was a Thursday. */
export function weekdayOf(date: string): number {
  return (((toDayNumber(date) + 4) % 7) + 7) % 7;
}

/** "19:30" -> 1170. Accepts "24:00" as 1440 (end of day). Returns null when malformed. */
export function parseHHmm(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59 || h > 24 || (h === 24 && min !== 0)) return null;
  return h * 60 + min;
}

export function formatHHmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Spoken form: 1140 -> "7 pm", 1170 -> "7:30 pm", 0 -> "12 am", 720 -> "noon". */
export function speakTime(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  if (m === 720) return "noon";
  if (m === 0) return "midnight";
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return mm === 0 ? `${h12} ${suffix}` : `${h12}:${String(mm).padStart(2, "0")} ${suffix}`;
}

/** A wall-clock moment in the user's time zone. */
export interface LocalNow {
  date: string;
  minute: number;
}

/** Converts an instant to the local date and minute in an IANA time zone (DST-correct). */
export function localNow(instant: Date, timeZone: string): LocalNow {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minute: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

/**
 * Resolves a spoken day ("today", "tomorrow", "friday", "2026-10-12") against today.
 * A weekday name means the next such day, counting today.
 */
export function resolveDay(day: string | null | undefined, today: string): string | null {
  if (day == null || day.trim() === "") return today;
  const d = day.trim().toLowerCase();
  if (d === "today" || d === "tonight") return today;
  if (d === "tomorrow") return addDays(today, 1);
  if (d === "yesterday") return addDays(today, -1);
  const idx = WEEKDAYS.indexOf(d as WeekdayName);
  if (idx >= 0) return addDays(today, (idx - weekdayOf(today) + 7) % 7);
  return isIsoDate(d) ? d : null;
}

/** "today", "tomorrow", "Friday" or "Oct 12" relative to today, for spoken replies. */
export function speakDay(date: string, today: string): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  const name = WEEKDAYS[weekdayOf(date)]!;
  if (diff > 1 && diff < 7) return name[0]!.toUpperCase() + name.slice(1);
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
    Number(date.slice(5, 7)) - 1
  ];
  return `${month} ${Number(date.slice(8, 10))}`;
}
