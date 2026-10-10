// Live pairing state for the app shell (sidebar chips, dashboard nudge).
//
// Brain chip data comes from useLaptopPresence in remote.ts (last_seen).
// This hook reports the phone row: paired + name. In DEMO-ONLY mode it reads
// the local flag; with Supabase it polls + subscribes on `devices`.

import { useEffect, useState } from 'react';
import { getSupabase, isSupabaseConfigured, readPhoneDevice } from './supabase';
import { subscribeChannel } from './realtime';
import { demoReadPaired, isDemoPairingEnabled } from './demoOnly.pairingFallback';

export interface PhonePairState {
  /** null while loading. */
  paired: boolean | null;
  phoneName: string | null;
}

export function usePhonePaired(enabled = true): PhonePairState {
  const [state, setState] = useState<PhonePairState>({ paired: null, phoneName: null });

  useEffect(() => {
    if (!enabled) return;
    const demo = !isSupabaseConfigured() && isDemoPairingEnabled();
    if (demo) {
      try {
        const p = demoReadPaired();
        setState({ paired: p != null, phoneName: null });
      } catch {
        setState({ paired: false, phoneName: null });
      }
      return;
    }
    if (!isSupabaseConfigured()) {
      setState({ paired: false, phoneName: null });
      return;
    }
    const sb = getSupabase();
    if (!sb) {
      setState({ paired: false, phoneName: null });
      return;
    }
    let alive = true;
    const refresh = async () => {
      try {
        const row = await readPhoneDevice();
        if (!alive) return;
        setState({ paired: row != null, phoneName: row?.name ?? null });
      } catch {
        /* keep last state; poll retries */
      }
    };
    void refresh();
    const tick = window.setInterval(refresh, 15_000);
    const channel = subscribeChannel(sb, 'shell-phone-pair', (ch) =>
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, () =>
        void refresh(),
      ),
    );
    return () => {
      alive = false;
      window.clearInterval(tick);
      void sb.removeChannel(channel);
    };
  }, [enabled]);

  return state;
}
