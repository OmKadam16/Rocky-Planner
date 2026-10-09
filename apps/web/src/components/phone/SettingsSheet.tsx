import { Laptop, LogOut } from 'lucide-react';
import { useSession } from '../../lib/auth';
import { unpairPhone } from '../../lib/supabase';
import { demoUnpair, isDemoPairingEnabled } from '../../lib/demoOnly.pairingFallback';
import {
  useShowLatency,
  useSpeakReplies,
  useThemePref,
  type ThemePref,
} from '../../lib/prefs';
import type { LaptopPresenceState } from '../../lib/remote';

const THEME_OPTS: Array<{ label: string; value: ThemePref }> = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'System', value: 'system' },
];

/**
 * Phone settings sheet (overflow menu). Laptop identity, voice + theme
 * prefs, latency debug, sign out. The model line is read-only: the brain
 * runs qwen3.5:2b only (no 4B/2B selector anywhere in the UI).
 */
export function SettingsSheet({
  presence,
  onClose,
  onUnpaired,
}: {
  presence: LaptopPresenceState;
  onClose: () => void;
  onUnpaired: () => void;
}) {
  const { signOut } = useSession();
  const [speak, setSpeak] = useSpeakReplies();
  const [showLatency, setShowLatency] = useShowLatency();
  const [themePref, setThemePref] = useThemePref();

  const statusWord =
    presence.status === 'online' ? 'Online' : presence.status === 'offline' ? 'Offline' : 'Connecting…';
  const statusColor =
    presence.status === 'online'
      ? 'var(--success)'
      : presence.status === 'offline'
        ? 'var(--danger)'
        : 'var(--warning)';

  async function unpair() {
    if (isDemoPairingEnabled()) {
      try {
        demoUnpair();
      } catch {
        /* ignore */
      }
    } else {
      await unpairPhone();
    }
    onUnpaired();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Settings">
      <button type="button" aria-label="Close settings" onClick={onClose} className="absolute inset-0 bg-black/55" />
      <div className="rk-pop relative flex max-h-[82vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-[20px] border border-line bg-surface p-5 pb-8">
        <span className="h-[5px] w-10 self-center rounded-full bg-line" aria-hidden />
        <h2 className="text-xl font-bold tracking-tight">Settings</h2>

        <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface2 p-3.5">
          <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-accent-soft text-accent-ink">
            <Laptop size={20} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-bold">{presence.laptopName}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink2">
              <span className="h-2 w-2 rounded-full" style={{ background: statusColor }} aria-hidden />
              {statusWord} · Brain qwen3.5:2b
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-line text-sm font-bold text-ink1"
          >
            Switch laptop
          </button>
          <button
            type="button"
            onClick={() => void unpair()}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-line text-sm font-bold text-danger"
          >
            Unpair
          </button>
        </div>

        <div className="flex flex-col overflow-hidden rounded-2xl bg-surface2">
          <ToggleRow label="Speak replies" on={speak} onChange={setSpeak} first />
          <ToggleRow label="Show latency (debug)" on={showLatency} onChange={setShowLatency} />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-ink2">Theme</span>
          <div className="grid grid-cols-3 gap-1 rounded-2xl border border-line bg-surface2 p-1" role="group" aria-label="Theme">
            {THEME_OPTS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setThemePref(o.value)}
                aria-pressed={themePref === o.value}
                className="h-10 rounded-xl text-sm font-bold"
                style={{
                  background: themePref === o.value ? 'var(--accent)' : 'transparent',
                  color: themePref === o.value ? '#fff' : 'var(--ink2)',
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => void signOut()}
          className="inline-flex h-[52px] items-center justify-center gap-2 rounded-2xl border border-line text-[15px] font-bold text-ink1"
        >
          <LogOut size={16} aria-hidden />
          Sign out
        </button>
        <p className="text-center text-xs text-ink3">
          Signing out keeps the pairing. Your AI and memory stay on your laptop.
        </p>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  on,
  onChange,
  first,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
  first?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex min-h-[52px] items-center gap-3 px-4 text-left text-sm"
      style={{ borderTop: first ? '0' : '1px solid var(--line)' }}
    >
      <span className="flex-1 font-medium">{label}</span>
      <span
        aria-hidden
        className="relative h-[26px] w-11 flex-none rounded-full"
        style={{ background: on ? 'var(--accent)' : 'var(--ink4)', transition: 'background .2s' }}
      >
        <span
          className="absolute top-[3px] h-5 w-5 rounded-full bg-white"
          style={{ left: on ? '21px' : '3px', transition: 'left .2s' }}
        />
      </span>
    </button>
  );
}
