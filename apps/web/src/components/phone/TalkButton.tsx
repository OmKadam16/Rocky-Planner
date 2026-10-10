import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  CircleAlert,
  CircleCheck,
  Clock,
  Loader2,
  MessageCircleQuestion,
  Mic,
  MicOff,
  SendHorizontal,
  Undo2,
} from 'lucide-react';
import { buzz } from '../../lib/pairing';
import { speakLocal, useSpeakReplies, useVoiceSpeed } from '../../lib/prefs';
import { clearQueue, enqueueCommand, readQueue, type QueuedCommand } from '../../lib/remote';
import {
  isMockTalkEnabled,
  mockClarifyFor,
  mockResultFor,
  mockWorkStagesMs,
  nextMockScript,
  type MockClarify,
  type MockResult,
} from '../../lib/mockTalk';

export interface TalkLatency {
  sttMs: number;
  llmMs: number;
  totalMs: number;
}

type VoiceState =
  | 'idle'
  | 'primer'
  | 'denied'
  | 'listening'
  | 'sent'
  | 'working'
  | 'result'
  | 'clarify'
  | 'queued'
  | 'error'
  | 'unwired';

const STAGES = ['Sending', 'Laptop is listening', 'Thinking'];

/**
 * Phone talk button + voice overlay. Push-to-talk (tap toggles).
 * With VITE_ROCKY_MOCK_TALK=1 (dev only) a local mock drives the full
 * result/clarify flow; otherwise recording stops at "sent" and an honest
 * "relay not running yet" note appears. The real `commands` relay is the
 * brain's job — nothing here invents its row shape.
 */
export function TalkButton({
  laptopOffline,
  onLatency,
}: {
  laptopOffline: boolean;
  onLatency: (l: TalkLatency | null) => void;
}) {
  const mock = isMockTalkEnabled();
  const [speak] = useSpeakReplies();
  const [speed] = useVoiceSpeed();
  const [voice, setVoice] = useState<VoiceState>('idle');
  const [micGranted, setMicGranted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [stage, setStage] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [result, setResult] = useState<MockResult | null>(null);
  const [clarify, setClarify] = useState<MockClarify | null>(null);
  const [undone, setUndone] = useState(false);
  const [queue, setQueue] = useState<QueuedCommand[]>(() => readQueue());
  const timers = useRef<number[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const stopMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const resetToIdle = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    stopMic();
    setVoice('idle');
    setElapsed(0);
    setStage(0);
    setTranscript('');
    setResult(null);
    setClarify(null);
    setUndone(false);
  }, [stopMic]);

  // Listening stopwatch.
  useEffect(() => {
    if (voice !== 'listening') return;
    setElapsed(0);
    const started = Date.now();
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 250);
    return () => window.clearInterval(id);
  }, [voice]);

  const requestMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setMicGranted(true);
      return true;
    } catch (e) {
      const name = e instanceof Error ? e.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') setVoice('denied');
      else setVoice('error');
      return false;
    }
  }, []);

  const runWorking = useCallback(
    (script: { transcript: string; kind: 'result' | 'clarify' }) => {
      setVoice('working');
      setStage(0);
      setTranscript(script.transcript);
      const { sending, listening, thinking } = mockWorkStagesMs();
      later(() => setStage(1), sending);
      later(() => setStage(2), sending + listening);
      later(() => {
        if (script.kind === 'result') {
          const r = mockResultFor(script.transcript);
          setResult(r);
          onLatency({ sttMs: r.sttMs, llmMs: r.llmMs, totalMs: r.totalMs });
          setVoice('result');
          speakLocal(r.reply, speak, speed);
        } else {
          setClarify(mockClarifyFor(script.transcript));
          setVoice('clarify');
          speakLocal('Which one do you mean?', speak, speed);
        }
      }, sending + listening + thinking);
    },
    [later, onLatency, speak],
  );

  const send = useCallback(() => {
    stopMic();
    buzz(15);
    speakLocal('On it.', speak, speed);
    setVoice('sent');
    later(() => {
      if (laptopOffline) {
        const text = mock ? nextMockScript().transcript : 'Voice message';
        // Mock consumes a script for parity; real transcripts come from the brain.
        setQueue(enqueueCommand(text));
        setVoice('queued');
        return;
      }
      if (!mock) {
        setVoice('unwired');
        return;
      }
      runWorking(nextMockScript());
    }, 600);
  }, [later, laptopOffline, mock, runWorking, speak, stopMic]);

  const tapTalk = useCallback(async () => {
    if (voice === 'listening') {
      send();
      return;
    }
    if (voice !== 'idle') return;
    if (!micGranted) {
      setVoice('primer');
      return;
    }
    setTranscript('');
    setVoice('listening');
  }, [voice, micGranted, send]);

  const sendQueuedNow = useCallback(() => {
    const [first, ...rest] = readQueue();
    if (!first) {
      setVoice('idle');
      return;
    }
    try {
      localStorage.setItem('rocky.voiceQueue', JSON.stringify(rest));
    } catch {
      /* ignore */
    }
    setQueue(rest);
    if (!mock) {
      setVoice('unwired');
      return;
    }
    runWorking({ transcript: first.text, kind: 'result' });
  }, [mock, runWorking]);

  const cancelQueue = useCallback(() => {
    clearQueue();
    setQueue([]);
    setVoice('idle');
  }, []);

  const hint =
    voice === 'listening'
      ? 'Tap to send · tap outside to cancel'
      : voice === 'working'
        ? ''
        : laptopOffline
          ? 'Hold to talk · will queue'
          : 'Hold to talk';

  const overlay = voice !== 'idle';

  return (
    <>
      {queue.length > 0 && (voice === 'idle' || voice === 'queued') && (
        <div className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-warning bg-warning-soft py-1.5 pl-3.5 pr-1.5 text-ink1">
          <Clock size={16} aria-hidden className="text-warning" />
          <span className="text-sm font-semibold">
            Waiting for your laptop · {queue.length} command{queue.length === 1 ? '' : 's'}
          </span>
          {!laptopOffline && (
            <button
              type="button"
              onClick={sendQueuedNow}
              className="inline-flex h-8 items-center rounded-full bg-accent px-3 text-xs font-bold text-white"
            >
              Send now
            </button>
          )}
          <button
            type="button"
            onClick={cancelQueue}
            className="inline-flex h-8 items-center rounded-full bg-surface px-3 text-xs font-bold text-ink1"
          >
            Cancel
          </button>
        </div>
      )}
      <div className="pointer-events-auto flex flex-col items-center gap-1.5">
        <button
          type="button"
          onClick={() => void tapTalk()}
          aria-label={voice === 'listening' ? 'Release or tap to send' : 'Hold to talk to Rocky'}
          className="grid h-[72px] w-[72px] place-items-center rounded-full text-white shadow-card"
          style={{
            background: voice === 'listening' ? 'var(--danger)' : 'var(--accent)',
            animation: voice === 'listening' ? undefined : 'rk-breathe 3s ease-in-out infinite',
          }}
        >
          {voice === 'listening' ? <SendHorizontal size={28} aria-hidden /> : <Mic size={28} aria-hidden />}
        </button>
        <span className="text-xs font-medium text-ink3">{hint}</span>
      </div>

      {overlay && (
        <div className="fixed inset-0 z-40 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Voice command">
          <button
            type="button"
            aria-label={voice === 'listening' ? 'Cancel recording' : 'Close'}
            onClick={resetToIdle}
            className="absolute inset-0 bg-black/55"
          />
          <div className="rk-pop relative flex max-h-[82vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-[20px] border border-line bg-surface p-5 pb-8">
            <span className="h-[5px] w-10 self-center rounded-full bg-line" aria-hidden />

            {(voice === 'primer' || voice === 'denied') && (
              <PrimerBody
                denied={voice === 'denied'}
                onContinue={async () => {
                  if (await requestMic()) {
                    setTranscript('');
                    setVoice('listening');
                  }
                }}
                onClose={resetToIdle}
              />
            )}

            {voice === 'listening' && (
              <div className="flex flex-col items-center gap-4 py-2">
                <Waveform />
                <span className="tnum font-mono text-sm text-ink2">
                  {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
                </span>
                <p className="text-sm text-ink3">Listening… tap the mic to send.</p>
              </div>
            )}

            {(voice === 'sent' || voice === 'working') && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2.5">
                  <Loader2 size={18} aria-hidden className="animate-spin text-accent-ink" />
                  <span className="text-[15px] font-semibold">
                    {voice === 'sent' ? 'Sending…' : STAGES[stage]}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {STAGES.map((label, i) => (
                    <div key={label} className="flex items-center gap-2 text-sm" style={{ color: i < stage ? 'var(--success)' : i === stage ? 'var(--ink1)' : 'var(--ink3)' }}>
                      {i < stage ? <Check size={15} aria-hidden /> : <span className="h-[15px] w-[15px] rounded-full border border-line" aria-hidden />}
                      {label}
                    </div>
                  ))}
                </div>
                {transcript && (
                  <p className="text-sm text-ink2">
                    Heard: <b className="text-ink1">“{transcript}”</b>
                  </p>
                )}
              </div>
            )}

            {voice === 'result' && result && (
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-success-soft text-success">
                    <CircleCheck size={20} aria-hidden />
                  </span>
                  <div>
                    <div className="text-[16px] font-bold leading-snug">{undone ? 'Undone.' : result.reply}</div>
                    <div className="mt-1 text-xs text-ink3">“{result.transcript}”</div>
                  </div>
                </div>
                {!undone && (
                  <div className="flex flex-col rounded-2xl bg-surface2 px-3.5 py-2">
                    {result.added.map((t) => (
                      <div key={t} className="flex items-center gap-2 py-1.5 text-sm">
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-success-soft text-xs font-bold text-success">+</span>
                        {t}
                      </div>
                    ))}
                    {result.moved.map((m) => (
                      <div key={m.title} className="flex items-center gap-2 py-1.5 text-sm">
                        <ArrowRight size={15} aria-hidden className="text-accent-ink" />
                        <span className="flex-1">{m.title}</span>
                        <span className="tnum text-xs text-ink3">
                          {m.from} → {m.to}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="tnum flex gap-2.5 font-mono text-[11px] text-ink3">
                  <span>STT {result.sttMs} ms</span>
                  <span>AI {result.llmMs} ms</span>
                  <span>Total {(result.totalMs / 1000).toFixed(2)} s</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {!undone && (
                    <button
                      type="button"
                      onClick={() => {
                        setUndone(true);
                        speakLocal('Undone.', speak, speed);
                      }}
                      className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl border border-line bg-surface2 text-[16px] font-bold text-ink1"
                    >
                      <Undo2 size={18} aria-hidden />
                      Undo
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={resetToIdle}
                    className={`inline-flex h-14 items-center justify-center rounded-2xl bg-accent text-[16px] font-bold text-white ${undone ? 'col-span-2' : ''}`}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

            {voice === 'clarify' && clarify && (
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-warning-soft text-warning">
                    <MessageCircleQuestion size={20} aria-hidden />
                  </span>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.06em] text-ink3">Rocky asks</div>
                    <div className="mt-1 text-xl font-bold leading-snug">{clarify.question}</div>
                  </div>
                </div>
                <div className="flex flex-col gap-2.5">
                  {clarify.options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => runWorking({ transcript: `${clarify.transcript} → ${opt}`, kind: 'result' })}
                      className="inline-flex h-14 items-center justify-center rounded-2xl border border-line bg-surface2 px-4 text-[16px] font-semibold text-ink1"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={resetToIdle}
                  className="text-sm font-semibold text-ink3"
                >
                  Cancel
                </button>
              </div>
            )}

            {voice === 'queued' && (
              <div className="flex items-center gap-2.5 py-2">
                <Clock size={18} aria-hidden className="text-warning" />
                <p className="text-[15px] font-semibold">
                  Saved. It’ll send when your laptop is back.
                </p>
              </div>
            )}

            {voice === 'error' && (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-danger-soft text-danger">
                  <MicOff size={24} aria-hidden />
                </span>
                <h2 className="text-xl font-bold">Didn’t catch that</h2>
                <p className="max-w-[280px] text-sm text-ink2">
                  The mic didn’t pick anything up. Try again somewhere quieter.
                </p>
                <div className="grid w-full grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setTranscript('');
                      setVoice('listening');
                    }}
                    className="inline-flex h-12 items-center justify-center rounded-2xl bg-accent text-[15px] font-bold text-white"
                  >
                    Try again
                  </button>
                  <button
                    type="button"
                    onClick={resetToIdle}
                    className="inline-flex h-12 items-center justify-center rounded-2xl border border-line text-[15px] font-semibold text-ink2"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {voice === 'unwired' && (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-accent-soft text-accent-ink">
                  <Mic size={24} aria-hidden />
                </span>
                <h2 className="text-xl font-bold">Voice relay isn’t running yet</h2>
                <p className="max-w-[300px] text-sm leading-relaxed text-ink2">
                  Recording and the <span className="font-mono text-[13px]">commands</span> relay land
                  with the laptop brain. Your recording was discarded — nothing was uploaded.
                </p>
                <button
                  type="button"
                  onClick={resetToIdle}
                  className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-accent text-[15px] font-bold text-white"
                >
                  Got it
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Waveform() {
  return (
    <div className="flex h-10 items-center gap-1" aria-hidden>
      {[0.9, 0.5, 1.1, 0.7, 1.3, 0.6, 1.0, 0.8, 1.2, 0.5, 0.9, 0.7, 1.1].map((d, i) => (
        <span
          key={i}
          className="w-1 rounded-full bg-accent"
          style={{ height: '100%', transformOrigin: 'center', animation: `rk-wave 1s ease-in-out ${i * 0.08}s infinite`, scale: `${d}` }}
        />
      ))}
    </div>
  );
}

function PrimerBody({
  denied,
  onContinue,
  onClose,
}: {
  denied: boolean;
  onContinue: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <span
        className="grid h-[72px] w-[72px] place-items-center rounded-[22px]"
        style={{
          background: denied ? 'var(--danger-soft)' : 'var(--accent-soft)',
          color: denied ? 'var(--danger)' : 'var(--accent-ink)',
        }}
      >
        <Mic size={30} aria-hidden />
      </span>
      <div>
        <h2 className="text-[22px] font-bold tracking-tight">
          {denied ? 'Mic is blocked' : 'Let Rocky listen'}
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink2">
          {denied ? (
            <>
              To talk, allow microphone access for this site in your browser settings, then try again.
              <ol className="mt-3 list-decimal rounded-2xl bg-surface2 p-4 pl-9 text-left text-sm">
                <li>Open your browser’s site settings</li>
                <li>Set Microphone to Allow</li>
                <li>Come back and tap Try again</li>
              </ol>
            </>
          ) : (
            'Your voice is recorded and sent to the laptop brain for transcription. Nothing else listens.'
          )}
        </p>
      </div>
      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          onClick={onContinue}
          className="inline-flex h-14 items-center justify-center rounded-2xl bg-accent text-[16px] font-bold text-white"
        >
          {denied ? 'Try again' : 'Continue'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-12 items-center justify-center rounded-2xl text-[15px] font-semibold text-ink2"
        >
          {denied ? 'Close' : 'Not now'}
        </button>
      </div>
      {!denied && (
        <p className="flex items-center justify-center gap-1.5 text-xs text-ink3">
          <CircleAlert size={12} aria-hidden />
          First tap only asks once — then it just listens.
        </p>
      )}
    </div>
  );
}
