import { resolveDay } from "./dates";

// Deterministic time-phrase parser: spoken time words -> minutes since midnight.
// The LLM copies time words VERBATIM into `timeText`; every number here is
// decided by these rules, never by the model. Returns null when the words
// don't pin a time, so the caller asks instead of inventing one.

export type ParsedTime =
  | { kind: "clock"; startMin: number; endMin: number | null; defaulted?: boolean }
  | { kind: "after"; target: string };

/**
 * Context for bare hours (no am/pm marker anywhere).
 * - isToday + nowMin: the day is today, so a bare hour means its next
 *   occurrence at or after now (at 3 pm "at 7" is 19:00, at 6 am it is 07:00).
 * - Otherwise (future day or no clock): 1-6 mean PM; 7-11 mean PM only with
 *   an evening hint, AM otherwise.
 */
export interface TimeContext {
  nowMin?: number;
  isToday?: boolean;
  eveningHint?: boolean;
}

/** Evening-event words ("dinner tomorrow at 7" means 7 pm, "gym" at 8 means 8 am). */
const EVENING_WORDS = [
  "dinner",
  "party",
  "friend",
  "friends",
  "movie",
  "game",
  "hang out",
  "date",
  "show",
  "concert",
];

export function hasEveningHint(text: string | null | undefined): boolean {
  if (!text) return false;
  return new RegExp(`\\b(${EVENING_WORDS.join("|")})\\b`, "i").test(text);
}

/** Lone "that"/"it"/"this" is never an event name — it asks for clarification. */
export function isBarePronoun(text: string | null | undefined): boolean {
  return !!text && /^(that|it|this)$/i.test(text.trim());
}

/**
 * Spoken day words -> ISO date. Null/blank -> null (the APPLIER supplies the
 * default, e.g. today for adds; the parser never invents a day).
 */
export function resolveDayText(raw: string | null | undefined, today: string): string | null {
  if (raw == null || raw.trim() === "") return null;
  return resolveDay(raw.trim(), today);
}

/**
 * True when the words look like a real time range with explicit markers
 * ("11 pm to 1 am") that simply crosses midnight — the applier answers with
 * the across-midnight question instead of a generic "what time?".
 */
export function looksLikeExplicitRange(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  const text = raw.toLowerCase();
  const hasSeparator = /\b(to|until|till|through)\b|-|–|—/.test(text);
  const digits = (text.match(/\d+/g) ?? []).length;
  // Attached markers count too ("10pm-2am"): \b never sits between a digit and a letter.
  const markers = (text.match(/(^|[0-9\s])(am|a\.m\.|pm|p\.m\.|noon|midnight)\b/g) ?? []).length;
  return hasSeparator && digits >= 2 && markers >= 1;
}

const DAY_WORDS = [
  "today",
  "tonight",
  "tomorrow",
  "yesterday",
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

type Meridiem = "am" | "pm" | null;

function globalMeridiem(text: string): Meridiem {
  const hasAm = /\b(am|a\.m\.|morning)\b/.test(text);
  const hasPm = /\b(pm|p\.m\.|afternoon|evening|tonight|night)\b/.test(text);
  if (hasPm && !hasAm) return "pm";
  if (hasAm && !hasPm) return "am";
  return null;
}

/** Strip day words and filler so only the time remains (meridiem already read). */
function stripNonTime(text: string): string {
  let s = ` ${text} `;
  for (const d of DAY_WORDS) s = s.replace(new RegExp(`\\b${d}\\b`, "g"), " ");
  s = s.replace(/\b(this|in the|at|around|about|by|from|between)\b/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

interface SingleTime {
  minutes: number;
  /** True when an explicit am/pm marker (not a bare-hour rule) decided it. */
  explicit: boolean;
}

function applyHourRule(hour: number, marker: Meridiem, ctx: TimeContext): SingleTime | null {
  if (marker === "am") return hour >= 0 && hour <= 11 ? { minutes: hour * 60, explicit: true } : null;
  if (marker === "pm") {
    if (hour < 0 || hour > 11) return null;
    return { minutes: (hour === 12 ? 12 : hour + 12) * 60, explicit: true };
  }
  const options = bareOptions(hour, ctx);
  if (options.length === 0) return null;
  if (ctx.isToday && ctx.nowMin != null) {
    const next = options.find((o) => o >= ctx.nowMin!);
    return next == null ? null : { minutes: next, explicit: false };
  }
  return { minutes: options[0]!, explicit: false };
}

/**
 * Candidate minutes for a bare hour, earliest first. 1-6 are always PM;
 * 7-11 follow the evening hint; 12 is noon.
 */
function bareOptions(hour: number, ctx: TimeContext): number[] {
  if (hour >= 1 && hour <= 6) return [(hour + 12) * 60];
  if (hour >= 7 && hour <= 11) {
    return ctx.eveningHint ? [(hour + 12) * 60] : [hour * 60, (hour + 12) * 60];
  }
  if (hour === 12) return [720];
  return [];
}

const NUM = "(\\d{1,2})(?::(\\d{2}))?";

/** Parse one side of a range ("3", "3:30 pm", "half past 3", "noon"). Null when not a time. */
function parseSingle(raw: string, fallback: Meridiem, ctx: TimeContext): SingleTime | null {
  let s = raw.trim();
  if (!s) return null;
  if (s === "noon") return { minutes: 720, explicit: true };
  if (s === "midnight") return { minutes: 0, explicit: true };

  // Peel a trailing meridiem word ("7 in the evening" already lost "in the").
  let marker: Meridiem = null;
  const tail = /\b(am|a\.m\.|pm|p\.m\.|morning|afternoon|evening|tonight|night)\s*$/.exec(s);
  if (tail) {
    marker = /^(am|a\.m\.|morning)$/.test(tail[1]!) ? "am" : "pm";
    s = s.slice(0, tail.index).trim();
  }
  const meridiem = marker ?? fallback;

  let m = /^(?:half past|half after)\s+(\d{1,2})$/.exec(s);
  if (m) {
    const t = applyHourRule(Number(m[1]), meridiem, ctx);
    return t ? { minutes: t.minutes + 30, explicit: t.explicit } : null;
  }
  m = /^quarter past\s+(\d{1,2})$/.exec(s);
  if (m) {
    const t = applyHourRule(Number(m[1]), meridiem, ctx);
    return t ? { minutes: t.minutes + 15, explicit: t.explicit } : null;
  }
  m = /^quarter to\s+(\d{1,2})$/.exec(s);
  if (m) {
    const h = Number(m[1]);
    // "quarter to 4" with bare 4 (PM rule) = 3:45 pm.
    const base = applyHourRule(h, meridiem, ctx);
    if (!base) return null;
    return { minutes: base.minutes - 15, explicit: base.explicit };
  }
  m = new RegExp(`^${NUM}$`).exec(s);
  if (!m) return null;
  const hour = Number(m[1]);
  const mins = m[2] ? Number(m[2]) : 0;
  if (mins > 59) return null;
  // 24h clock passes through untouched.
  if (hour >= 13 && hour <= 23) return { minutes: hour * 60 + mins, explicit: true };
  const t = applyHourRule(hour, meridiem, ctx);
  if (!t) return null;
  return { minutes: t.minutes + mins, explicit: t.explicit };
}

/** Day-part words with no clock time: flagged defaults, never silent guesses. */
function dayPartDefault(text: string): ParsedTime | null {
  if (/\d/.test(text)) return null;
  if (/\bthis morning\b/.test(text)) return { kind: "clock", startMin: 540, endMin: null, defaulted: true };
  if (/\bthis afternoon\b/.test(text)) return { kind: "clock", startMin: 840, endMin: null, defaulted: true };
  if (/\b(in the evening|this evening)\b/.test(text)) {
    return { kind: "clock", startMin: 1080, endMin: null, defaulted: true };
  }
  if (/\btonight\b/.test(text)) return { kind: "clock", startMin: 1140, endMin: null, defaulted: true };
  return null;
}

/**
 * "3 to 4", "7 tonight", "half past 3", "after dinner".
 * Bare hours resolve against `ctx` (see TimeContext). Null when the words
 * don't pin a time — except plain "X to Y" ranges, which re-resolve the end
 * into the start's half of the day instead of failing.
 */
export function parseTimeText(raw: string | null | undefined, ctx: TimeContext = {}): ParsedTime | null {
  if (raw == null) return null;
  const text = raw
    .toLowerCase()
    .replace(/[.,;!?"]/g, "")
    // "3am" -> "3 am": \b never matches between a digit and a letter,
    // so attached markers would otherwise be invisible below.
    .replace(/(\d)\s*(a\.m\.|p\.m\.|am|pm)(?![a-z])/g, "$1 $2")
    .trim();
  if (!text) return null;

  const after = /^(?:right\s+)?after\s+(.+?)$/.exec(text);
  if (after) {
    const target = after[1]!.replace(/^(the|my)\s+/, "").trim();
    return target ? { kind: "after", target } : null;
  }

  const global = globalMeridiem(text);
  const core = stripNonTime(text);
  // Single expressions first: "quarter to 4" contains " to " but is one time.
  const single = parseSingle(core, global, ctx);
  if (single) {
    if (single.minutes < 0 || single.minutes > 1439) return null;
    return { kind: "clock", startMin: single.minutes, endMin: null };
  }
  // Split ranges on to/until/till/through/and/dash (max two sides).
  const parts = core
    .split(/\s*(?:\bto\b|\buntil\b|\btill\b|\bthrough\b|\band\b|-|–|—)\s*/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 2) {
    const start = parseSingle(parts[0]!, global, ctx);
    const end = start ? parseSingle(parts[1]!, global, ctx) : null;
    if (start && end) {
      let startMin = start.minutes;
      // "10 to midnight": midnight parses as 0:00, but as a range end it is 24:00.
      let endMin = parts[1]!.trim() === "midnight" ? 1440 : end.minutes;
      // Evening pull: "10 to midnight" means 10 pm, not 10 am.
      if (startMin < 720 && endMin >= 720 && startMin + 720 < endMin) startMin += 720;
      // Same-half lift: "5 to 7" is 17:00-19:00, "9 pm to 11" is 21:00-23:00.
      if (endMin <= startMin && endMin + 720 > startMin && endMin + 720 <= 1440) endMin += 720;
      if (endMin > startMin && endMin <= 1440) return { kind: "clock", startMin, endMin };
      return null;
    }
  }
  return dayPartDefault(text);
}
