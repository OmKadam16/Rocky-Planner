// Settings → AI: which model answers, and the latency HUD switch.
// The model name is read-only; all AI runs on this laptop via Ollama.

import { BrainCircuit } from 'lucide-react';
import { useShowLatency } from '../../lib/prefs';
import { Card, CardTitle } from '../../components/Page';

export function AiPage() {
  const [showLatency, setShowLatency] = useShowLatency();

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <Card labelledBy="ai-model">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-accent-soft text-accent-ink">
            <BrainCircuit size={18} aria-hidden />
          </span>
          <div className="flex flex-col gap-1">
            <CardTitle id="ai-model">Model</CardTitle>
            <span className="tnum font-mono text-[15px] font-semibold">qwen3.5:2b</span>
            <span className="text-sm leading-relaxed text-ink2">
              Runs on this laptop through Ollama — no cloud AI. Rocky only
              extracts your intent; dates and rescheduling are computed by
              deterministic code, never by the model.
            </span>
          </div>
        </div>
      </Card>
      <Card labelledBy="ai-hud">
        <CardTitle id="ai-hud">Latency HUD</CardTitle>
        <button
          type="button"
          role="switch"
          aria-checked={showLatency}
          onClick={() => setShowLatency(!showLatency)}
          className="flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left"
        >
          <span
            aria-hidden
            className="relative h-6 w-11 flex-none rounded-full transition-colors"
            style={{ background: showLatency ? 'var(--accent)' : 'var(--ink4)' }}
          >
            <span
              className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
              style={{ left: showLatency ? '22px' : '2px' }}
            />
          </span>
          <span className="flex flex-col">
            <span className="text-[15px] font-semibold">Show speech / AI / total timing</span>
            <span className="text-sm text-ink2">
              Shows the STT, AI, and total milliseconds on voice results. Totals
              turn amber over 3 s and red over 6 s.
            </span>
          </span>
        </button>
      </Card>
    </div>
  );
}
