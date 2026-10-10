// Activity: real voice-command history from the commands table — source,
// text, status, reply, and the latency HUD numbers.

import { useEffect, useState } from 'react';
import { History, Laptop, Smartphone } from 'lucide-react';
import type { Command } from '@rocky/core';
import { fetchRecentCommands } from '../lib/queries';
import { Card, EmptyState, PageHeader } from '../components/Page';
import { StatusBadge } from '../components/StatusBadge';

function statusOf(c: Command): { tone: 'success' | 'accent' | 'danger'; label: string } {
  if (c.status === 'done') return { tone: 'success', label: 'Done' };
  if (c.status === 'error') return { tone: 'danger', label: 'Error' };
  return { tone: 'accent', label: 'Working…' };
}

function latencyOf(c: Command): string | null {
  const parts: string[] = [];
  if (c.stt_ms != null) parts.push(`STT ${c.stt_ms} ms`);
  if (c.llm_ms != null) parts.push(`AI ${c.llm_ms} ms`);
  if (c.total_ms != null) parts.push(`Total ${c.total_ms} ms`);
  return parts.length ? parts.join(' · ') : null;
}

export function ActivityPage() {
  const [commands, setCommands] = useState<Command[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchRecentCommands(50)
      .then((c) => {
        if (!alive) return;
        setCommands(c);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'Could not load activity.');
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-8">
      <PageHeader
        title="Activity"
        sub="Every voice command, newest first, with what Rocky did about it."
      />
      {loading ? (
        <p className="text-sm text-ink3">Loading activity…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-danger">{error}</p>
      ) : commands.length === 0 ? (
        <EmptyState
          icon={History}
          title="No activity yet"
          body="Talk to Rocky from the laptop or your phone and each command lands here with its reply and timing."
        />
      ) : (
        <Card>
          <ul className="flex list-none flex-col gap-1 p-0">
            {commands.map((c, i) => {
              const st = statusOf(c);
              const text = (c.transcript ?? c.text ?? '').trim() || '(voice message)';
              const latency = latencyOf(c);
              return (
                <li
                  key={c.id}
                  className="flex items-start gap-3 py-3"
                  style={{ borderTop: i ? '1px solid var(--line)' : '0' }}
                >
                  <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-surface2 text-ink2">
                    {c.source === 'phone' ? (
                      <Smartphone size={16} aria-hidden />
                    ) : (
                      <Laptop size={16} aria-hidden />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[15px] font-semibold">{text}</span>
                      <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                    </span>
                    <span className="text-xs text-ink3">
                      {c.source === 'phone' ? 'From phone' : 'Laptop mic'} ·{' '}
                      {new Date(c.created_at).toLocaleString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                    {c.reply_text && (
                      <span className="text-sm leading-relaxed text-ink2">{c.reply_text}</span>
                    )}
                    {c.status === 'error' && c.error && (
                      <span className="text-sm text-danger">{c.error}</span>
                    )}
                    {latency && (
                      <span className="tnum font-mono text-[11px] text-ink3">{latency}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
