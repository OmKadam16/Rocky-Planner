import { useEffect, useState } from 'react';
import { isSupabaseConfigured, readPhoneDevice } from '../lib/supabase';
import { demoReadPaired, isDemoPairingEnabled } from '../lib/demoOnly.pairingFallback';
import { RemotePairFlow } from './RemotePairFlow';
import { PhoneHome } from '../components/phone/PhoneHome';

/**
 * /remote gate: paired phones get the calendar home screen, everyone else
 * gets the pair flow. Pairing is decided by the phone's `devices` row (or
 * the DEMO-ONLY local flag) — never by localStorage in production.
 */
export function RemoteGate() {
  const [paired, setPaired] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!isSupabaseConfigured() && isDemoPairingEnabled()) {
          if (alive) setPaired(demoReadPaired() != null);
          return;
        }
        const row = await readPhoneDevice();
        if (alive) setPaired(row != null);
      } catch {
        if (alive) setPaired(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (paired === null) {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col gap-2.5 px-5 pt-16" aria-label="Loading">
        {[52, 80, 36, 110].map((h, i) => (
          <span key={i} className="rk-shimmer rounded-xl bg-surface2" style={{ height: h, animationDelay: `${i * 0.2}s` }} />
        ))}
      </div>
    );
  }

  if (paired) {
    return <PhoneHome onUnpaired={() => setPaired(false)} />;
  }
  return <RemotePairFlow onPaired={() => setPaired(true)} />;
}
