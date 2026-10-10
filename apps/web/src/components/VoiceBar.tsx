// Voice pill (top bar) + listening overlay (bottom center).
// Local-only visuals until the brain lands — see lib/voice.tsx.

import { Mic } from 'lucide-react';
import { useVoiceBar } from '../lib/voice';

export function VoicePill() {
  const { phase, toggle } = useVoiceBar();
  const active = phase !== 'idle';
  const text =
    phase === 'listening'
      ? 'Listening…'
      : phase === 'thinking'
        ? 'Thinking…'
        : phase === 'unwired'
          ? 'Voice arrives with the brain'
          : 'Say “Hey Rocky…” or press Space';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={active ? 'Stop voice preview' : 'Talk to Rocky (preview)'}
      className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full border bg-surface px-1.5"
      style={{
        maxWidth: 580,
        borderColor: active ? 'var(--accent)' : 'var(--line)',
        boxShadow: active ? '0 0 0 4px var(--accent-soft)' : 'none',
      }}
    >
      <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-accent text-white">
        <Mic size={16} aria-hidden />
      </span>
      <span
        className="min-w-0 flex-1 truncate text-left text-sm"
        style={{ color: active ? 'var(--ink1)' : 'var(--ink3)' }}
      >
        {text}
      </span>
      <span className="tnum mr-1 flex-none rounded-md border border-line px-2 py-0.5 text-xs text-ink3">
        Space
      </span>
    </button>
  );
}

export function VoiceOverlay() {
  const { phase, elapsedMs, toggle, dismiss } = useVoiceBar();
  if (phase === 'idle') return null;
  const unwired = phase === 'unwired';
  return (
    <div
      role="dialog"
      aria-label={unwired ? 'Voice not yet available' : 'Voice preview'}
      className="fixed bottom-6 left-1/2 z-50 w-[min(580px,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-line bg-surface p-6 shadow-card"
    >
      <div className="flex items-center gap-4">
        <span
          aria-hidden
          className="grid h-16 w-16 flex-none place-items-center rounded-full bg-accent text-white"
          style={{ animation: unwired ? undefined : 'rk-breathe 1.6s ease-in-out infinite' }}
        >
          <Mic size={26} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-[0.06em] text-accent-ink">
            {phase === 'listening' ? 'Listening · laptop mic' : phase === 'thinking' ? 'Thinking…' : 'Coming with the brain'}
          </span>
          <span className="text-xl font-semibold leading-snug">
            {unwired ? 'Voice arrives with the brain' : phase === 'thinking' ? 'Thinking…' : 'Listening…'}
          </span>
        </div>
        {!unwired && (
          <span className="tnum flex-none font-mono text-xs text-ink2">
            {(elapsedMs / 1000).toFixed(1)} s
          </span>
        )}
      </div>
      {!unwired && <VoiceWave />}
      {unwired ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-ink2">
            Space and the mic only preview this UI until Phase 2/3 — nothing
            was recorded or sent anywhere.
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={dismiss}
              className="inline-flex h-10 items-center rounded-[10px] bg-accent px-5 text-sm font-bold text-white"
            >
              Close
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={toggle}
            className="text-sm font-semibold text-ink2 hover:text-ink1"
          >
            {phase === 'listening' ? 'Tap to finish' : 'Cancel'}
          </button>
          <span className="text-xs text-ink3">Esc to cancel</span>
        </div>
      )}
    </div>
  );
}

export function VoiceWave() {
  return (
    <div className="mt-4 flex h-8 items-center gap-1" aria-hidden>
      {Array.from({ length: 48 }).map((_, i) => (
        <span
          key={i}
          className="w-1 rounded-full bg-accent"
          style={{
            height: '100%',
            transformOrigin: 'center',
            animation: `rk-wave 1s ease-in-out ${(i % 12) * 0.08}s infinite`,
            scale: `${0.5 + ((i * 37) % 10) / 12}`,
          }}
        />
      ))}
    </div>
  );
}
