import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Intent } from "@rocky/core";
import { extractIntent } from "./llm";
import { tryFastPath } from "./fastpath";

// Intent eval: 20+ fixture phrases through the real pipeline entry
// (fast path first, live Ollama when it misses). Prints per-case results,
// accuracy, and p50/p95 LLM ms. Needs Ollama running with ROCKY_LLM pulled:
//   ollama pull qwen3.5:2b && npm run brain:eval -w apps/brain

interface FixtureCase {
  utterance: string;
  schedule?: string;
  expect: {
    intent: string;
    title?: string;
    target?: string;
    targetDayText?: string;
    dayText?: string;
    timeText?: string;
    durationMin?: number;
    shiftMin?: number;
  };
}

interface Fixtures {
  now: { date: string; weekday: string; timezone: string };
  cases: FixtureCase[];
}

function sameWord(a: string | null, b: string | undefined): boolean {
  if (b === undefined) return true;
  if (a == null) return false;
  return a.toLowerCase() === b.toLowerCase();
}

function checkIntent(got: Intent, want: FixtureCase["expect"]): string[] {
  const misses: string[] = [];
  if (got.intent !== want.intent) misses.push(`intent: got ${got.intent}`);
  if (!sameWord(got.title, want.title)) misses.push(`title: got ${JSON.stringify(got.title)}`);
  if (!sameWord(got.target, want.target)) misses.push(`target: got ${JSON.stringify(got.target)}`);
  if (!sameWord(got.targetDayText, want.targetDayText)) misses.push(`targetDayText: got ${JSON.stringify(got.targetDayText)}`);
  if (!sameWord(got.dayText, want.dayText)) misses.push(`dayText: got ${JSON.stringify(got.dayText)}`);
  if (!sameWord(got.timeText, want.timeText)) misses.push(`timeText: got ${JSON.stringify(got.timeText)}`);
  if (want.durationMin !== undefined && got.durationMin !== want.durationMin) {
    misses.push(`durationMin: got ${got.durationMin}`);
  }
  if (want.shiftMin !== undefined && got.shiftMin !== want.shiftMin) {
    misses.push(`shiftMin: got ${got.shiftMin}`);
  }
  return misses;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

async function main(): Promise<void> {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "tests", "intents.fixtures.json");
  const fixtures = JSON.parse(readFileSync(root, "utf8")) as Fixtures;
  let pass = 0;
  let fastPathHits = 0;
  const llmMs: number[] = [];
  console.log(`model: ${process.env.ROCKY_LLM ?? "qwen3.5:2b (default)"}  cases: ${fixtures.cases.length}\n`);
  for (const c of fixtures.cases) {
    const t0 = Date.now();
    const fp = tryFastPath(c.utterance, fixtures.now.date);
    let intent: Intent;
    let source: string;
    let ms: number;
    if (fp) {
      intent = fp.intent;
      source = "fast_path";
      ms = Date.now() - t0;
      fastPathHits += 1;
    } else {
      const r = await extractIntent(
        c.utterance,
        { scheduleText: c.schedule ?? "", now: fixtures.now },
      );
      intent = r.intent;
      source = "llm";
      ms = r.ms;
      llmMs.push(ms);
    }
    const misses = checkIntent(intent, c.expect);
    if (misses.length === 0) {
      pass += 1;
      console.log(`PASS [${source} ${ms}ms] ${c.utterance}`);
    } else {
      console.log(`FAIL [${source} ${ms}ms] ${c.utterance}\n     ${misses.join("; ")}`);
    }
  }
  llmMs.sort((a, b) => a - b);
  const n = fixtures.cases.length;
  console.log(
    `\naccuracy: ${pass}/${n} (${((pass / n) * 100).toFixed(1)}%)  ` +
      `fast_path: ${fastPathHits}/${n}  ` +
      `llm: ${llmMs.length} calls, p50 ${percentile(llmMs, 50)}ms, p95 ${percentile(llmMs, 95)}ms`,
  );
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
