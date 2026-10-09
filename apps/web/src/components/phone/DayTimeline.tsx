import { Footprints, GripVertical, Lock } from 'lucide-react';
import type { Occurrence } from '@rocky/core';
import { minutesToHHmm } from '../../lib/remote';
import {
  PX_PER_HOUR,
  blockHeightPx,
  blockTopPx,
  kindPrefix,
  priorityMeta,
} from './blocks';

const HOURS = Array.from({ length: 24 }, (_, h) => h);

function hourLabel(h: number): string {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

/**
 * Phone day timeline (read-only). 56 px/hour, absolute blocks, travel
 * stripes before buffered events, red now-line when viewing today.
 */
export function DayTimeline({
  occurrences,
  isToday,
  nowMin,
  onOpen,
}: {
  occurrences: Occurrence[];
  isToday: boolean;
  nowMin: number;
  onOpen: (o: Occurrence) => void;
}) {
  const height = 24 * PX_PER_HOUR;
  return (
    <div className="relative" style={{ height }} aria-label="Day timeline">
      {HOURS.map((h) => (
        <div key={h}>
          <span
            className="tnum absolute left-0 w-12 text-right text-[11px] text-ink4"
            style={{ top: h * PX_PER_HOUR - 7 }}
          >
            {hourLabel(h)}
          </span>
          <span
            aria-hidden
            className="absolute left-16 right-0 border-t border-line opacity-60"
            style={{ top: h * PX_PER_HOUR }}
          />
        </div>
      ))}
      {isToday && (
        <div
          aria-hidden
          className="absolute left-14 right-0 z-[4] flex items-center"
          style={{ top: (nowMin / 60) * PX_PER_HOUR }}
        >
          <span className="h-2.5 w-2.5 rounded-full bg-danger" />
          <span className="h-[2px] flex-1 bg-danger" />
        </div>
      )}
      {occurrences.map((o) => (
        <TimelineBlock key={o.id} occurrence={o} onOpen={onOpen} />
      ))}
    </div>
  );
}

function TimelineBlock({
  occurrence: o,
  onOpen,
}: {
  occurrence: Occurrence;
  onOpen: (o: Occurrence) => void;
}) {
  const prefix = kindPrefix(o.kind);
  const edge = `var(--${prefix}-edge)`;
  const pr = priorityMeta(o.priority);
  const top = blockTopPx(o.startMin);
  const h = blockHeightPx(o.startMin, o.endMin);
  const tall = h >= 64;
  return (
    <>
      {o.travelMin > 0 && (
        <div
          aria-hidden
          className="absolute left-16 right-4 flex items-center gap-1.5 rounded-lg px-2.5 text-xs text-ink2"
          style={{
            top: Math.max(0, top - (o.travelMin / 60) * PX_PER_HOUR),
            height: Math.max(18, (o.travelMin / 60) * PX_PER_HOUR - 2),
            background:
              'repeating-linear-gradient(135deg, var(--line) 0 5px, transparent 5px 10px)',
          }}
        >
          <Footprints size={12} aria-hidden />
          {o.travelMin} min
        </div>
      )}
      <button
        type="button"
        onClick={() => onOpen(o)}
        aria-label={`${o.title}, ${minutesToHHmm(o.startMin)} to ${minutesToHHmm(o.endMin)}${o.fixed ? ', fixed' : ''}`}
        className="absolute left-16 right-4 flex flex-col justify-center gap-0.5 overflow-hidden rounded-xl px-3 py-1.5 text-left"
        style={{
          top,
          height: h,
          background: `var(--${prefix}-bg)`,
          color: `var(--${prefix}-fg)`,
          border: o.fixed ? `1px solid ${edge}` : `1.5px dashed ${edge}`,
          borderTop: o.fixed ? `1px solid ${edge}` : `2px dashed ${edge}`,
        }}
      >
        <span className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
          {o.fixed ? (
            <Lock size={12} aria-hidden className="flex-none" />
          ) : (
            <GripVertical size={12} aria-hidden className="flex-none opacity-70" />
          )}
          <span className="truncate">{o.title}</span>
          <span
            title={`${pr.label} priority`}
            aria-hidden
            className="h-2 w-2 flex-none rounded-full"
            style={{ background: pr.color }}
          />
        </span>
        {tall && (
          <span className="tnum truncate text-xs opacity-80">
            {minutesToHHmm(o.startMin)} – {minutesToHHmm(o.endMin)}
            {o.subtitle ? ` · ${o.subtitle}` : ''}
          </span>
        )}
      </button>
    </>
  );
}
