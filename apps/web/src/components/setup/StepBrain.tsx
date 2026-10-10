import { useCallback, useEffect, useState } from 'react';
import { AudioLines, CircleAlert, CircleCheck, CircleX, Loader2, Mic, RefreshCw } from 'lucide-react';
import { checkMicrophone, type BrainCheckState, type BrainChecks } from '../../lib/onboarding';
import { readBrainAppAlive } from '../../lib/setupApi';
import type { StepApi } from '../../pages/SetupPage';

type RowKey = keyof BrainChecks;

const ROWS: Array<{ key: RowKey; label: string }> = [
  { key: 'app', label: 'Rocky Brain app running' },
  { key: 'model', label: 'Language model ready (qwen3.5:2b)' },
  { key: 'stt', label: 'Speech recognition ready (Whisper)' },
  { key: 'mic', label: 'Microphone allowed' },
];

const META: Record<BrainCheckState, { label: string; color: string; icon: typeof Loader2 }> = {
  checking: { label: 'Checking…', color: 'var(--ink3)', icon: Loader2 },
  ready: { label: 'Ready', color: 'var(--success)', icon: CircleCheck },
  action: { label: 'Needs action', color: 'var(--warning)', icon: CircleAlert },
  failed: { label: 'Failed', color: 'var(--danger)', icon: CircleX },
};

/**
 * Wizard step 4 — Brain checklist. Brain-app liveness comes from the laptop
 * row's last_seen (< 45 s). Model + STT stay "needs action" until the brain
 * reports its own health — TODO(Phase 2): point them at the brain's health
 * signal instead of this placeholder. No model-size selector anywhere.
 */
export function StepBrain({ apiRef }: { apiRef: (api: StepApi | null) => void }) {
  const [checks, setChecks] = useState<BrainChecks>({ app: 'checking', model: 'checking', stt: 'checking', mic: 'checking' });

  apiRef({ save: async () => null });

  const checkAll = useCallback(async () => {
    setChecks({ app: 'checking', model: 'checking', stt: 'checking', mic: 'checking' });
    const [appAlive, micOk] = await Promise.all([readBrainAppAlive(), checkMicrophone()]);
    setChecks({
      app: appAlive ? 'ready' : 'action',
      // TODO(Phase 2): the brain reports model + STT health itself; read it here.
      model: appAlive ? 'action' : 'action',
      stt: appAlive ? 'action' : 'action',
      mic: micOk ? 'ready' : 'action',
    });
  }, []);

  useEffect(() => {
    void checkAll();
  }, [checkAll]);

  async function allowMic() {
    setChecks((c) => ({ ...c, mic: 'checking' }));
    const ok = await checkMicrophone();
    setChecks((c) => ({ ...c, mic: ok ? 'ready' : 'action' }));
  }

  const allReady = Object.values(checks).every((v) => v === 'ready');

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 md:px-8">
      <h1 className="text-[28px] font-bold tracking-tight">Start Rocky&apos;s brain on this laptop</h1>
      <p className="mt-2 max-w-[560px] text-[16px] leading-relaxed text-ink2">
        The AI and speech recognition run here, offline. Nothing you say is sent to a server.
      </p>
      <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-surface2 px-3 py-1 text-xs font-semibold text-ink2">
        Model qwen3.5:2b · on-device
      </p>

      <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-surface">
        {ROWS.map((row, i) => {
          const st = checks[row.key];
          const meta = META[st];
          const Icon = meta.icon;
          return (
            <div key={row.key} className="flex gap-3.5 p-[18px_20px]" style={{ borderTop: i ? '1px solid var(--line)' : '0' }}>
              <span className="grid h-6 w-6 flex-none place-items-center" style={{ color: meta.color }}>
                <Icon size={20} aria-hidden className={st === 'checking' ? 'animate-spin' : undefined} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[16px] font-semibold">{row.label}</span>
                  <span className="text-xs font-semibold" style={{ color: meta.color }}>
                    {meta.label}
                  </span>
                </div>
                <RowBody
                  rowKey={row.key}
                  state={st}
                  onCheckAgain={() => void checkAll()}
                  onAllowMic={() => void allowMic()}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-4 rounded-2xl border border-line bg-surface2 p-4">
        <button
          type="button"
          disabled
          title="Available once everything is ready"
          className="inline-flex h-10 flex-none items-center gap-2 rounded-[10px] border border-line bg-surface px-4 text-sm font-semibold text-ink2 disabled:opacity-45"
        >
          <AudioLines size={16} aria-hidden />
          Test voice
        </button>
        <span className="flex-1 text-sm text-ink2">
          {allReady ? 'Say something to hear Rocky reply.' : 'Available once everything is ready.'}
        </span>
      </div>
    </div>
  );
}

function RowBody({
  rowKey,
  state,
  onCheckAgain,
  onAllowMic,
}: {
  rowKey: RowKey;
  state: BrainCheckState;
  onCheckAgain: () => void;
  onAllowMic: () => void;
}) {
  if (state === 'ready') {
    return (
      <span className="text-sm text-ink2">
        {rowKey === 'app' && 'Running on this laptop.'}
        {rowKey === 'model' && 'qwen3.5:2b loaded · on-device.'}
        {rowKey === 'stt' && 'Whisper · on-device.'}
        {rowKey === 'mic' && 'Rocky can hear you.'}
      </span>
    );
  }
  if (state === 'checking') return <span className="text-sm text-ink2">Checking…</span>;
  if (rowKey === 'mic') {
    return (
      <span className="flex flex-col gap-2">
        <span className="text-sm text-ink2">Rocky needs the mic to hear you.</span>
        <span>
          <button
            type="button"
            onClick={onAllowMic}
            className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-accent px-4 text-sm font-semibold text-white"
          >
            <Mic size={14} aria-hidden />
            Allow microphone
          </button>
        </span>
      </span>
    );
  }
  // App / model / STT need-action rows. The brain reports model + STT itself
  // in Phase 2; until then these stay here with a re-check.
  return (
    <span className="flex flex-col gap-2">
      <span className="text-sm text-ink2">
        {rowKey === 'app'
          ? "Rocky Brain isn't running. Keep Rocky open on this laptop."
          : 'Waiting for the Brain app — keep Rocky open on this laptop.'}
      </span>
      <span>
        <button
          type="button"
          onClick={onCheckAgain}
          className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-accent px-4 text-sm font-semibold text-white"
        >
          <RefreshCw size={14} aria-hidden />
          Check again
        </button>
      </span>
    </span>
  );
}
