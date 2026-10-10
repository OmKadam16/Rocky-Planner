// One calendar occurrence, laptop style: kind-colored edge, lock for fixed
// blocks, grip for flexible ones (AGENTS.md block language). Read-only here —
// drag/resize land in the next build.

import { GripVertical, Lock } from 'lucide-react';
import type { Occurrence } from '@rocky/core';
import { formatRange } from '../lib/remote';

const KIND_TOKEN: Record<Occurrence['kind'], string> = {
  class: 'cls',
  commitment: 'com',
  study: 'stu',
  personal: 'per',
  break: 'brk',
};

/** Design token prefix for an event kind (cls/com/stu/per/brk). */
export function kindToken(kind: Occurrence['kind']): string {
  return KIND_TOKEN[kind];
}

const PRIORITY_META: Record<Occurrence['priority'], { color: string; label: string }> = {
  high: { color: 'var(--danger)', label: 'High' },
  med: { color: 'var(--warning)', label: 'Med' },
  low: { color: 'var(--ink3)', label: 'Low' },
};

export function OccurrenceRow({ occ, nowMin }: { occ: Occurrence; nowMin?: number }) {
  const token = KIND_TOKEN[occ.kind];
  const pr = PRIORITY_META[occ.priority];
  const isNow = nowMin != null && nowMin >= occ.startMin && nowMin < occ.endMin;
  return (
    <div
      className="flex items-center gap-3 rounded-xl px-3 py-2.5"
      style={{
        background: `var(--${token}-bg)`,
        border: '1px solid transparent',
        borderTop: occ.fixed ? `1px solid var(--${token}-edge)` : `2px dashed var(--${token}-edge)`,
        boxShadow: isNow ? 'inset 0 0 0 1.5px var(--accent)' : 'none',
      }}
    >
      {occ.fixed ? (
        <Lock size={14} aria-label="Fixed — Rocky will not move this" className="shrink-0" style={{ color: `var(--${token}-fg)` }} />
      ) : (
        <GripVertical size={14} aria-label="Flexible" className="shrink-0" style={{ color: `var(--${token}-fg)` }} />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-semibold" style={{ color: `var(--${token}-fg)` }}>
          {occ.title}
        </span>
        {occ.subtitle && (
          <span className="truncate text-xs" style={{ color: `var(--${token}-fg)`, opacity: 0.75 }}>
            {occ.subtitle}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-xs">
        <span className="h-[7px] w-[7px] rounded-full" style={{ background: pr.color }} aria-hidden />
        {pr.label}
      </span>
      <span className="tnum shrink-0 text-xs font-semibold" style={{ color: `var(--${token}-fg)` }}>
        {formatRange(occ.startMin, occ.endMin)}
      </span>
    </div>
  );
}
