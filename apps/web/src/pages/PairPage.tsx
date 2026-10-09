import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { QRCodeSVG } from 'qrcode.react';
import {
  Check,
  CircleAlert,
  CircleCheck,
  Copy,
  RefreshCw,
  ScanLine,
  Smartphone,
  TimerOff,
  UserX,
  WifiOff,
} from 'lucide-react';
import {
  LAPTOP_OFFLINE_AFTER_SEC,
  PAIR_EXPIRY_SEC,
  buildPairUrl,
  defaultLaptopName,
  formatCountdown,
  formatPairCode,
  freshPairExpiry,
  generateSecurePairCode,
  type LaptopPairStatus,
} from '../lib/pairing';
import {
  demoHeartbeat,
  demoPublishLaptopPair,
  demoReadPaired,
  isDemoPairingEnabled,
} from '../lib/demoOnly.pairingFallback';
import {
  isSupabaseConfigured,
  publishLaptopPairing,
  touchLaptopHeartbeat,
  type PairError,
} from '../lib/supabase';
import { DemoBadge } from '../components/DemoBadge';
import { StatusBadge } from '../components/StatusBadge';

const STEPS = [
  'Open Rocky on your phone and sign in with the same Google account',
  'Tap Scan, point the camera here',
  "You're connected",
];

const STATUS_META: Record<
  LaptopPairStatus,
  {
    tone: 'accent' | 'success' | 'warning' | 'danger';
    badge: string;
    icon: typeof ScanLine;
    title: string;
    sub: string;
    at: number;
  }
> = {
  waiting: {
    tone: 'accent',
    badge: 'Waiting',
    icon: ScanLine,
    title: 'Waiting for your phone',
    sub: 'Scan this code with the Rocky app. It expires in 5 minutes.',
    at: 2,
  },
  confirming: {
    tone: 'accent',
    badge: 'Scanned',
    icon: Smartphone,
    title: 'Phone found',
    sub: 'Tap Confirm on your phone to finish pairing.',
    at: 2,
  },
  connected: {
    tone: 'success',
    badge: 'Connected',
    icon: CircleCheck,
    title: "You're connected",
    sub: 'Your phone is paired. Test it: say something on your phone.',
    at: 4,
  },
  expired: {
    tone: 'warning',
    badge: 'Expired',
    icon: TimerOff,
    title: 'This code expired',
    sub: 'Codes last 5 minutes so nobody else can use them. Make a new one to keep going.',
    at: 2,
  },
  wrong: {
    tone: 'danger',
    badge: 'Wrong account',
    icon: UserX,
    title: 'That phone is on a different account',
    sub: 'Sign in on the phone with the same Google account as this laptop, then scan again.',
    at: 1,
  },
  offline: {
    tone: 'danger',
    badge: 'Offline',
    icon: WifiOff,
    title: "Can't reach the relay",
    sub: 'This laptop seems offline. The brain is fine; pairing just needs the internet for a moment.',
    at: 2,
  },
};

export function PairPage() {
  const demo = isSupabaseConfigured() ? false : isDemoPairingEnabled();
  const [code, setCode] = useState(() => generateSecurePairCode());
  const [expiresAtMs, setExpiresAtMs] = useState(() => freshPairExpiry());
  const [laptopName, setLaptopName] = useState(() => defaultLaptopName());
  const [status, setStatus] = useState<LaptopPairStatus>('waiting');
  const [secsLeft, setSecsLeft] = useState(PAIR_EXPIRY_SEC);
  const [copied, setCopied] = useState(false);
  const [heard, setHeard] = useState(false);
  const [publishError, setPublishError] = useState<PairError | null>(null);
  const [netOffline, setNetOffline] = useState(
    () => typeof navigator !== 'undefined' && navigator.onLine === false,
  );
  const createdAt = useRef(Date.now());
  const timers = useRef<number[]>([]);
  const laptopNameRef = useRef(laptopName);
  laptopNameRef.current = laptopName;

  const siteOrigin = useMemo(() => {
    const env = (import.meta.env.VITE_SITE_URL as string | undefined)?.trim();
    if (env) return env.replace(/\/$/, '');
    return window.location.origin;
  }, []);
  const pairUrl = useMemo(() => buildPairUrl(siteOrigin, code), [siteOrigin, code]);
  const meta = STATUS_META[netOffline && status === 'waiting' ? 'offline' : status];

  // Publish one code to the relay. Surfaces the REAL failure — the QR is
  // only shown when the code was actually saved (see publishError below).
  const doPublish = useCallback(
    async (c: string, e: number) => {
      if (demo) {
        demoPublishLaptopPair({
          code: c,
          expiresAtMs: e,
          laptopName: laptopNameRef.current,
          lastSeenMs: Date.now(),
        });
        setPublishError(null);
        return;
      }
      const res = await publishLaptopPairing(c, e, laptopNameRef.current);
      setPublishError(res.ok ? null : res.failure);
    },
    [demo],
  );

  const resetPair = useCallback(
    (next?: { code: string; expiresAtMs: number }) => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
      const c = next?.code ?? generateSecurePairCode();
      const e = next?.expiresAtMs ?? freshPairExpiry();
      createdAt.current = Date.now();
      setCode(c);
      setExpiresAtMs(e);
      setSecsLeft(PAIR_EXPIRY_SEC);
      setStatus('waiting');
      setHeard(false);
      setCopied(false);
      setPublishError(null);
      void doPublish(c, e);
    },
    [doPublish],
  );

  // Retry publishing the CURRENT code when it hasn't expired yet;
  // otherwise start over with a fresh one.
  const retryPublish = useCallback(() => {
    if (expiresAtMs > Date.now()) {
      setPublishError(null);
      setStatus('waiting');
      void doPublish(code, expiresAtMs);
    } else {
      resetPair();
    }
  }, [code, expiresAtMs, doPublish, resetPair]);

  // Publish on mount.
  useEffect(() => {
    void doPublish(code, expiresAtMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Heartbeat every 15 s keeps devices.last_seen fresh while /pair is open.
  // TEMPORARY owner: apps/brain takes this over with its own 15 s heartbeat
  // (PLAN.md section 6) once the brain runs — then delete this interval and
  // keep only the brain's. The phone decides "laptop offline" solely from
  // last_seen older than 45 s, so this interval is what keeps the laptop
  // looking alive until the brain exists.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (demo) demoHeartbeat();
      else void touchLaptopHeartbeat();
    }, 15_000);
    return () => window.clearInterval(id);
  }, [demo]);

  // Countdown → expiry.
  useEffect(() => {
    const id = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000));
      setSecsLeft(left);
      if (left <= 0) {
        setStatus((s) => (s === 'waiting' ? 'expired' : s));
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [expiresAtMs]);

  // Browser online/offline signal (laptop's own network).
  useEffect(() => {
    const on = () => setNetOffline(!navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
    };
  }, []);

  // DEMO-ONLY claim detection: the phone writes its claim to localStorage;
  // the laptop notices and walks confirming → connected → heard test echo.
  // With Supabase this becomes a Realtime subscription on `devices`.
  useEffect(() => {
    if (!demo) return;
    const id = window.setInterval(() => {
      try {
        const claimed = demoReadPaired();
        if (claimed && claimed.atMs >= createdAt.current) {
          setStatus((s) => {
            if (s === 'waiting') {
              const t1 = window.setTimeout(() => {
                setStatus('connected');
                const t2 = window.setTimeout(() => setHeard(true), 2600);
                timers.current.push(t2);
              }, 2200);
              timers.current.push(t1);
              return 'confirming';
            }
            return s;
          });
        }
      } catch {
        /* demo disabled mid-flight */
      }
    }, 1500);
    return () => window.clearInterval(id);
  }, [demo]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const copyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(formatPairCode(code));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }, [code]);

  const ringFrac = secsLeft / PAIR_EXPIRY_SEC;
  const ringColor =
    status === 'expired'
      ? 'var(--warning)'
      : ringFrac < 0.2
        ? 'var(--danger)'
        : 'var(--accent)';

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-12">
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
        {/* Left: steps + status */}
        <div className="flex flex-col gap-7">
          <div>
            <h1 className="text-3xl font-bold tracking-tight md:text-[40px] md:leading-[1.1]">
              Connect your phone
            </h1>
            <p className="mt-3 max-w-[480px] text-[16px] leading-relaxed text-ink2">
              Your phone shows your calendar and works as a remote mic.
              Rocky&apos;s brain stays on this laptop.
            </p>
          </div>

          <ol className="flex list-none flex-col gap-1 p-0">
            {STEPS.map((text, i) => {
              const n = i + 1;
              const done = n < meta.at || (n === 3 && status === 'connected');
              const active = n === meta.at && !done;
              return (
                <li
                  key={text}
                  className="flex items-start gap-4 rounded-2xl p-3"
                  style={{ background: active ? 'var(--surface)' : 'transparent' }}
                >
                  <span
                    className="grid h-8 w-8 flex-none place-items-center rounded-full text-sm font-bold"
                    style={{
                      background: done
                        ? 'var(--success-soft)'
                        : active
                          ? 'var(--accent-soft)'
                          : 'var(--surface2)',
                      color: done
                        ? 'var(--success)'
                        : active
                          ? 'var(--accent-ink)'
                          : 'var(--ink3)',
                      border: `1.5px solid ${done ? 'var(--success)' : active ? 'var(--accent)' : 'var(--line)'}`,
                    }}
                  >
                    {done ? <Check size={16} aria-label="done" /> : n}
                  </span>
                  <span
                    className="pt-1 text-[16px] leading-snug"
                    style={{
                      color: done || active ? 'var(--ink1)' : 'var(--ink3)',
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {text}
                  </span>
                </li>
              );
            })}
          </ol>

          <div
            className="flex items-start gap-3.5 rounded-2xl p-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}
          >
            <meta.icon size={20} aria-hidden className="mt-0.5 shrink-0" style={{ color: 'var(--ink1)' }} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2 text-[16px] font-semibold">
                {meta.title}
                <StatusBadge tone={meta.tone}>{meta.badge}</StatusBadge>
              </span>
              <span className="text-sm leading-relaxed text-ink2">{meta.sub}</span>
              {status === 'connected' && (
                <span className="mt-1.5 flex items-center gap-2 text-sm text-ink1">
                  <Smartphone size={14} aria-hidden />
                  {heard
                    ? 'Heard from your phone: “what’s next today?” · 0.9 s'
                    : 'Listening for your phone…'}
                </span>
              )}
            </div>
          </div>

          <p className="text-sm text-ink3">
            You can pair a phone later in Settings → Devices.{' '}
            <span className="tnum">Wizard step 4: keep Rocky open on this laptop.</span>
          </p>
          <DemoBadge />
        </div>

        {/* Right: QR card */}
        <div
          className="flex flex-col gap-5 rounded-[20px] border border-line bg-surface p-6 shadow-card"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[16px] font-semibold">Scan with the Rocky app</div>
              <label className="mt-1 block text-xs text-ink3">
                This laptop is named
                <input
                  value={laptopName}
                  onChange={(e) => setLaptopName(e.target.value.slice(0, 40))}
                  aria-label="Laptop name"
                  className="ml-1.5 rounded-md border border-line bg-surface2 px-1.5 py-0.5 text-xs font-semibold text-ink1"
                  size={Math.max(8, laptopName.length)}
                />
              </label>
            </div>
            <div className="relative h-[52px] w-[52px] shrink-0" title="Time left">
              <svg width="52" height="52" viewBox="0 0 52 52" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="26" cy="26" r="22" fill="none" stroke="var(--line)" strokeWidth="4" />
                <circle
                  cx="26"
                  cy="26"
                  r="22"
                  fill="none"
                  stroke={ringColor}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray="138.2"
                  strokeDashoffset={138.2 * (1 - ringFrac)}
                  style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
              </svg>
              <span className="tnum absolute inset-0 grid place-items-center text-xs font-bold">
                {formatCountdown(secsLeft)}
              </span>
            </div>
          </div>

          <div className="relative self-center">
            {publishError ? (
              <div
                role="alert"
                className="flex w-[300px] flex-col items-center gap-3 rounded-2xl border border-danger bg-danger-soft p-6 text-center"
              >
                <span className="grid h-14 w-14 place-items-center rounded-full bg-surface text-danger">
                  <CircleAlert size={26} aria-hidden />
                </span>
                <span className="text-xl font-bold text-ink1">Couldn’t save the code</span>
                <span className="text-sm leading-relaxed text-ink1">
                  {publishError.kind === 'not-signed-in'
                    ? 'Your sign-in expired. Sign in again, then retry.'
                    : 'The relay rejected the new code.'}
                </span>
                <span className="break-words font-mono text-[11px] leading-relaxed text-ink2">
                  {publishError.kind}: {publishError.message}
                </span>
                <span className="flex flex-wrap justify-center gap-2">
                  {publishError.kind === 'not-signed-in' && (
                    <Link
                      to="/login?next=%2Fpair"
                      className="inline-flex h-10 items-center rounded-[10px] bg-accent px-4 text-sm font-bold text-white"
                    >
                      Sign in again
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={retryPublish}
                    className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-line bg-surface px-4 text-sm font-bold text-ink1"
                  >
                    <RefreshCw size={15} aria-hidden />
                    Retry
                  </button>
                </span>
              </div>
            ) : (
            <div className="rounded-2xl bg-white p-[18px]">
              <QRCodeSVG
                value={pairUrl}
                size={264}
                bgColor="#ffffff"
                fgColor="#000000"
                level="M"
                role="img"
                aria-label={`Pairing QR code for ${pairUrl}`}
              />
            </div>
            )}
            {!publishError && (status === 'confirming' || status === 'connected' || status === 'expired' || status === 'wrong' || status === 'offline') && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-surface p-6 text-center opacity-[0.97]">
                {status === 'confirming' && (
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-accent-soft text-accent-ink">
                    <Smartphone size={26} aria-hidden />
                  </span>
                )}
                {status === 'connected' && (
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-success-soft text-success">
                    <CircleCheck size={26} aria-hidden />
                  </span>
                )}
                {(status === 'expired' || status === 'wrong' || status === 'offline') && (
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-warning-soft text-warning">
                    <meta.icon size={26} aria-hidden />
                  </span>
                )}
                <span className="text-xl font-bold">
                  {status === 'confirming'
                    ? 'Your phone'
                    : status === 'connected'
                      ? 'Connected'
                      : meta.title}
                </span>
                <span className="flex items-center gap-2 text-sm text-ink2">
                  {status === 'confirming' ? 'Waiting for you to confirm…' : meta.sub}
                </span>
                {(status === 'expired' || status === 'offline') && (
                  <button
                    type="button"
                    onClick={() => resetPair()}
                    className="mt-1 inline-flex h-10 items-center gap-2 rounded-[10px] bg-accent px-4 text-sm font-bold text-white"
                  >
                    <RefreshCw size={15} aria-hidden />
                    Generate new code
                  </button>
                )}
              </div>
            )}
          </div>

          {!publishError && (
          <div className="flex flex-col items-center gap-2">
            <span className="text-xs text-ink3">Camera not working? Enter this code on your phone</span>
            <div className="flex items-center gap-2.5">
              <span
                className="tnum font-mono text-[28px] font-medium tracking-[0.08em]"
                style={{ opacity: status === 'waiting' ? 1 : 0.35 }}
              >
                {formatPairCode(code)}
              </span>
              <button
                type="button"
                onClick={copyCode}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface2 px-2.5 text-xs font-semibold text-ink1"
              >
                {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <button
              type="button"
              onClick={() => resetPair()}
              className="mt-1 inline-flex h-9 items-center gap-1.5 rounded-[10px] px-3 text-sm font-semibold text-ink2 hover:text-ink1"
            >
              <RefreshCw size={14} aria-hidden />
              Generate new code
            </button>
          </div>
          )}

          {!publishError && (
          <p className="tnum break-all text-center font-mono text-[11px] leading-relaxed text-ink4">
            {pairUrl}
          </p>
          )}
          <p className="text-center text-[11px] text-ink4">
            Laptop offline threshold: {LAPTOP_OFFLINE_AFTER_SEC}s heartbeat window.
          </p>
        </div>
      </div>
    </div>
  );
}
