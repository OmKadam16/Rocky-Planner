import { speakDay, speakTime } from "../dates";
import type { Occurrence } from "../types";
import type { Change, Diff } from "./types";

/** "today", "tomorrow", "on Friday", "on Oct 12". */
export function onDay(date: string, today: string): string {
  const d = speakDay(date, today);
  return d === "today" || d === "tomorrow" || d === "yesterday" ? d : `on ${d}`;
}

export function listTitles(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function sentence(c: Change, today: string, undo: boolean): string {
  if (c.scope === "series") {
    if (c.op === "add") return `Every ${c.after.title} is back.`;
    if (c.op === "remove") return `Cancelled every ${c.before.title}.`;
    return `Every ${c.after.title} now starts at ${speakTime(c.after.startMin)}.`;
  }
  switch (c.op) {
    case "add":
      return undo
        ? `${c.after.title} is back ${onDay(c.after.date, today)} at ${speakTime(c.after.startMin)}.`
        : `Added ${c.after.title} ${onDay(c.after.date, today)} at ${speakTime(c.after.startMin)}.`;
    case "remove":
      return `Cancelled ${c.before.title} ${onDay(c.before.date, today)}.`;
    case "move": {
      const day = c.after.date !== c.before.date ? ` ${onDay(c.after.date, today)}` : "";
      return `${c.after.title} moves to ${speakTime(c.after.startMin)}${day}.`;
    }
  }
}

/** Question for flexible items Rocky could not fit, or null. */
export function unscheduledQuestion(items: Occurrence[], today: string): string | null {
  if (items.length === 0) return null;
  const titles = listTitles(items.map((o) => o.title));
  const day = onDay(items[0]!.date, today);
  return items.length === 1
    ? `${titles} doesn't fit ${day} anymore. Want me to move it to the next day?`
    : `${titles} don't fit ${day} anymore. Want me to move them to the next day?`;
}

export function replyFromDiff(diff: Diff, today: string, opts: { undo?: boolean; lead?: string } = {}): string {
  const lead = opts.lead ?? (opts.undo ? "Undone." : "Done.");
  const parts = [lead, ...diff.changes.map((c) => sentence(c, today, !!opts.undo))];
  const q = unscheduledQuestion(diff.unscheduled, today);
  if (q) parts.push(q);
  return parts.join(" ");
}

export function describeDay(items: Occurrence[], date: string, today: string, onlyUpcoming: boolean): string {
  const day = onDay(date, today);
  const Day = day[0]!.toUpperCase() + day.slice(1);
  if (items.length === 0) {
    return onlyUpcoming ? "You're free for the rest of today." : `Nothing on your calendar ${onDay(date, today)}.`;
  }
  const shown = items.slice(0, 6).map((o) => `${o.title} at ${speakTime(o.startMin)}`);
  const more = items.length > 6 ? ` and ${items.length - 6} more` : "";
  const list = more ? `${shown.join(", ")}${more}` : listTitles(shown);
  return onlyUpcoming ? `Still ahead today: ${list}.` : `${Day} you have ${list}.`;
}
