// Settings → Privacy: exactly what leaves this laptop, in plain words.
// Memory and AI stay local; the relay only carries account, calendar, and
// voice-command rows.

import { ShieldCheck } from 'lucide-react';
import { Card, CardTitle } from '../../components/Page';

const ROWS: { data: string; goes: string; note: string }[] = [
  {
    data: 'Sign-in and session',
    goes: 'Supabase Auth',
    note: 'So the laptop and phone share one account. Passwords never touch Rocky code.',
  },
  {
    data: 'Calendar, tasks, assignments, classes',
    goes: 'Supabase Postgres (your rows only)',
    note: 'Syncs the laptop and phone. Row-level security keeps every account to its own rows.',
  },
  {
    data: 'Voice commands and replies',
    goes: 'Supabase relay tables',
    note: 'Status, transcript, and reply text so the phone and laptop stay in step.',
  },
  {
    data: 'Voice clips',
    goes: 'Supabase Storage, then deleted',
    note: 'Uploaded for transcription on the laptop and deleted right after.',
  },
  {
    data: 'Pairing codes',
    goes: 'Supabase devices table',
    note: 'Single-use, expire in 5 minutes, and cleared the moment a phone claims them.',
  },
  {
    data: 'Memory (pages you read, searches)',
    goes: 'Nowhere — laptop only',
    note: 'Stored in a database on this machine. Never uploaded, never sent to any AI service.',
  },
  {
    data: 'AI prompts and answers',
    goes: 'Nowhere — laptop only',
    note: 'The model runs on this laptop via Ollama. No cloud AI API is ever called.',
  },
];

export function PrivacyPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <Card labelledBy="privacy-heading">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-success-soft text-success">
            <ShieldCheck size={18} aria-hidden />
          </span>
          <div className="flex flex-col gap-1">
            <CardTitle id="privacy-heading">What leaves this laptop</CardTitle>
            <span className="text-sm leading-relaxed text-ink2">
              Short version: your account and calendar sync through the relay so
              the phone works. Your memory and AI never leave this machine.
            </span>
          </div>
        </div>
        <dl className="flex flex-col gap-1">
          {ROWS.map((r, i) => (
            <div
              key={r.data}
              className="flex flex-col gap-0.5 py-3"
              style={{ borderTop: i ? '1px solid var(--line)' : '0' }}
            >
              <dt className="text-[15px] font-bold">{r.data}</dt>
              <dd className="m-0 text-sm font-semibold text-accent-ink">{r.goes}</dd>
              <dd className="m-0 text-sm leading-relaxed text-ink2">{r.note}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
