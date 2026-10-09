import type { LocalNow } from "../dates";
import type { Occurrence } from "../types";

const STOPWORDS = new Set(["my", "the", "a", "an", "block", "session", "event", "thing", "time", "for", "to", "with", "at", "on"]);

export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return normalizeTitle(s)
    .split(" ")
    .filter((t) => t && !STOPWORDS.has(t));
}

/** 0-100 similarity between a spoken reference ("my study block") and an item. */
export function matchScore(o: Pick<Occurrence, "title" | "subtitle" | "kind">, target: string): number {
  const t = normalizeTitle(target);
  const title = normalizeTitle(o.title);
  if (!t) return 0;
  if (title === t) return 100;
  const tt = tokens(target);
  if (tt.length === 0) return 0;
  const titleTokens = tokens(o.title);
  if (tt.join(" ") === titleTokens.join(" ")) return 95;
  if (title.includes(t) || (title.length >= 3 && t.includes(title))) return 80;
  const words = [...titleTokens, ...tokens(o.subtitle ?? ""), o.kind];
  const hit = (w: string) => words.some((x) => x === w || (w.length >= 4 && x.startsWith(w)) || (x.length >= 4 && w.startsWith(x)));
  const found = tt.filter(hit).length;
  return Math.round((60 * found) / tt.length);
}

const MIN_SCORE = 40;

export type MatchResult =
  | { ok: true; occurrence: Occurrence }
  | { ok: false; reason: "none" }
  | { ok: false; reason: "ambiguous"; options: Occurrence[] };

/**
 * Finds the occurrence a spoken reference means. With a date, only that day is searched.
 * Without one, upcoming occurrences win and the soonest is picked. Different titles tying is ambiguous.
 */
export function findTarget(list: Occurrence[], target: string, opts: { date?: string | null; now: LocalNow }): MatchResult {
  let pool = opts.date ? list.filter((o) => o.date === opts.date) : list;
  if (!opts.date) {
    const upcoming = pool.filter((o) => o.date > opts.now.date || (o.date === opts.now.date && o.endMin > opts.now.minute));
    if (upcoming.some((o) => matchScore(o, target) >= MIN_SCORE)) pool = upcoming;
  }
  const scored = pool.map((o) => ({ o, score: matchScore(o, target) })).filter((x) => x.score >= MIN_SCORE);
  if (scored.length === 0) return { ok: false, reason: "none" };
  const top = Math.max(...scored.map((x) => x.score));
  const best = scored
    .filter((x) => x.score === top)
    .map((x) => x.o)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.startMin - b.startMin));
  const titles = new Set(best.map((o) => normalizeTitle(o.title)));
  if (titles.size > 1) {
    const seen = new Set<string>();
    const options = best.filter((o) => {
      const k = normalizeTitle(o.title);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return { ok: false, reason: "ambiguous", options };
  }
  return { ok: true, occurrence: best[0]! };
}
