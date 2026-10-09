import { parseHHmm, resolveDay, speakTime, type LocalNow } from "../dates";
import type { Intent } from "../intentSchema";
import { baseOccurrence, occurrenceKey, sortOccurrences } from "../recurrence/expandEvents";
import type { EventKind, EventRow, Occurrence } from "../types";
import { applyDiff, diffApplies, emptyDiff, invertDiff, isEmptyDiff } from "./diff";
import { findTarget, type MatchResult } from "./match";
import { busyInterval, byPriority, findSlot, overlaps, placementWindow, type Interval } from "./placement";
import { describeDay, listTitles, onDay, replyFromDiff, unscheduledQuestion } from "./reply";
import type { ApplyOptions, ApplyResult, Change, Diff, ScheduleState } from "./types";

const DEFAULT_DURATION = 60;

interface Ctx {
  state: ScheduleState;
  intent: Intent;
  now: LocalNow;
  opts: ApplyOptions;
}

/**
 * Applies one intent to the schedule. Pure: no I/O, no clock. The LLM only supplies the intent;
 * every date, time and rearrangement is decided here. Fixed occurrences are never moved.
 */
export function applyIntent(state: ScheduleState, intent: Intent, now: LocalNow, opts: ApplyOptions = {}): ApplyResult {
  const ctx: Ctx = { state, intent, now, opts };
  if (intent.clarify) return ask(ctx, intent.clarify);
  switch (intent.intent) {
    case "add_event":
      return addEvent(ctx);
    case "move_event":
      return moveEvent(ctx);
    case "cancel_event":
      return cancelEvent(ctx);
    case "shift_day":
      return shiftDay(ctx);
    case "replan":
      return replan(ctx);
    case "query_day":
      return queryDay(ctx);
    case "undo":
      return undo(ctx);
    default:
      return { handled: false, state, diff: emptyDiff(), reply: "", clarify: null };
  }
}

// ---------- results ----------

function say(ctx: Ctx, reply: string): ApplyResult {
  return { handled: true, state: ctx.state, diff: emptyDiff(), reply, clarify: null };
}

function ask(ctx: Ctx, question: string): ApplyResult {
  return { handled: true, state: ctx.state, diff: emptyDiff(), reply: question, clarify: question };
}

function commit(ctx: Ctx, diff: Diff, opts: { undo?: boolean; lead?: string } = {}): ApplyResult {
  return {
    handled: true,
    state: applyDiff(ctx.state, diff),
    diff,
    reply: replyFromDiff(diff, ctx.now.date, opts),
    clarify: unscheduledQuestion(diff.unscheduled, ctx.now.date),
  };
}

// ---------- helpers ----------

let fallbackCounter = 0;
function newId(ctx: Ctx): string {
  return ctx.opts.newId ? ctx.opts.newId() : `new-${++fallbackCounter}`;
}

export function inferKind(title: string, fixed: boolean): EventKind {
  if (fixed) return "commitment";
  if (/\b(study|studying|homework|hw|read|reading|review|revise|revision|essay|assignment|exam|quiz|lab|problem set|pset)\b/i.test(title)) return "study";
  if (/\b(break|lunch|dinner|breakfast|brunch|nap|rest|snack)\b/i.test(title)) return "break";
  return "personal";
}

/** Same occurrence at a new slot. One-off events carry the change in their row; recurring ones become exceptions. */
function relocate(o: Occurrence, date: string, startMin: number, endMin: number): Occurrence {
  if (!o.recurring) {
    const event: EventRow = { ...o.event, event_date: date, start_min: startMin, end_min: endMin };
    return { ...baseOccurrence(event, date) };
  }
  const moved = date !== o.occurrenceDate || startMin !== o.event.start_min || endMin !== o.event.end_min;
  return { ...o, date, startMin, endMin, moved };
}

const sameKey = (a: Occurrence, b: Occurrence) => occurrenceKey(a) === occurrenceKey(b);

function dayBusy(list: Occurrence[], date: string, bufferMin: number, except?: Occurrence): Interval[] {
  return list.filter((o) => o.date === date && (!except || !sameKey(o, except))).map((o) => busyInterval(o, bufferMin));
}

/** First fixed occurrence that `item` would overlap (travel included), if any. */
function fixedClash(list: Occurrence[], item: Occurrence): Occurrence | undefined {
  const mine = busyInterval(item, 0);
  return list.find((o) => o.fixed && o.date === item.date && !sameKey(o, item) && overlaps(busyInterval(o, 0), mine));
}

function clashQuestion(clash: Occurrence): string {
  const what = clash.kind === "class" ? "class" : "fixed";
  return `That overlaps ${clash.title} (${speakTime(clash.startMin)} to ${speakTime(clash.endMin)}), which is ${what}. Want a different time?`;
}

/**
 * `placed` is already in `list`. Moves every flexible item it overlaps to the nearest free slot
 * the same day (higher priority first). Items with no slot stay put and are reported as unscheduled.
 */
function settle(ctx: Ctx, list: Occurrence[], placed: Occurrence): { list: Occurrence[]; moves: Change[]; unscheduled: Occurrence[] } {
  const { bufferMin } = ctx.state.settings;
  if (ctx.intent.rearrangeOthers === false) return { list, moves: [], unscheduled: [] };
  const mine = busyInterval(placed, bufferMin);
  const displaced = list
    .filter((o) => !o.fixed && o.date === placed.date && !sameKey(o, placed) && overlaps(busyInterval(o, bufferMin), mine))
    .sort(byPriority);
  let rest = list.filter((o) => !displaced.some((d) => sameKey(d, o)));
  const moves: Change[] = [];
  const unscheduled: Occurrence[] = [];
  const window = placementWindow(placed.date, ctx.now, ctx.state.settings);
  for (const d of displaced) {
    const slot = findSlot({
      durationMin: d.endMin - d.startMin,
      travelMin: d.travelMin,
      preferredStart: d.startMin,
      busy: dayBusy(rest, d.date, bufferMin),
      window,
      bufferMin,
    });
    if (slot === null) {
      unscheduled.push(d);
      rest = [...rest, d];
      continue;
    }
    const after = relocate(d, d.date, slot, slot + (d.endMin - d.startMin));
    moves.push({ op: "move", scope: "occurrence", before: d, after });
    rest = [...rest, after];
  }
  return { list: rest, moves, unscheduled };
}

function matchQuestion(m: Exclude<MatchResult, { ok: true }>, target: string, date: string | null, today: string): string {
  if (m.reason === "ambiguous") return `Which one: ${listTitles(m.options.map((o) => o.title)).replace(/ and ([^,]+)$/, " or $1")}?`;
  return `I couldn't find ${target}${date ? ` ${onDay(date, today)}` : ""}. Which event did you mean?`;
}

/** Resolves start/duration from explicit times. Returns an error question or the slot. */
function explicitTimes(intent: Intent, fallbackDuration: number): { start: number; end: number } | { question: string } | null {
  if (!intent.start) return null;
  const start = parseHHmm(intent.start);
  if (start === null) return { question: "What time did you mean?" };
  let end: number;
  if (intent.end) {
    const e = parseHHmm(intent.end);
    if (e === null) return { question: "What time should it end?" };
    if (e <= start) return { question: "Rocky can't plan across midnight yet. Can you split it into two?" };
    end = e;
  } else {
    end = start + (intent.durationMin ?? fallbackDuration);
  }
  if (end > 1440) return { question: "That runs past midnight. Want it shorter or earlier?" };
  return { start, end };
}

// ---------- intents ----------

function addEvent(ctx: Ctx): ApplyResult {
  const { intent, now, state } = ctx;
  const title = intent.title ?? intent.target;
  if (!title) return ask(ctx, "What should I call it?");
  const date = resolveDay(intent.day, now.date);
  if (!date) return ask(ctx, "Which day?");
  if (date < now.date) return ask(ctx, "That day is in the past. Which day did you mean?");

  const fixed = intent.fixed ?? false;
  const times = explicitTimes(intent, DEFAULT_DURATION);
  if (times && "question" in times) return ask(ctx, times.question);
  const duration = times ? times.end - times.start : (intent.durationMin ?? DEFAULT_DURATION);
  const travel = intent.travelMin ?? 0;

  let start: number;
  if (times) {
    start = times.start;
  } else {
    const anchored = anchorSlot(ctx, date, duration, travel, null);
    if (anchored && "question" in anchored) return ask(ctx, anchored.question);
    const window = placementWindow(date, now, state.settings);
    const slot =
      anchored?.start ??
      findSlot({
        durationMin: duration,
        travelMin: travel,
        preferredStart: window.start,
        busy: dayBusy(state.occurrences, date, state.settings.bufferMin),
        window,
        bufferMin: state.settings.bufferMin,
      });
    if (slot === null) return ask(ctx, `I couldn't find a free ${duration}-minute slot ${onDay(date, now.date)}. Want a specific time?`);
    start = slot;
  }

  const event: EventRow = {
    id: newId(ctx),
    user_id: ctx.opts.userId ?? "",
    title,
    subtitle: null,
    kind: inferKind(title, fixed),
    event_date: date,
    start_min: start,
    end_min: start + duration,
    fixed,
    priority: intent.priority ?? "med",
    travel_min: travel,
    class_id: null,
    repeat_freq: "none",
    repeat_days: null,
    repeat_until: null,
    created_at: "",
  };
  const occ = baseOccurrence(event, date);
  const clash = fixedClash(state.occurrences, occ);
  if (clash) return ask(ctx, clashQuestion(clash));

  const s = settle(ctx, [...state.occurrences, occ], occ);
  return commit(ctx, { changes: [{ op: "add", scope: "occurrence", after: occ }, ...s.moves], unscheduled: s.unscheduled });
}

/**
 * Slot relative to another item ("after dinner"): the free slot nearest to just after / just before it.
 * Returns null when the intent has no anchor.
 */
function anchorSlot(ctx: Ctx, date: string, duration: number, travel: number, self: Occurrence | null): { start: number } | { question: string } | null {
  const a = ctx.intent.anchor;
  if (!a) return null;
  const { state, now } = ctx;
  const pool = self ? state.occurrences.filter((o) => !sameKey(o, self)) : state.occurrences;
  let m = findTarget(pool, a.target, { date, now });
  if (!m.ok && m.reason === "none") m = findTarget(pool, a.target, { now });
  if (!m.ok) return { question: matchQuestion(m, a.target, date, now.date) };
  const ref = m.occurrence;
  if (ref.date !== date) return { question: `${ref.title} is ${onDay(ref.date, now.date)}. Should I use that day?` };
  const { bufferMin } = state.settings;
  const day = placementWindow(ref.date, now, state.settings);
  const window: Interval =
    a.relation === "after"
      ? { start: Math.max(day.start, ref.endMin + bufferMin), end: Math.max(day.end, ref.endMin) }
      : { start: day.start, end: ref.startMin - ref.travelMin - bufferMin };
  const preferredStart = a.relation === "after" ? window.start + travel : window.end - duration;
  const slot = findSlot({ durationMin: duration, travelMin: travel, preferredStart, busy: dayBusy(pool, ref.date, bufferMin), window, bufferMin });
  if (slot === null) return { question: `There's no free time ${a.relation} ${ref.title}. Want a specific time?` };
  return { start: slot };
}

function findForEdit(ctx: Ctx, verb: string): { occ: Occurrence } | { result: ApplyResult } {
  const { intent, now, state } = ctx;
  const target = intent.target ?? intent.title;
  if (!target) return { result: ask(ctx, `What should I ${verb}?`) };
  const dayWord = verb === "cancel" ? (intent.targetDay ?? intent.day) : intent.targetDay;
  const date = dayWord ? resolveDay(dayWord, now.date) : null;
  if (dayWord && !date) return { result: ask(ctx, "Which day?") };
  const m = findTarget(state.occurrences, target, { date, now });
  if (!m.ok) return { result: ask(ctx, matchQuestion(m, target, date, now.date)) };
  return { occ: m.occurrence };
}

function fixedRefusal(o: Occurrence): string {
  return o.classId
    ? `${o.title} is a class, so I left it alone. You can change it from Classes.`
    : `${o.title} is fixed, so I left it where it is.`;
}

function moveEvent(ctx: Ctx): ApplyResult {
  const { intent, now, state } = ctx;
  const found = findForEdit(ctx, "move");
  if ("result" in found) return found.result;
  const occ = found.occ;
  if (occ.fixed) return say(ctx, fixedRefusal(occ));

  const duration = occ.endMin - occ.startMin;
  const date = intent.day ? resolveDay(intent.day, now.date) : occ.date;
  if (!date) return ask(ctx, "Which day?");

  if (intent.scope === "all" && occ.recurring) return moveSeries(ctx, occ, date);

  const times = explicitTimes(intent, intent.durationMin ?? duration);
  if (times && "question" in times) return ask(ctx, times.question);

  const others = state.occurrences.filter((o) => !sameKey(o, occ));
  let after: Occurrence;
  if (times) {
    after = relocate(occ, date, times.start, times.end);
    const clash = fixedClash(others, after);
    if (clash) return ask(ctx, clashQuestion(clash));
  } else {
    const anchored = anchorSlot(ctx, date, duration, occ.travelMin, occ);
    if (anchored && "question" in anchored) return ask(ctx, anchored.question);
    let start = anchored?.start ?? null;
    if (start === null) {
      if (!intent.day || date === occ.date) return ask(ctx, `When should I move ${occ.title} to?`);
      start = findSlot({
        durationMin: duration,
        travelMin: occ.travelMin,
        preferredStart: occ.startMin,
        busy: dayBusy(others, date, state.settings.bufferMin),
        window: placementWindow(date, now, state.settings),
        bufferMin: state.settings.bufferMin,
      });
      if (start === null) return ask(ctx, `${occ.title} doesn't fit ${onDay(date, now.date)}. Want a specific time?`);
    }
    after = relocate(occ, date, start, start + duration);
  }

  if (after.date === occ.date && after.startMin === occ.startMin && after.endMin === occ.endMin) {
    return say(ctx, `${occ.title} is already at ${speakTime(occ.startMin)}.`);
  }
  const s = settle(ctx, [...others, after], after);
  return commit(ctx, { changes: [{ op: "move", scope: "occurrence", before: occ, after }, ...s.moves], unscheduled: s.unscheduled });
}

/** "Move gym to 8 every day": changes the series time. Days stay the same; nothing else is rearranged. */
function moveSeries(ctx: Ctx, occ: Occurrence, date: string): ApplyResult {
  const { intent, state } = ctx;
  if (date !== occ.date) return ask(ctx, `I can only change the time of every ${occ.title}. Change its days in the calendar.`);
  const duration = occ.event.end_min - occ.event.start_min;
  const times = explicitTimes(intent, intent.durationMin ?? duration);
  if (!times) return ask(ctx, `What time should every ${occ.title} start?`);
  if ("question" in times) return ask(ctx, times.question);

  const event: EventRow = { ...occ.event, start_min: times.start, end_min: times.end };
  for (const o of state.occurrences) {
    if (o.eventId !== occ.eventId || o.moved) continue;
    const clash = fixedClash(state.occurrences, { ...o, startMin: times.start, endMin: times.end });
    if (clash) return ask(ctx, `That would overlap ${clash.title} ${onDay(o.date, ctx.now.date)}. Want a different time?`);
  }
  const rep = state.occurrences.find((o) => o.eventId === occ.eventId && !o.moved) ?? occ;
  const after: Occurrence = { ...rep, startMin: times.start, endMin: times.end, event };
  return commit(ctx, { changes: [{ op: "move", scope: "series", before: rep, after }], unscheduled: [] });
}

function cancelEvent(ctx: Ctx): ApplyResult {
  const found = findForEdit(ctx, "cancel");
  if ("result" in found) return found.result;
  const occ = found.occ;
  if (occ.classId) return say(ctx, fixedRefusal(occ));
  const scope = ctx.intent.scope === "all" && occ.recurring ? "series" : "occurrence";
  return commit(ctx, { changes: [{ op: "remove", scope, before: occ }], unscheduled: [] });
}

/**
 * "I'm running 20 minutes late": pushes every flexible item that hasn't started yet by N minutes,
 * in order. Fixed items stay; anything that would hit one slides to the nearest free slot.
 */
function shiftDay(ctx: Ctx): ApplyResult {
  const { intent, now, state } = ctx;
  const shift = intent.shiftMin;
  if (shift === null || shift === 0) return ask(ctx, "By how many minutes?");
  const date = resolveDay(intent.day, now.date);
  if (!date) return ask(ctx, "Which day?");
  const from = date === now.date ? now.minute : 0;
  const { bufferMin } = state.settings;

  const affected = state.occurrences
    .filter((o) => o.date === date && !o.fixed && o.startMin >= from)
    .sort((a, b) => a.startMin - b.startMin);
  if (affected.length === 0) return say(ctx, `Nothing to shift ${onDay(date, now.date)}.`);

  let list = state.occurrences.filter((o) => !affected.some((a) => sameKey(a, o)));
  const changes: Change[] = [];
  const unscheduled: Occurrence[] = [];
  const window = placementWindow(date, now, state.settings);
  for (const o of affected) {
    const duration = o.endMin - o.startMin;
    const want = o.startMin + shift;
    const busy = dayBusy(list, date, bufferMin);
    const wanted = { startMin: want, endMin: want + duration, travelMin: o.travelMin };
    const free = want - o.travelMin >= from && want + duration <= 1440 && !busy.some((b) => overlaps(b, busyInterval(wanted, bufferMin)));
    // Running late means nothing can start before its shifted time.
    const notBefore = Math.max(window.start, from, shift > 0 ? want - o.travelMin : 0);
    const slot = free
      ? want
      : findSlot({ durationMin: duration, travelMin: o.travelMin, preferredStart: want, busy, window: { start: notBefore, end: window.end }, bufferMin });
    if (slot === null) {
      unscheduled.push(o);
      list = [...list, o];
      continue;
    }
    const after = relocate(o, date, slot, slot + duration);
    changes.push({ op: "move", scope: "occurrence", before: o, after });
    list = [...list, after];
  }
  const n = changes.length;
  const lead = `Done. Pushed ${n === 1 ? "1 thing" : `${n} things`} ${shift > 0 ? "back" : "earlier"} by ${Math.abs(shift)} minutes.`;
  const diff: Diff = { changes, unscheduled };
  const result = commit(ctx, diff, { lead });
  // Only mention items that didn't land exactly N minutes later.
  const odd = changes.filter((c) => c.op === "move" && c.after.startMin !== c.before.startMin + shift);
  const extra = replyFromDiff({ changes: odd, unscheduled }, now.date, { lead: "" }).trim();
  return { ...result, reply: extra ? `${lead} ${extra}` : lead };
}

/** Untangles one day: fixed items stay, overlapping flexible items move to the nearest free slot. */
function replan(ctx: Ctx): ApplyResult {
  const { intent, now, state } = ctx;
  const date = resolveDay(intent.day, now.date);
  if (!date) return ask(ctx, "Which day?");
  const { bufferMin } = state.settings;
  const day = state.occurrences.filter((o) => o.date === date);
  const fixed = day.filter((o) => o.fixed);
  const flexible = day.filter((o) => !o.fixed).sort(byPriority);

  let kept: Occurrence[] = [...fixed];
  const changes: Change[] = [];
  const unscheduled: Occurrence[] = [];
  const window = placementWindow(date, now, state.settings);
  for (const o of flexible) {
    const mine = busyInterval(o, bufferMin);
    if (!kept.some((k) => overlaps(busyInterval(k, bufferMin), mine))) {
      kept.push(o);
      continue;
    }
    const slot = findSlot({ durationMin: o.endMin - o.startMin, travelMin: o.travelMin, preferredStart: o.startMin, busy: kept.map((k) => busyInterval(k, bufferMin)), window, bufferMin });
    if (slot === null) {
      unscheduled.push(o);
      kept.push(o);
      continue;
    }
    const after = relocate(o, date, slot, slot + (o.endMin - o.startMin));
    changes.push({ op: "move", scope: "occurrence", before: o, after });
    kept.push(after);
  }
  if (changes.length === 0 && unscheduled.length === 0) return say(ctx, `${onDay(date, now.date)[0]!.toUpperCase()}${onDay(date, now.date).slice(1)} already fits together.`);
  return commit(ctx, { changes, unscheduled });
}

function queryDay(ctx: Ctx): ApplyResult {
  const { intent, now, state } = ctx;
  const date = resolveDay(intent.day, now.date);
  if (!date) return ask(ctx, "Which day?");
  const onlyUpcoming = date === now.date;
  const items = sortOccurrences(state.occurrences.filter((o) => o.date === date && (!onlyUpcoming || o.endMin > now.minute)));
  return say(ctx, describeDay(items, date, now.date, onlyUpcoming));
}

function undo(ctx: Ctx): ApplyResult {
  const last = ctx.opts.lastDiff;
  if (!last || isEmptyDiff(last)) return say(ctx, "There's nothing to undo.");
  const inverse = invertDiff(last);
  if (!diffApplies(ctx.state, inverse)) return say(ctx, "Your calendar changed since then, so I can't undo that cleanly. You can fix it in the calendar.");
  return commit(ctx, inverse, { undo: true });
}
