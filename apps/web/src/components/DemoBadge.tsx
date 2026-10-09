import { TriangleAlert } from 'lucide-react';
import { isDemoPairingEnabled } from '../lib/demoOnly.pairingFallback';

/** Rendered ONLY in DEMO-ONLY mode so fake pairing can never ship silently. */
export function DemoBadge() {
  if (!isDemoPairingEnabled()) return null;
  return (
    <div
      role="note"
      className="flex items-center gap-2 rounded-xl border border-warning bg-warning-soft px-3 py-2 text-[13px] font-semibold text-warning"
    >
      <TriangleAlert size={16} aria-hidden className="shrink-0" />
      <span>
        DEMO-ONLY pairing (localStorage, no real sync). Remove before release.
      </span>
    </div>
  );
}
