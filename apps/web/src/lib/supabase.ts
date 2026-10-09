import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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

export type ClaimPairErrorKind =
  | 'expired'
  | 'wrong'
  | 'offline'
  | 'already'
  | 'network';

export class ClaimPairError extends Error {
  kind: ClaimPairErrorKind;
  constructor(kind: ClaimPairErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

/**
 * Phone claims a laptop pairing code. Requires the Supabase migration
 * from PLAN.md section 6 (devices table + claim_pair RPC).
 * Maps RPC failures onto the phone pair states.
 */
export async function claimPair(code: string): Promise<{ laptopName: string }> {
  const sb = getSupabase();
  if (!sb) throw new ClaimPairError('network', 'Supabase is not configured.');
  const { data, error } = await sb.rpc('claim_pair', { code });
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('expir')) throw new ClaimPairError('expired', error.message);
    if (msg.includes('account') || msg.includes('auth') || msg.includes('user'))
      throw new ClaimPairError('wrong', error.message);
    if (msg.includes('offline')) throw new ClaimPairError('offline', error.message);
    if (msg.includes('already') || msg.includes('paired'))
      throw new ClaimPairError('already', error.message);
    throw new ClaimPairError('network', error.message);
  }
  const row = data as { laptop_name?: string } | null;
  return { laptopName: row?.laptop_name ?? 'your laptop' };
}

/**
 * Laptop publishes a fresh pairing code. Best-effort: resolves null when
 * Supabase is unconfigured (caller uses the DEMO-ONLY fallback instead).
 * NOTE: the server must enforce code uniqueness + 5-min expiry in the
 * `claim_pair` RPC — the client cannot enforce rate limits.
 */
export async function publishLaptopPairing(
  code: string,
  expiresAtMs: number,
  laptopName: string,
): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
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
  if (error) {
    console.warn('[pair] publishLaptopPairing failed (migration missing?):', error.message);
    return false;
  }
  return true;
}
