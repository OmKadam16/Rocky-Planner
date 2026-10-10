import { makeIntent, type Intent } from "@rocky/core";
import { parseTimeText, resolveDayText } from "@rocky/core";

// Regex fast path: common commands skip the LLM entirely (<1 s after STT).
// Times go through timePhrase, days through resolveDayText; anything that
// doesn't match rigidly returns null so the LLM hears it instead.
// The pipeline logs `source` ("fast_path" vs "llm") per command.

export interface FastPathResult {
  intent: Intent;
  source: "fast_path";
}

const DAY_TOKEN = String.raw`(?:today|tonight|tomorrow|yesterday|sunday|monday|tuesday|wednesday|thursday|friday|saturday|\d{4}-\d{2}-\d{2})`;

function clean(utterance: string): string {
  return utterance.toLowerCase().replace(/[.,;!?"]/g, "").replace(/\s+/g, " ").trim();
}

/** "an hour and a half" -> 90. Null when no duration is spoken. */
export function parseDurationMinutes(raw: string): number | null {
  const text = clean(raw);
  if (/\b(an?\s+hour\s+and\s+a\s+half|hour\s+and\s+a\s+half)\b/.test(text)) return 90;
  if (/\bhalf\s+an?\s+hour\b/.test(text)) return 30;
  const m = /\b(\d+)\s*(hours?|hrs?|minutes?|mins?)\b/.exec(text);
  if (m) {
    const n = Number(m[1]);
    const mins = /hour|hr/.test(m[2]!) ? n * 60 : n;
    return mins >= 5 && mins <= 1440 ? mins : null;
  }
  if (/\ban?\s+hour\b/.test(text)) return 60;
  return null;
}

function splitDayAndTime(dest: string): { dayText: string | null; timeText: string | null } {
  const dayMatch = new RegExp(`\\b${DAY_TOKEN}\\b`).exec(dest);
  const dayText = dayMatch ? dayMatch[0] : null;
  let rest = dayText ? dest.replace(dayText, " ") : dest;
  rest = rest
    .replace(/\b(on|at|for)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { dayText, timeText: rest === "" ? null : rest };
}

export function tryFastPath(utterance: string, today: string): FastPathResult | null {
  const text = clean(utterance);
  if (!text) return null;
  const hit = (intent: Intent): FastPathResult => ({ intent: makeIntent(intent), source: "fast_path" });

  // Undo.
  if (/^(undo|undo that|never ?mind)$/.test(text)) return hit({ intent: "undo" });

  // Memory controls.
  if (/^pause memory$/.test(text)) return hit({ intent: "pause_memory" });
  let   m = /^forget (the )?(last hour|today)$/.exec(text);
  if (m) {
    const range = m[2] === "last hour" ? "last_hour" : "today";
    return hit({ intent: "forget", memory: { text: null, day: null, range } });
  }
  m = /^what was i (reading|searching|looking at)( on (\w+))?$/.exec(text);
  if (m) {
    // Day stays verbatim (code resolves it later); unresolvable days fall through.
    const dayRaw = m[3] ?? null;
    if (dayRaw && !resolveDayText(dayRaw, today)) return null;
    return hit({ intent: "memory_search", memory: { text: m[1]!, day: dayRaw, range: null } });
  }

  // Queries.
  if (/^(what'?s|what is) (my day|the day|my schedule|my calendar)( look like| like)?$/.test(text)) {
    return hit({ intent: "query_day" });
  }
  m = /^(what'?s|what is) (next|coming up|on)\b\s*(.*)$/.exec(text);
  if (m) {
    const rest = m[3]!.trim();
    if (!rest) return hit({ intent: "query_day" });
    const day = resolveDayText(rest, today);
    if (!day) return null;
    return hit({ intent: "query_day", dayText: rest });
  }

  // Shift ("I'm running 20 minutes late").
  m = /(?:i'?m\s+)?running (\d+)\s*(minutes?|mins?)\s+late/.exec(text);
  if (m) return hit({ intent: "shift_day", shiftMin: Number(m[1]) });
  m = /(?:push|shift)\s+(everything|it|all|my day|things)\s+((back|later)\s+)?by\s+(\d+)/.exec(text);
  if (m) return hit({ intent: "shift_day", shiftMin: Number(m[4]) });
  m = /^(?:pull|move)\s+(everything|it|all|my day)\s+earlier\s+by\s+(\d+)/.exec(text);
  if (m) return hit({ intent: "shift_day", shiftMin: -Number(m[2]) });

  // Cancel with optional day.
  m = /^(cancel|delete|remove)\s+(.+?)(?:\s+(?:on\s+)?(today|tonight|tomorrow|yesterday|sunday|monday|tuesday|wednesday|thursday|friday|saturday|\d{4}-\d{2}-\d{2}))?$/.exec(text);
  if (m) {
    const target = m[2]!.trim();
    if (!target) return null;
    return hit({ intent: "cancel_event", target, targetDayText: m[3] ?? null });
  }

  // Move to a day/time ("move gym to tomorrow at 7", "move study after dinner").
  m = /^(move|shift|reschedule)\s+(.+?)\s+(to\s+.+|after\s+.+)$/.exec(text);
  if (m) {
    const target = m[2]!.trim();
    if (!target) return null;
    const dest = m[3]!.replace(/^to\s+/, "");
    const { dayText, timeText } = splitDayAndTime(dest);
    if (dayText && !resolveDayText(dayText, today)) return null;
    if (timeText && !parseTimeText(timeText)) return null; // unparseable -> LLM, never guess
    return hit({ intent: "move_event", target, dayText, timeText });
  }

  // Add, rigid shapes only ("add gym tomorrow at 7", "add dentist at 3 pm for an hour").
  m = /^(add|schedule|plan|book)\s+(.+?)\s+(today|tonight|tomorrow|yesterday|sunday|monday|tuesday|wednesday|thursday|friday|saturday|\d{4}-\d{2}-\d{2})\s+at\s+(.+)$/.exec(text);
  if (m) return addHit(m[2]!, m[3]!, m[4]!, hit);
  m = /^(add|schedule|plan|book)\s+(.+?)\s+at\s+(.+?)\s+(today|tonight|tomorrow|yesterday|sunday|monday|tuesday|wednesday|thursday|friday|saturday|\d{4}-\d{2}-\d{2})$/.exec(text);
  if (m) return addHit(m[2]!, m[4]!, m[3]!, hit);
  m = /^(add|schedule|plan|book)\s+(.+?)\s+at\s+(.+)$/.exec(text);
  if (m) {
    // A day hiding in the time ("add gym at 7 tomorrow") belongs to the LLM shape above.
    if (new RegExp(`\\b${DAY_TOKEN}\\b`).test(m[3]!)) return null;
    return addHit(m[2]!, null, m[3]!, hit);
  }
  return null;

  function addHit(
    title: string,
    dayText: string | null,
    timeRaw: string,
    mk: (intent: Intent) => FastPathResult,
  ): FastPathResult | null {
    const cleanTitle = title.trim();
    if (!cleanTitle) return null;
    if (dayText && !resolveDayText(dayText, today)) return null;
    // A trailing "for <duration>" belongs to durationMin, not the clock.
    const dur = parseDurationMinutes(timeRaw);
    const timeText = timeRaw
      .replace(/\s+for\s+.+$/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!timeText || !parseTimeText(timeText)) return null;
    return mk({ intent: "add_event", title: cleanTitle, dayText, timeText, durationMin: dur });
  }
}
