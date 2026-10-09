// ─────────────────────────────────────────────────────────────────────
// DEMO-ONLY PAIRING FALLBACK — DO NOT SHIP TO PRODUCTION.
// ─────────────────────────────────────────────────────────────────────
// This file simulates the Supabase `devices` relay with localStorage so
// /pair and /remote can be exercised with no backend (Phase 0 / pre-B5).
//
// It is ACTIVE ONLY when ALL of these hold:
//   1. import.meta.env.VITE_ROCKY_DEMO_PAIRING === '1'
//   2. Supabase is NOT configured (no VITE_SUPABASE_URL / ANON_KEY)
//
// The moment Supabase env vars exist, every function below throws and the
// UI shows "Supabase not configured / relay missing" instead of fake data.
// Grep for DEMO-ONLY before release; nothing in this file may ship.
// ─────────────────────────────────────────────────────────────────────

import { isSupabaseConfigured } from './supabase';

const LS_PAIR = 'rocky.DEMO-ONLY.laptopPair';
const LS_PAIRED = 'rocky.DEMO-ONLY.pairedPhone';

export interface DemoLaptopPair {
  code: string; // stored form, no dash
  expiresAtMs: number;
  laptopName: string;
  lastSeenMs: number;
}

export function isDemoPairingEnabled(): boolean {
  try {
    return (
      import.meta.env.VITE_ROCKY_DEMO_PAIRING === '1' &&
      !isSupabaseConfigured()
    );
  } catch {
    return false;
  }
}

function assertDemo(): void {
  if (!isDemoPairingEnabled()) {
    throw new Error(
      '[DEMO-ONLY] demo pairing is disabled (Supabase configured or flag off). ' +
        'This fallback must not run in production.',
    );
  }
  try {
    console.warn('[DEMO-ONLY] using localStorage pairing fallback — not real sync.');
  } catch {
    /* ignore */
  }
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/** Laptop publishes/refreshes its code + heartbeat (call every 15 s). */
export function demoPublishLaptopPair(pair: DemoLaptopPair): void {
  assertDemo();
  write(LS_PAIR, pair);
}

export function demoReadLaptopPair(): DemoLaptopPair | null {
  assertDemo();
  return read<DemoLaptopPair>(LS_PAIR);
}

export function demoHeartbeat(): void {
  assertDemo();
  const cur = read<DemoLaptopPair>(LS_PAIR);
  if (cur) write(LS_PAIR, { ...cur, lastSeenMs: Date.now() });
}

export function demoClearLaptopPair(): void {
  assertDemo();
  try {
    localStorage.removeItem(LS_PAIR);
  } catch {
    /* ignore */
  }
}

/** Phone claims a code. Returns laptop name or a state-kind failure. */
export function demoClaimPair(
  code: string,
  now: number = Date.now(),
): { ok: true; laptopName: string } | { ok: false; kind: 'expired' | 'offline' | 'network' } {
  assertDemo();
  const pub = read<DemoLaptopPair>(LS_PAIR);
  if (!pub) return { ok: false, kind: 'offline' };
  // Laptop offline when heartbeat older than 45 s (PLAN.md section 6).
  if (now - pub.lastSeenMs > 45_000) return { ok: false, kind: 'offline' };
  if (now >= pub.expiresAtMs || pub.code !== code)
    return { ok: false, kind: 'expired' };
  write(LS_PAIRED, { laptopName: pub.laptopName, atMs: now });
  return { ok: true, laptopName: pub.laptopName };
}

export function demoReadPaired(): { laptopName: string; atMs: number } | null {
  assertDemo();
  return read(LS_PAIRED);
}

export function demoUnpair(): void {
  assertDemo();
  try {
    localStorage.removeItem(LS_PAIRED);
  } catch {
    /* ignore */
  }
}
