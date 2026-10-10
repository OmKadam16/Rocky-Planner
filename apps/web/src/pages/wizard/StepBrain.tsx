// Wizard step 4: start the brain. The copyable terminal command plus
// Check again (re-runs the checks below), a live microphone row, and a
// record-and-play-back voice self-test that needs no brain at all.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioLines, BrainCircuit, Check, Copy, Loader2, Mic, Play, RefreshCw } from 'lucide-react';
import { WizardContinue } from './StepProfile';

const BRAIN_CMD = 'npm run dev -w apps/brain';

type MicState = 'unknown' | 'granted' | 'prompt' | 'denied';

async function queryMic(): Promise<MicState> {
  try {
    const perm = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    if (perm.state === 'granted') return 'granted';
    if (perm.state === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'unknown';
  }
}

function CheckRow({
  icon,
  title,
  sub,
  right,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  right: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-surface2 text-ink2">
          {icon}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-bold">{title}</span>
          <span className="text-sm text-ink2">{sub}</span>
        </span>
        <span className="flex-none text-[13px] text-ink3">{right}</span>
      </div>
      {children}
    </div>
  );
}

export function WizardBrainStep({ onContinue }: { onContinue: () => void }) {
  const [mic, setMic] = useState<MicState>('unknown');
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [recording, setRecording] = useState(false);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const checkAgain = useCallback(async () => {
    setChecking(true);
    setMic(await queryMic());
    setLastChecked(
      new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }),
    );
    setChecking(false);
  }, []);

  useEffect(() => {
    void checkAgain();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (clipUrl) URL.revokeObjectURL(clipUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allowMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = stream;
      setMic('granted');
    } catch {
      setMic('denied');
    }
  }, []);

  const copyCmd = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(BRAIN_CMD);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }, []);

  const testVoice = useCallback(async () => {
    setVoiceError(null);
    if (recording) {
      recRef.current?.stop();
      return;
    }
    try {
      const stream =
        streamRef.current ?? (await navigator.mediaDevices.getUserMedia({ audio: true }));
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      recRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        setRecording(false);
        if (clipUrl) URL.revokeObjectURL(clipUrl);
        setClipUrl(URL.createObjectURL(new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })));
      };
      rec.start();
      setRecording(true);
      window.setTimeout(() => {
        if (recRef.current?.state === 'recording') recRef.current.stop();
      }, 3000);
    } catch {
      setVoiceError('Could not open the microphone. Allow access, then try again.');
    }
  }, [recording, clipUrl]);

  const micSub =
    mic === 'granted'
      ? 'Ready — Rocky can hear you on this laptop'
      : mic === 'denied'
        ? 'Blocked — allow microphone access in your browser settings'
        : 'Needed for voice commands';

  return (
    <div className="flex w-full max-w-[760px] flex-col gap-5">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight">Start Rocky&apos;s brain on this laptop</h1>
        <p className="mt-2 max-w-[560px] text-[16px] leading-relaxed text-ink2">
          The AI and speech recognition run here, offline. Nothing you say is sent to a server.
        </p>
      </div>

      <CheckRow
        icon={<BrainCircuit size={17} aria-hidden />}
        title="Rocky Brain app running"
        sub="Start it in a terminal, then Check again."
        right={checking ? 'Checking…' : lastChecked ? `Checked ${lastChecked}` : 'Not running yet'}
      >
        <div className="flex flex-wrap items-center gap-2">
          <code className="tnum min-w-0 flex-1 break-all rounded-lg bg-bg px-3 py-2.5 font-mono text-[13px] text-ink1">
            {BRAIN_CMD}
          </code>
          <button
            type="button"
            onClick={() => void copyCmd()}
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-line px-3.5 text-sm font-bold"
          >
            {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={() => void checkAgain()}
            disabled={checking}
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-line px-3.5 text-sm font-bold disabled:opacity-50"
          >
            {checking ? <Loader2 size={15} aria-hidden className="animate-spin" /> : <RefreshCw size={15} aria-hidden />}
            Check again
          </button>
        </div>
      </CheckRow>

      <CheckRow
        icon={<BrainCircuit size={17} aria-hidden />}
        title="Language model ready (qwen3.5:2b)"
        sub="Starts with the Brain app — no download step here."
        right="Waiting for the Brain app"
      />
      <CheckRow
        icon={<AudioLines size={17} aria-hidden />}
        title="Speech recognition ready (Whisper)"
        sub="Starts with the Brain app — runs fully offline."
        right="Waiting for the Brain app"
      />
      <CheckRow
        icon={<Mic size={17} aria-hidden />}
        title="Microphone allowed"
        sub={micSub}
        right={mic === 'granted' ? 'Ready' : mic === 'denied' ? 'Blocked' : 'Checking…'}
      >
        {mic !== 'granted' && (
          <button
            type="button"
            onClick={() => void allowMic()}
            className="inline-flex h-10 items-center self-start rounded-[10px] bg-accent px-4 text-sm font-bold text-white"
          >
            Allow microphone
          </button>
        )}
      </CheckRow>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-4">
        <button
          type="button"
          onClick={() => void testVoice()}
          disabled={mic !== 'granted' || recording}
          title={mic === 'granted' ? 'Record 3 seconds, then play it back' : 'Allow the microphone first'}
          className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-line px-4 text-sm font-bold disabled:opacity-50"
        >
          {recording ? <Loader2 size={15} aria-hidden className="animate-spin" /> : <Mic size={15} aria-hidden />}
          {recording ? 'Recording…' : 'Test voice'}
        </button>
        {clipUrl && !recording && (
          <audio controls src={clipUrl} className="h-10 max-w-full" aria-label="Your test recording" />
        )}
        <span className="text-sm text-ink2">
          {recording
            ? 'Say something — recording stops after 3 seconds.'
            : clipUrl
              ? 'Play it back — that is exactly what Rocky would hear.'
              : mic === 'granted'
                ? 'Records 3 seconds and plays it back on this laptop.'
                : 'Available once the microphone is allowed.'}
        </span>
        {voiceError && <span role="alert" className="w-full text-sm text-danger">{voiceError}</span>}
      </div>

      <WizardContinue saving={false} onContinue={onContinue} label="Continue" />
      <span className="-mt-2 flex items-center gap-1.5 text-sm text-ink3">
        <Play size={13} aria-hidden /> You can come back any time — the brain rows resolve once it runs.
      </span>
    </div>
  );
}
