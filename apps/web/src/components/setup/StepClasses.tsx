import { useMemo, useState } from 'react';
import { Lock, Plus, Trash2 } from 'lucide-react';
import { EMPTY_CLASS, hhmmToMin, validateClassForm, type ClassForm } from '../../lib/onboarding';
import { insertClassWithEvent } from '../../lib/setupApi';
import type { StepApi } from '../../pages/SetupPage';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
/** Mon-first buttons map to 0=Sunday weekdays. */
const DAY_VALUES = [1, 2, 3, 4, 5, 6, 0];
const PREVIEW_DAYS = [1, 2, 3, 4, 5];
const PREVIEW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const PREVIEW_START = 8 * 60;
const PREVIEW_END = 18 * 60;
const PREVIEW_H = 270;

/**
 * Wizard step 3 — Classes. Class rows (name, professor, days, times, date
 * range) with a live Mon–Fri preview of the fixed blocks they create.
 */
export function StepClasses({ apiRef }: { apiRef: (api: StepApi | null) => void }) {
  const [rows, setRows] = useState<ClassForm[]>([{ ...EMPTY_CLASS }]);
  const [formError, setFormError] = useState<string | null>(null);

  apiRef({
    save: async () => {
      const filled = rows.filter((r) => r.name.trim() || r.meetingDays.length > 0);
      for (const r of filled) {
        const err = validateClassForm(r);
        if (err) return err;
      }
      try {
        for (const r of filled) {
          await insertClassWithEvent(r);
        }
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : 'Could not save classes.';
      }
    },
  });

  function patch(i: number, p: Partial<ClassForm>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
    setFormError(null);
  }

  function toggleDay(i: number, day: number) {
    const cur = rows[i]!.meetingDays;
    patch(i, { meetingDays: cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day] });
  }

  const preview = useMemo(() => {
    const out: Array<{ left: string; top: number; height: number; label: string; key: string }> = [];
    rows.forEach((r, i) => {
      const start = hhmmToMin(r.startHhmm);
      const end = hhmmToMin(r.endHhmm);
      if (start == null || end == null || end <= start || !r.name.trim()) return;
      for (const d of PREVIEW_DAYS) {
        if (!r.meetingDays.includes(d)) continue;
        const col = PREVIEW_DAYS.indexOf(d);
        const top = Math.max(0, ((start - PREVIEW_START) / (PREVIEW_END - PREVIEW_START)) * PREVIEW_H);
        const height = Math.max(
          18,
          ((Math.min(end, PREVIEW_END) - Math.max(start, PREVIEW_START)) / (PREVIEW_END - PREVIEW_START)) * PREVIEW_H,
        );
        out.push({
          left: `${(col / 5) * 100}%`,
          top,
          height,
          label: r.name.trim(),
          key: `${i}-${d}`,
        });
      }
    });
    return out;
  }, [rows]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8">
      <h1 className="text-[28px] font-bold tracking-tight">Add your classes</h1>
      <p className="mt-2 max-w-[560px] text-[16px] leading-relaxed text-ink2">
        Classes become locked blocks Rocky never moves. You can add work and club
        meetings later as fixed commitments.
      </p>
      <div className="mt-7 grid items-start gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          {rows.map((r, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">Class {i + 1}</span>
                <span className="flex-1" />
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                    aria-label={`Remove class ${i + 1}`}
                    className="grid h-8 w-8 place-items-center rounded-lg text-ink3 hover:text-danger"
                  >
                    <Trash2 size={15} aria-hidden />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-ink2">Name</span>
                  <input
                    value={r.name}
                    onChange={(e) => patch(i, { name: e.target.value })}
                    placeholder="Biology Lecture"
                    className="h-10 rounded-xl border border-line bg-surface2 px-3 text-sm text-ink1 outline-none placeholder:text-ink4 focus:border-accent"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-ink2">Code</span>
                  <input
                    value={r.code}
                    onChange={(e) => patch(i, { code: e.target.value })}
                    placeholder="BIOL 101"
                    className="h-10 rounded-xl border border-line bg-surface2 px-3 text-sm text-ink1 outline-none placeholder:text-ink4 focus:border-accent"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-ink2">Professor</span>
                <input
                  value={r.professor}
                  onChange={(e) => patch(i, { professor: e.target.value })}
                  placeholder="Dr. Ramirez"
                  className="h-10 rounded-xl border border-line bg-surface2 px-3 text-sm text-ink1 outline-none placeholder:text-ink4 focus:border-accent"
                />
              </label>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-ink2">Meeting days</span>
                <div className="flex gap-1.5" role="group" aria-label="Meeting days">
                  {DAY_LETTERS.map((letter, di) => {
                    const value = DAY_VALUES[di]!;
                    const on = r.meetingDays.includes(value);
                    return (
                      <button
                        key={di}
                        type="button"
                        onClick={() => toggleDay(i, value)}
                        aria-pressed={on}
                        aria-label={['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][di]}
                        className="grid h-9 w-9 place-items-center rounded-xl border text-sm font-bold"
                        style={{
                          borderColor: on ? 'var(--accent)' : 'var(--line)',
                          background: on ? 'var(--accent-soft)' : 'var(--surface2)',
                          color: on ? 'var(--accent-ink)' : 'var(--ink2)',
                        }}
                      >
                        {letter}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-ink2">Starts</span>
                  <input
                    type="time"
                    value={r.startHhmm}
                    onChange={(e) => patch(i, { startHhmm: e.target.value })}
                    className="h-10 rounded-xl border border-line bg-surface2 px-3 text-sm text-ink1 outline-none focus:border-accent"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-ink2">Ends</span>
                  <input
                    type="time"
                    value={r.endHhmm}
                    onChange={(e) => patch(i, { endHhmm: e.target.value })}
                    className="h-10 rounded-xl border border-line bg-surface2 px-3 text-sm text-ink1 outline-none focus:border-accent"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-ink2">First day</span>
                  <input
                    type="date"
                    value={r.startsOn}
                    onChange={(e) => patch(i, { startsOn: e.target.value })}
                    className="h-10 rounded-xl border border-line bg-surface2 px-3 text-sm text-ink1 outline-none focus:border-accent"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-ink2">Last day</span>
                  <input
                    type="date"
                    value={r.endsOn}
                    onChange={(e) => patch(i, { endsOn: e.target.value })}
                    className="h-10 rounded-xl border border-line bg-surface2 px-3 text-sm text-ink1 outline-none focus:border-accent"
                  />
                </label>
              </div>
            </div>
          ))}
          {formError && (
            <p role="alert" className="rounded-xl border border-danger bg-danger-soft p-3 text-sm font-semibold">
              {formError}
            </p>
          )}
          <button
            type="button"
            onClick={() => setRows((rs) => [...rs, { ...EMPTY_CLASS }])}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-line text-sm font-semibold text-ink2 hover:border-accent hover:text-accent-ink"
          >
            <Plus size={16} aria-hidden />
            Add class
          </button>
        </div>

        {/* Live weekly preview */}
        <div className="flex flex-col gap-3.5 rounded-2xl border border-line bg-surface p-5 lg:sticky lg:top-4">
          <div className="flex items-center justify-between">
            <span className="text-[16px] font-semibold">Your week</span>
            <span className="flex items-center gap-1.5 text-xs text-ink3">
              <Lock size={12} aria-hidden />
              Fixed
            </span>
          </div>
          <div className="grid grid-cols-5 pl-9 text-xs font-semibold text-ink3">
            {PREVIEW_LABELS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="relative ml-9 border-t border-line" style={{ height: PREVIEW_H }} aria-hidden>
            {[8, 10, 12, 14, 16, 18].map((h) => (
              <span
                key={h}
                className="absolute -left-9 text-[11px] text-ink4"
                style={{ top: ((h * 60 - PREVIEW_START) / (PREVIEW_END - PREVIEW_START)) * PREVIEW_H - 7 }}
              >
                {h > 12 ? `${h - 12} PM` : h === 12 ? '12 PM' : `${h} AM`}
              </span>
            ))}
            {preview.map((b) => (
              <span
                key={b.key}
                className="absolute flex gap-1 overflow-hidden rounded-lg bg-cls-bg p-1 text-xs font-semibold text-cls-fg"
                style={{
                  left: b.left,
                  width: 'calc(20% - 6px)',
                  top: b.top,
                  height: b.height,
                  border: '1px solid var(--cls-edge)',
                }}
              >
                <Lock size={10} aria-hidden className="mt-0.5 flex-none" />
                <span className="truncate">{b.label}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
