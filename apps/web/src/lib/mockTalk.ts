// DEV-ONLY mocked voice command. The real relay (the `commands` table +
// brain pipeline) is Claude Code's job — this file invents NO row shape and
// writes NOTHING to Supabase. It only drives the TalkButton UI states so the
// full flow can be exercised before the brain exists.
//
// Gate: import.meta.env.DEV + VITE_ROCKY_MOCK_TALK=1. Never set the flag in
// render.yaml. With the flag off, TalkButton shows an honest "relay not
// running yet" note instead of fake success.

export function isMockTalkEnabled(): boolean {
  try {
    return import.meta.env.DEV === true && import.meta.env.VITE_ROCKY_MOCK_TALK === '1';
  } catch {
    return false;
  }
}

export interface MockDiffMove {
  title: string;
  from: string;
  to: string;
}

export interface MockResult {
  reply: string;
  transcript: string;
  added: string[];
  moved: MockDiffMove[];
  sttMs: number;
  llmMs: number;
  totalMs: number;
}

export interface MockClarify {
  transcript: string;
  question: string;
  options: string[];
}

// Deterministic two-script cycle so every state is demonstrable:
// odd runs return a result card, even runs ask a clarifying question.
const SCRIPTS: Array<{ transcript: string; kind: 'result' | 'clarify' }> = [
  { transcript: 'Move gym to 7 pm', kind: 'result' },
  { transcript: 'Cancel it', kind: 'clarify' },
];

let runs = 0;

function jitter(base: number, spread: number): number {
  return Math.round(base + (Math.random() * 2 - 1) * spread);
}

export function mockWorkStagesMs(): { sending: number; listening: number; thinking: number } {
  return { sending: jitter(500, 150), listening: jitter(900, 300), thinking: jitter(1600, 500) };
}

export function nextMockScript(): { transcript: string; kind: 'result' | 'clarify' } {
  const s = SCRIPTS[runs % SCRIPTS.length]!;
  runs += 1;
  return s;
}

export function mockResultFor(transcript: string): MockResult {
  const sttMs = jitter(380, 120);
  const llmMs = jitter(1900, 600);
  return {
    transcript,
    reply: 'Done. Gym session moves to 7:00 PM, Study block shifts to 5:30 PM.',
    added: [],
    moved: [
      { title: 'Gym session', from: '6:00 PM', to: '7:00 PM' },
      { title: 'Study block', from: '4:00 PM', to: '5:30 PM' },
    ],
    sttMs,
    llmMs,
    totalMs: sttMs + llmMs + jitter(250, 80),
  };
}

export function mockClarifyFor(transcript: string): MockClarify {
  return {
    transcript,
    question: 'Which one do you mean?',
    options: ['Gym session today', 'Study block today'],
  };
}
