import { Lock, GripVertical, Footprints, X } from 'lucide-react';
import type { Occurrence } from '@rocky/core';
import { formatRange } from '../../lib/remote';
import { kindLabel, kindPrefix, priorityMeta } from './blocks';

/**
 * Read-only occurrence bottom sheet (phone). Everything is display-only:
 * edits happen by voice or on the laptop.
 */
export function EventSheet({
  occurrence,
  onClose,
}: {
  occurrence: Occurrence;
  onClose: () => void;
}) {
  const prefix = kindPrefix(occurrence.kind);
  const pr = priorityMeta(occurrence.priority);
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={occurrence.title}
    >
      <button
        type="button"
        aria-label="Close event details"
        onClick={onClose}
        className="absolute inset-0 bg-black/55"
      />
      <div className="rk-pop relative flex max-h-[80vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-[20px] border border-line bg-surface p-5 pb-8">
        <span className="h-[5px] w-10 self-center rounded-full bg-line" aria-hidden />
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-3 w-3 rounded"
              style={{ background: `var(--${prefix}-edge)` }}
            />
            <span className="text-xs font-bold uppercase tracking-[0.06em] text-ink3">
              {kindLabel(occurrence.kind)}
              {occurrence.recurring ? ' · repeats' : ''}
              {occurrence.moved ? ' · moved' : ''}
            </span>
          </span>
          <span className="text-[28px] font-bold leading-tight tracking-tight">
            {occurrence.title}
          </span>
          {occurrence.subtitle && (
            <span className="text-[15px] text-ink2">{occurrence.subtitle}</span>
          )}
          <span className="tnum text-[16px] text-ink2">
            {formatRange(occurrence.startMin, occurrence.endMin)}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <span
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface2 px-3 text-[13px] font-semibold text-ink1"
            style={{
              border: occurrence.fixed
                ? `1px solid var(--${prefix}-edge)`
                : `1.5px dashed var(--${prefix}-edge)`,
            }}
          >
            {occurrence.fixed ? <Lock size={13} aria-hidden /> : <GripVertical size={13} aria-hidden />}
            {occurrence.fixed ? 'Fixed' : 'Flexible'}
          </span>
          <span
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface2 px-3 text-[13px] font-semibold text-ink1"
            title={`${pr.label} priority`}
          >
            <span
              aria-hidden
              className="h-2 w-2 flex-none rounded-full"
              style={{ background: pr.color }}
            />
            {pr.label}
          </span>
          {occurrence.travelMin > 0 && (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface2 px-3 text-[13px] font-semibold text-ink1">
              <Footprints size={13} aria-hidden />
              Leave {occurrence.travelMin} min early
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-accent text-[16px] font-bold text-white"
        >
          <X size={18} aria-hidden />
          Close
        </button>
        <p className="text-center text-xs text-ink3">
          Read-only here — change it by voice or on the laptop.
        </p>
      </div>
    </div>
  );
}
