import {
  createClient,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js';

// Supabase client — PKCE flow (per approved decision).
// Returns null when env is missing so pages fall back to the clearly
// labeled DEMO-ONLY local pairing (demoOnly.pairingFallback.ts).
// Agent A owns the migrations; the `devices` table + `claim_pair(code)`
// RPC from PLAN.md section 6 must exist before this does anything real.

let cached: SupabaseClient | null | undefined;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
  );
}

export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anon) {
    cached = null;
    return cached;
  }
  cached = createClient(url, anon, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return cached;
}

/** Current signed-in user, or null (no session / unconfigured). */
export async function getSessionUser(): Promise<User | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.user ?? null;
}

// ---------------------------------------------------------------------------
// Pairing failures — mapped by Postgres errcode, never by message sniffing.
// "Laptop offline" is NEVER produced here: it is decided only from
// devices.last_seen older than 45 s (see readLaptopLastSeen + demoClaimPair).
// ---------------------------------------------------------------------------

/** Stable failure kinds for pairing UI. */
export type PairFailureKind =
  | 'expired' // P0001: code past pair_expires_at
  | 'wrong' // P0002: no active code for this account
  | 'not-signed-in' // 28000 / 401 / 42501: no usable session
  | 'unknown'; // anything else — UI must show error.message in small text

export class PairError extends Error {
  kind: PairFailureKind;
  constructor(kind: PairFailureKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

/** Map a Postgres/PostgREST errcode to a failure kind (null = unknown). */
export function mapDbErrcode(code: string | null | undefined): PairFailureKind | null {
  switch (code) {
    case 'P0001':
      return 'expired';
    case 'P0002':
      return 'wrong';
    case '28000': // claim_pair: auth.uid() is null
    case '42501': // RLS / permission denied (session missing or unusable)
    case '401': // PostgREST: unauthenticated
      return 'not-signed-in';
    default:
      return null;
  }
}

export interface DbLikeError {
  code?: string | null;
  message: string;
}

/** Build a PairError from a DB/PostgREST error, preserving the message. */
export function mapPairFailure(error: DbLikeError): PairError {
  const kind = mapDbErrcode(error.code ?? null) ?? 'unknown';
  return new PairError(kind, error.message);
}

// Backwards-compatible alias (was string-matched; now code-mapped).
export { PairError as ClaimPairError };

export interface ClaimPairResult {
  laptopName: string;
  laptopDeviceId: string;
  phoneDeviceId: string;
}

/**
 * Phone claims a laptop pairing code. Requires a session — with none,
 * auth.uid() is null inside claim_pair and every code looks dead, which is
 * why callers must redirect to /login on 'not-signed-in' instead of
 * showing "laptop offline".
 */
export async function claimPair(
  code: string,
  phoneName: string,
): Promise<ClaimPairResult> {
  const sb = getSupabase();
  if (!sb) {
    throw new PairError(
      'unknown',
      'Supabase is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).',
    );
  }
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) {
    throw new PairError('not-signed-in', 'No session — sign in first.');
  }
  const { data, error } = await sb.rpc('claim_pair', {
    code,
    phone_name: phoneName,
  });
  if (error) throw mapPairFailure(error);
  const row = data as {
    laptop_name?: string;
    laptop_device_id?: string;
    phone_device_id?: string;
  } | null;
  return {
    laptopName: row?.laptop_name ?? 'your laptop',
    laptopDeviceId: row?.laptop_device_id ?? '',
    phoneDeviceId: row?.phone_device_id ?? '',
  };
}

export type PublishResult = { ok: true } | { ok: false; failure: PairError };

/**
 * Laptop publishes a fresh pairing code. Surfaces the REAL failure —
 * callers must show it with a Retry button, never a QR for an unsaved code.
 * NOTE: the server enforces code format/expiry in claim_pair — the client
 * cannot enforce rate limits.
 */
export async function publishLaptopPairing(
  code: string,
  expiresAtMs: number,
  laptopName: string,
): Promise<PublishResult> {
  const sb = getSupabase();
  if (!sb) {
    return {
      ok: false,
      failure: new PairError(
        'unknown',
        'Supabase is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).',
      ),
    };
  }
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) {
    return {
      ok: false,
      failure: new PairError('not-signed-in', 'No session — sign in first.'),
    };
  }
  const { error } = await sb.from('devices').upsert(
    {
      role: 'laptop',
      name: laptopName,
      pair_code: code,
      pair_expires_at: new Date(expiresAtMs).toISOString(),
      last_seen: new Date().toISOString(),
    },
    { onConflict: 'user_id,role' },
  );
  if (error) return { ok: false, failure: mapPairFailure(error) };
  return { ok: true };
}

/**
 * Refresh devices.last_seen for this account's laptop row.
 * Called from PairPage every 15 s while /pair is open.
 * TEMPORARY owner: apps/brain takes this over with its own 15 s heartbeat
 * (PLAN.md section 6) once the brain runs — then delete these calls.
 */
export async function touchLaptopHeartbeat(): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { error } = await sb
    .from('devices')
    .update({ last_seen: new Date().toISOString() })
    .eq('role', 'laptop');
  if (error) {
    console.warn('[pair] heartbeat failed:', error.message);
    return false;
  }
  return true;
}

export interface LaptopPresence {
  lastSeenMs: number;
  laptopName: string;
}

/**
 * Read this account's laptop row for a last_seen offline check.
 * Returns null when no laptop row exists yet (fresh account).
 * "Laptop offline" <=> now - lastSeenMs > 45 s. Nothing else decides it.
 */
export async function readLaptopLastSeen(): Promise<LaptopPresence | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from('devices')
    .select('name,last_seen')
    .eq('role', 'laptop')
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { name: string | null; last_seen: string };
  return {
    lastSeenMs: new Date(row.last_seen).getTime(),
    laptopName: row.name ?? 'your laptop',
  };
}

export interface PhoneDevice {
  id: string;
  name: string;
}

/**
 * This account's phone row, if the phone already paired.
 * The /remote gate uses this (not localStorage) to decide pair vs home.
 */
export async function readPhoneDevice(): Promise<PhoneDevice | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from('devices')
    .select('id,name')
    .eq('role', 'phone')
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { id: string; name: string | null };
  return { id: row.id, name: row.name ?? 'this phone' };
}

/** Remove this account's phone row. The laptop row is left untouched. */
export async function unpairPhone(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from('devices').delete().eq('role', 'phone');
  if (error) throw mapPairFailure(error);
}

export interface PairDeviceRow {
  id: string;
  role: 'laptop' | 'phone';
  name: string | null;
  last_seen: string;
  pair_code: string | null;
  pair_expires_at: string | null;
  created_at: string | null;
}

/**
 * Both pairing rows for the /pair claim check + "Paired devices" list.
 * Missing rows come back null (fresh account, never paired).
 */
export async function readPairDevices(): Promise<{
  laptop: PairDeviceRow | null;
  phone: PairDeviceRow | null;
}> {
  const sb = getSupabase();
  if (!sb) return { laptop: null, phone: null };
  const { data, error } = await sb
    .from('devices')
    .select('id,role,name,last_seen,pair_code,pair_expires_at,created_at')
    .in('role', ['laptop', 'phone']);
  if (error || !data) return { laptop: null, phone: null };
  const rows = data as PairDeviceRow[];
  return {
    laptop: rows.find((r) => r.role === 'laptop') ?? null,
    phone: rows.find((r) => r.role === 'phone') ?? null,
  };
}

export interface LatestPhoneCommand {
  id: string;
  text: string | null;
  transcript: string | null;
  created_at: string;
}

/**
 * Newest command row sent from the phone. /pair shows "Listening…" until one
 * of these exists — the "heard" line only ever renders this real row, never a
 * canned echo.
 */
export async function readLatestPhoneCommand(): Promise<LatestPhoneCommand | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from('commands')
    .select('id,text,transcript,created_at')
    .eq('source', 'phone')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as LatestPhoneCommand;
}
