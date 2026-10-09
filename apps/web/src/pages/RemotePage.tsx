import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import jsQR from 'jsqr';
import {
  ChevronLeft,
  CircleAlert,
  CircleCheck,
  Flashlight,
  FlashlightOff,
  Keyboard,
  Laptop,
  Link2,
  ScanLine,
  TimerOff,
  UserX,
  WifiOff,
} from 'lucide-react';
import {
  LAPTOP_OFFLINE_AFTER_SEC,
  buzz,
  defaultPhoneName,
  extractPairFromQrText,
  isValidPairCode,
  normalizePairCode,
  parsePairParam,
  type PhonePairState,
} from '../lib/pairing';
import {
  demoClaimPair,
  demoReadLaptopPair,
  demoReadPaired,
  demoUnpair,
  isDemoPairingEnabled,
} from '../lib/demoOnly.pairingFallback';
import {
  PairError,
  claimPair,
  getSessionUser,
  isSupabaseConfigured,
  readLaptopLastSeen,
} from '../lib/supabase';
import { buildLoginRedirect } from '../lib/auth';
import { DemoBadge } from '../components/DemoBadge';
import { Logo } from '../components/Logo';
import { ThemeToggle } from '../components/ThemeToggle';

type BarcodeDetectorLike = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
};
declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

const ERROR_META: Record<
  string,
  { icon: typeof TimerOff; toneBg: string; toneFg: string; title: string; body: string }
> = {
  expired: {
    icon: TimerOff,
    toneBg: 'var(--warning-soft)',
    toneFg: 'var(--warning)',
    title: 'That code expired',
    body: 'Codes last 5 minutes. On your laptop tap Generate new code, then scan again.',
  },
  wrong: {
    icon: UserX,
    toneBg: 'var(--danger-soft)',
    toneFg: 'var(--danger)',
    title: 'Different Google account',
    body: 'This phone must be signed in with the same Google account as your laptop.',
  },
  offline: {
    icon: WifiOff,
    toneBg: 'var(--danger-soft)',
    toneFg: 'var(--danger)',
    title: "Can't reach your laptop",
    body: 'Your laptop is offline or Rocky isn’t running. Open the lid, start Rocky, and try again.',
  },
  already: {
    icon: Link2,
    toneBg: 'var(--accent-soft)',
    toneFg: 'var(--accent-ink)',
    title: 'Already paired',
    body: 'This phone is paired with another laptop. Switch to the new one? The old pairing will be removed.',
  },
};

export function RemotePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const demo = isSupabaseConfigured() ? false : isDemoPairingEnabled();
  const [state, setState] = useState<PhonePairState>('intro');
  const [code, setCode] = useState('');
  const [genericMsg, setGenericMsg] = useState<string | null>(null);
  const [laptopName, setLaptopName] = useState('your laptop');
  const [phoneName] = useState(() => defaultPhoneName());
  const [torch, setTorch] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimer = useRef<number | null>(null);
  const confirmTimer = useRef<number | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const showBack =
    state !== 'intro' && state !== 'connected' && state !== 'confirming';
  const denied = state === 'camDenied';
  const primer = state === 'camPrimer' || denied;

  // ?pair=<CODE> deep link from the laptop QR (BrowserRouter, Vercel).
  // Prefill the code boxes; the user still taps once to pair.
  useEffect(() => {
    const fromUrl = parsePairParam(window.location.search || `?${params.toString()}`);
    if (fromUrl) {
      setCode(fromUrl);
      setState((s) => (s === 'intro' ? 'code' : s));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Already paired? Pairing stays across sessions (mobile spec).
  useEffect(() => {
    if (!demo) return;
    try {
      const paired = demoReadPaired();
      if (paired) {
        setLaptopName(paired.laptopName);
        setState('connected');
      }
    } catch {
      /* demo disabled */
    }
  }, [demo]);

  const stopCamera = useCallback(() => {
    if (scanTimer.current) {
      window.clearInterval(scanTimer.current);
      scanTimer.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setTorch(false);
  }, []);

  useEffect(() => () => {
    stopCamera();
    if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
  }, [stopCamera]);

  const goPair = useCallback(
    (next: PhonePairState) => {
      if (next !== 'scanner') stopCamera();
      setCamError(null);
      setGenericMsg(null);
      setState(next);
    },
    [stopCamera],
  );

  const submitCode = useCallback(
    async (raw: string) => {
      const normalized = normalizePairCode(raw);
      if (!isValidPairCode(normalized)) return;
      setCode(normalized);
      setGenericMsg(null);
      setState('confirming');
      buzz(15);
      const fail = (kind: PhonePairState) => setState(kind);
      const failGeneric = (message: string) => {
        setGenericMsg(message);
        setState('generic');
      };
      const done = (name: string) => {
        setLaptopName(name);
        setState('connected');
        buzz([20, 60, 20]);
      };
      const sendToLogin = () =>
        navigate(buildLoginRedirect(`/remote?pair=${normalized}`), { replace: true });
      const clearTimer = () => {
        if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
      };
      // 12 s with no answer: re-check presence instead of assuming offline.
      clearTimer();
      confirmTimer.current = window.setTimeout(() => {
        if (stateRef.current !== 'confirming') return;
        void (async () => {
          if (!isSupabaseConfigured() || demo) {
            setState('offline');
            return;
          }
          const presence = await readLaptopLastSeen();
          if (presence && Date.now() - presence.lastSeenMs > LAPTOP_OFFLINE_AFTER_SEC * 1000) {
            setState('offline');
          } else {
            failGeneric('The laptop didn’t answer in time. Keep Rocky open on the laptop and try again.');
          }
        })();
      }, 12_000);

      try {
        if (isSupabaseConfigured()) {
          // No session => auth.uid() is null inside claim_pair and EVERY
          // code looks dead. Redirect to sign in; the ?pair= survives.
          const user = await getSessionUser();
          if (!user) {
            clearTimer();
            sendToLogin();
            return;
          }
          // "Laptop offline" is decided ONLY from devices.last_seen.
          const presence = await readLaptopLastSeen();
          if (presence && Date.now() - presence.lastSeenMs > LAPTOP_OFFLINE_AFTER_SEC * 1000) {
            clearTimer();
            fail('offline');
            return;
          }
          const r = await claimPair(normalized, phoneName);
          clearTimer();
          done(r.laptopName);
        } else if (demo) {
          // DEMO-ONLY path.
          await new Promise((r) => setTimeout(r, 1400));
          const res = demoClaimPair(normalized);
          clearTimer();
          if (res.ok) done(res.laptopName);
          else if (res.kind === 'expired') fail('expired');
          else if (res.kind === 'offline') fail('offline');
          else failGeneric('Demo relay failed. Restart the laptop /pair page and try again.');
        } else {
          clearTimer();
          failGeneric('Supabase is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
        }
      } catch (e) {
        clearTimer();
        // Mapped by Postgres errcode — never string-sniffed, and an
        // unrecognized error is NEVER shown as "laptop offline".
        if (e instanceof PairError) {
          if (e.kind === 'expired') fail('expired');
          else if (e.kind === 'wrong') fail('wrong');
          else if (e.kind === 'not-signed-in') sendToLogin();
          else failGeneric(e.message);
        } else {
          failGeneric(e instanceof Error ? e.message : 'Something went wrong claiming the code.');
        }
      }
    },
    [demo, navigate, phoneName],
  );

  const handleDetectedText = useCallback(
    (text: string) => {
      const found = extractPairFromQrText(text);
      if (found && stateRef.current === 'scanner') {
        stopCamera();
        void submitCode(found);
      }
    },
    [stopCamera, submitCode],
  );

  const startScanLoop = useCallback(
    (video: HTMLVideoElement) => {
      const Native = window.BarcodeDetector;
      if (Native) {
        try {
          const det = new Native({ formats: ['qr_code'] });
          scanTimer.current = window.setInterval(async () => {
            try {
              const found = await det.detect(video);
              const raw = found?.[0]?.rawValue;
              if (raw) handleDetectedText(raw);
            } catch {
              /* keep scanning */
            }
          }, 350);
          return;
        } catch {
          /* fall through to jsQR */
        }
      }
      // Fallback: small JS QR decoder (jsQR) over video frames.
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      let last = 0;
      scanTimer.current = window.setInterval(() => {
        const now = Date.now();
        if (now - last < 400) return;
        last = now;
        try {
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (!w || !h) return;
          const scale = Math.min(1, 480 / Math.max(w, h));
          canvas.width = Math.floor(w * scale);
          canvas.height = Math.floor(h * scale);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const out = jsQR(img.data, img.width, img.height);
          if (out?.data) handleDetectedText(out.data);
        } catch {
          /* keep scanning */
        }
      }, 120);
    },
    [handleDetectedText],
  );

  const openScanner = useCallback(async () => {
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      setState('scanner');
      // Attach on next frame once the video element is mounted.
      requestAnimationFrame(() => {
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        void v.play().catch(() => {});
        const track = stream.getVideoTracks()[0];
        try {
          const caps = track?.getCapabilities?.() as { torch?: boolean } | undefined;
          setTorchSupported(Boolean(caps?.torch));
        } catch {
          setTorchSupported(false);
        }
        startScanLoop(v);
      });
    } catch (e) {
      const name = e instanceof Error ? e.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setState('camDenied');
      } else {
        setCamError(
          'Could not open the camera. Check the browser permission, or type the code instead.',
        );
        setState('camPrimer');
      }
    }
  }, [startScanLoop]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      // `torch` is a real capability on Android Chrome but missing from
      // TS's DOM lib — cast through unknown.
      await track.applyConstraints({
        advanced: [{ torch: !torch } as unknown as MediaTrackConstraintSet],
      } as MediaTrackConstraints);
      setTorch(!torch);
    } catch {
      /* unsupported */
    }
  }, [torch]);

  const codeBoxes = useMemo(() => {
    const n = normalizePairCode(code).padEnd(6, ' ').slice(0, 6);
    return [...n].map((ch, i) => ({ ch: ch === ' ' ? '' : ch, filled: ch !== ' ', key: i }));
  }, [code]);

  const unpair = useCallback(() => {
    if (demo) {
      try {
        demoUnpair();
      } catch {
        /* ignore */
      }
    }
    setCode('');
    goPair('intro');
  }, [demo, goPair]);

  const err = ERROR_META[state] as (typeof ERROR_META)['expired'] | undefined;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col bg-bg px-5 pb-10 text-ink1">
      {/* Phone top bar */}
      <div className="flex h-14 items-center">
        {showBack ? (
          <button
            type="button"
            onClick={() => goPair(state === 'code' && parsePairParam(window.location.search) ? 'intro' : 'intro')}
            aria-label="Back"
            className="-ml-2.5 grid h-11 w-11 place-items-center rounded-xl text-ink1"
          >
            <ChevronLeft size={24} aria-hidden />
          </button>
        ) : (
          <span className="flex items-center gap-2">
            <Logo size={26} />
            <span className="font-bold tracking-tight">Rocky</span>
          </span>
        )}
        <span className="ml-auto" />
        <ThemeToggle />
      </div>

      <div className="pt-2">
        <DemoBadge />
      </div>

      {/* INTRO */}
      {state === 'intro' && (
        <div className="flex flex-1 flex-col gap-5 pt-10">
          <span className="grid h-[76px] w-[76px] place-items-center rounded-[22px] bg-accent text-white">
            <Laptop size={34} aria-hidden />
          </span>
          <div>
            <h1 className="text-[28px] font-bold leading-tight tracking-tight">
              Pair with your laptop
            </h1>
            <p className="mt-2.5 text-[16px] leading-relaxed text-ink2">
              Your phone becomes a mic and a live window into the calendar on
              your laptop. Open Rocky on your laptop and go to{' '}
              <b className="text-ink1">Connect your phone</b>.
            </p>
          </div>
          <span className="flex-1" />
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => goPair('camPrimer')}
              className="inline-flex h-14 items-center justify-center gap-2.5 rounded-2xl bg-accent text-[16px] font-bold text-white"
            >
              <ScanLine size={20} aria-hidden />
              Scan QR code
            </button>
            <button
              type="button"
              onClick={() => goPair('code')}
              className="inline-flex h-[52px] items-center justify-center gap-2.5 rounded-2xl border border-line bg-surface text-[16px] font-semibold text-ink1"
            >
              <Keyboard size={18} aria-hidden />
              Enter code instead
            </button>
          </div>
        </div>
      )}

      {/* CAMERA PRIMER / DENIED */}
      {primer && (
        <div className="flex flex-1 flex-col gap-5 pt-10">
          <span
            className="grid h-[72px] w-[72px] place-items-center rounded-[22px]"
            style={{
              background: denied ? 'var(--danger-soft)' : 'var(--accent-soft)',
              color: denied ? 'var(--danger)' : 'var(--accent-ink)',
            }}
          >
            <ScanLine size={30} aria-hidden />
          </span>
          <div>
            <h1 className="text-[28px] font-bold tracking-tight">
              {denied ? 'Camera is blocked' : 'Allow the camera'}
            </h1>
            <p className="mt-2.5 text-[16px] leading-relaxed text-ink2">
              {denied
                ? 'To scan the code, allow camera access for this site. Or type the 6-character code instead.'
                : "Only to scan the pairing code on your laptop. Rocky doesn't take photos or keep video."}
            </p>
            {camError && <p className="mt-2 text-sm text-danger">{camError}</p>}
          </div>
          <span className="flex-1" />
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={openScanner}
              className="inline-flex h-14 items-center justify-center rounded-2xl bg-accent text-[16px] font-bold text-white"
            >
              {denied ? "I've allowed it" : 'Continue'}
            </button>
            <button
              type="button"
              onClick={() => goPair('code')}
              className="inline-flex h-[52px] items-center justify-center rounded-2xl text-[16px] font-semibold text-ink2"
            >
              Enter code instead
            </button>
          </div>
        </div>
      )}

      {/* SCANNER */}
      {state === 'scanner' && (
        <div className="relative -mx-5 flex flex-1 flex-col overflow-hidden bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            className="absolute inset-0 h-full w-full object-cover"
            aria-label="Camera viewfinder"
          />
          <div className="pointer-events-none absolute inset-0 bg-black/55" />
          <div className="relative flex flex-1 flex-col items-center px-5 pb-6 pt-8">
            <p className="font-mono text-xs text-white/70">point at the QR on your laptop</p>
            <div className="relative mt-6 h-[270px] w-[270px]">
              <span className="absolute left-0 top-0 h-12 w-12 rounded-tl-[32px] border-l-4 border-t-4 border-white" />
              <span className="absolute right-0 top-0 h-12 w-12 rounded-tr-[32px] border-r-4 border-t-4 border-white" />
              <span className="absolute bottom-0 left-0 h-12 w-12 rounded-bl-[32px] border-b-4 border-l-4 border-white" />
              <span className="absolute bottom-0 right-0 h-12 w-12 rounded-br-[32px] border-b-4 border-r-4 border-white" />
            </div>
            <span className="flex-1" />
            <div className="pointer-events-auto flex w-full flex-col gap-2.5">
              {torchSupported && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-white/15 text-[15px] font-semibold text-white"
                >
                  {torch ? <FlashlightOff size={18} aria-hidden /> : <Flashlight size={18} aria-hidden />}
                  {torch ? 'Turn torch off' : 'Turn torch on'}
                </button>
              )}
              <button
                type="button"
                onClick={() => goPair('code')}
                className="inline-flex h-[52px] items-center justify-center rounded-2xl text-[16px] font-semibold text-white"
              >
                Enter code instead
              </button>
              <button
                type="button"
                onClick={() => goPair('intro')}
                className="inline-flex h-12 items-center justify-center rounded-full bg-white/15 text-[15px] font-semibold text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CODE ENTRY */}
      {state === 'code' && (
        <div className="flex flex-1 flex-col gap-6 pt-5">
          <div>
            <h1 className="text-[28px] font-bold tracking-tight">Enter the code</h1>
            <p className="mt-2.5 text-[16px] leading-relaxed text-ink2">
              It&apos;s under the QR code on your laptop.
            </p>
          </div>
          <label className="relative grid grid-cols-[repeat(3,1fr)_14px_repeat(3,1fr)] items-center gap-2">
            <input
              value={code}
              onChange={(e) => setCode(normalizePairCode(e.target.value).slice(0, 6))}
              maxLength={7}
              autoComplete="one-time-code"
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              aria-label="6 character pairing code"
              className="absolute inset-0 opacity-0"
              style={{ fontSize: 16 }}
            />
            {codeBoxes.slice(0, 3).map((b) => (
              <CodeBox key={b.key} ch={b.ch} filled={b.filled} />
            ))}
            <span className="h-0.5 rounded bg-ink4" aria-hidden />
            {codeBoxes.slice(3).map((b) => (
              <CodeBox key={b.key} ch={b.ch} filled={b.filled} />
            ))}
          </label>
          <button
            type="button"
            disabled={!isValidPairCode(code)}
            onClick={() => void submitCode(code)}
            className="inline-flex h-14 items-center justify-center rounded-2xl bg-accent text-[16px] font-bold text-white disabled:opacity-40"
          >
            Pair this phone
          </button>
          <p className="text-center text-sm text-ink3">
            Pairing as {phoneName} · codes last 5 minutes
          </p>
        </div>
      )}

      {/* CONNECTING */}
      {state === 'confirming' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
          <span
            className="grid h-16 w-16 place-items-center rounded-full bg-accent-soft text-accent-ink"
            style={{ animation: 'rk-spin 1.1s linear infinite' }}
            aria-hidden
          >
            <ScanLine size={28} />
          </span>
          <h1 className="text-[22px] font-bold tracking-tight">Connecting to your laptop…</h1>
          <p className="max-w-[300px] text-[15px] leading-relaxed text-ink2">
            Keep Rocky open on your laptop for a moment.
          </p>
          <button
            type="button"
            onClick={() => goPair('code')}
            className="mt-2 text-sm font-semibold text-ink3"
          >
            Cancel
          </button>
        </div>
      )}

      {/* CONNECTED */}
      {state === 'connected' && (
        <div className="flex flex-1 flex-col items-center gap-4 py-14 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-success-soft text-success">
            <CircleCheck size={30} aria-hidden />
          </span>
          <h1 className="text-[24px] font-bold tracking-tight">You&apos;re connected</h1>
          <p className="max-w-[320px] text-[15px] leading-relaxed text-ink2">
            Paired with {laptopName}. Your phone now mirrors the calendar and
            works as a mic.
          </p>
          <div className="mt-2 w-full rounded-2xl border border-line bg-surface p-4 text-left">
            <p className="text-sm font-semibold">Calendar + talk button land next (B3).</p>
            <p className="mt-1 text-sm leading-relaxed text-ink2">
              This build covers pairing only. The phone calendar (read-only
              day/week), offline banner and voice button reuse these tokens.
            </p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => goPair('intro')}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-line text-sm font-bold text-ink1"
            >
              Switch laptop
            </button>
            <button
              type="button"
              onClick={unpair}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-line text-sm font-bold text-danger"
            >
              Unpair
            </button>
          </div>
        </div>
      )}

      {/* Generic relay error — shows the REAL message, never "offline". */}
      {state === 'generic' && (
        <div className="flex flex-1 flex-col items-center gap-4 py-14 text-center">
          <span
            className="grid h-16 w-16 place-items-center rounded-full"
            style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
          >
            <CircleAlert size={30} aria-hidden />
          </span>
          <h1 className="text-[24px] font-bold tracking-tight">Something went wrong</h1>
          <p className="max-w-[320px] text-[15px] leading-relaxed text-ink2">
            The relay answered with an error. Your laptop is not necessarily offline.
          </p>
          {genericMsg && (
            <p className="max-w-[320px] break-words rounded-xl border border-line bg-surface p-3 font-mono text-[11px] leading-relaxed text-ink3">
              {genericMsg}
            </p>
          )}
          <div className="mt-2 flex w-full flex-col gap-2.5">
            <button
              type="button"
              onClick={() => goPair('code')}
              className="inline-flex h-[52px] items-center justify-center rounded-2xl bg-accent text-[16px] font-bold text-white"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => goPair('intro')}
              className="inline-flex h-[52px] items-center justify-center rounded-2xl text-[16px] font-semibold text-ink2"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* ERROR STATES */}
      {err && (
        <div className="flex flex-1 flex-col items-center gap-4 py-14 text-center">
          <span
            className="grid h-16 w-16 place-items-center rounded-full"
            style={{ background: err.toneBg, color: err.toneFg }}
          >
            <err.icon size={30} aria-hidden />
          </span>
          <h1 className="text-[24px] font-bold tracking-tight">{err.title}</h1>
          <p className="max-w-[320px] text-[15px] leading-relaxed text-ink2">{err.body}</p>
          <div className="mt-2 flex w-full flex-col gap-2.5">
            {state === 'expired' && (
              <>
                <button
                  type="button"
                  onClick={() => goPair('scanner')}
                  className="inline-flex h-[52px] items-center justify-center rounded-2xl bg-accent text-[16px] font-bold text-white"
                >
                  Scan again
                </button>
                <button
                  type="button"
                  onClick={() => goPair('code')}
                  className="inline-flex h-[52px] items-center justify-center rounded-2xl border border-line text-[16px] font-semibold text-ink1"
                >
                  Enter code instead
                </button>
              </>
            )}
            {state === 'wrong' && (
              <>
                <button
                  type="button"
                  onClick={() => goPair('intro')}
                  className="inline-flex h-[52px] items-center justify-center rounded-2xl bg-accent text-[16px] font-bold text-white"
                >
                  Try again
                </button>
                <p className="text-sm text-ink3">Switch the phone to the laptop&apos;s Google account first.</p>
              </>
            )}
            {state === 'offline' && (
              <>
                <button
                  type="button"
                  onClick={() => goPair('code')}
                  className="inline-flex h-[52px] items-center justify-center rounded-2xl bg-accent text-[16px] font-bold text-white"
                >
                  Try again
                </button>
                <button
                  type="button"
                  onClick={() => goPair('intro')}
                  className="inline-flex h-[52px] items-center justify-center rounded-2xl text-[16px] font-semibold text-ink2"
                >
                  Back
                </button>
              </>
            )}
            {state === 'already' && (
              <>
                <button
                  type="button"
                  onClick={() => void submitCode(code || '')}
                  disabled={!isValidPairCode(code)}
                  className="inline-flex h-[52px] items-center justify-center rounded-2xl bg-accent text-[16px] font-bold text-white disabled:opacity-40"
                >
                  Switch laptop
                </button>
                <button
                  type="button"
                  onClick={() => setState('connected')}
                  className="inline-flex h-[52px] items-center justify-center rounded-2xl text-[16px] font-semibold text-ink2"
                >
                  Keep current laptop
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* DEMO-ONLY state previewer — never rendered in production. */}
      {demo && (
        <details className="mt-6 rounded-xl border border-dashed border-warning p-3 text-xs text-ink3">
          <summary className="cursor-pointer font-bold text-warning">
            DEMO-ONLY state previewer (removed before release)
          </summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(
              [
                'intro',
                'camPrimer',
                'camDenied',
                'code',
                'confirming',
                'connected',
                'expired',
                'wrong',
                'offline',
                'already',
                'generic',
              ] as PhonePairState[]
            ).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => goPair(s)}
                className="rounded-lg border border-line px-2 py-1 font-mono"
              >
                {s}
              </button>
            ))}
          </div>
          <p className="mt-2">
            Laptop heartbeat:{' '}
            {(() => {
              try {
                const p = demoReadLaptopPair();
                return p ? `${p.laptopName} · seen ${Math.round((Date.now() - p.lastSeenMs) / 1000)}s ago` : 'none';
              } catch {
                return 'n/a';
              }
            })()}
          </p>
        </details>
      )}
    </div>
  );
}

function CodeBox({ ch, filled }: { ch: string; filled: boolean }) {
  return (
    <span
      aria-hidden
      className="tnum grid h-14 place-items-center rounded-xl border font-mono text-2xl font-semibold"
      style={{
        borderColor: filled ? 'var(--accent)' : 'var(--line)',
        background: 'var(--surface)',
        color: 'var(--ink1)',
      }}
    >
      {ch}
    </span>
  );
}
