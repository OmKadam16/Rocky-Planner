// Settings → Voice: real local preferences + factual pipeline status.
// Speech runs on this laptop; commands need the brain process.

import { Mic } from 'lucide-react';
import { useSpeakReplies } from '../../lib/prefs';
import { useLaptopPresence } from '../../lib/remote';
import { Card, CardTitle } from '../../components/Page';

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left"
    >
      <span
        aria-hidden
        className="relative h-6 w-11 flex-none rounded-full transition-colors"
        style={{ background: checked ? 'var(--accent)' : 'var(--ink4)' }}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
          style={{ left: checked ? '22px' : '2px' }}
        />
      </span>
      <span className="flex flex-col">
        <span className="text-[15px] font-semibold">{label}</span>
        <span className="text-sm text-ink2">{hint}</span>
      </span>
    </button>
  );
}

export function VoicePage() {
  const [speak, setSpeak] = useSpeakReplies();
  const brain = useLaptopPresence(true);
  const brainRunning = brain.status === 'online';

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <Card labelledBy="voice-prefs">
        <CardTitle id="voice-prefs">Voice</CardTitle>
        <Toggle
          checked={speak}
          onChange={setSpeak}
          label="Speak replies aloud"
          hint="Uses this device's built-in speech — nothing is sent to a cloud voice service."
        />
      </Card>
      <Card labelledBy="voice-pipeline">
        <CardTitle id="voice-pipeline">How talking to Rocky works</CardTitle>
        <ul className="flex list-none flex-col gap-2.5 p-0 text-sm leading-relaxed text-ink2">
          <li className="flex gap-2.5">
            <Mic size={15} aria-hidden className="mt-0.5 shrink-0 text-ink3" />
            <span>
              The mic is push-to-talk. Speech-to-text runs on this laptop
              (faster-whisper), and the reply is spoken by the device you asked from.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span
              aria-hidden
              className="mt-1.5 h-2 w-2 flex-none rounded-full"
              style={{ background: brainRunning ? 'var(--success)' : 'var(--ink4)' }}
            />
            <span>
              {brainRunning
                ? 'The brain is running — voice commands work right now.'
                : 'Voice commands run when the brain is on this laptop. It is not running at the moment.'}
            </span>
          </li>
        </ul>
      </Card>
    </div>
  );
}
