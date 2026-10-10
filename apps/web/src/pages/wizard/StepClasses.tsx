// Wizard step 3: classes. Lists what exists; a minimal inline form adds one
// (name + optional code, meeting days, start/end). The DB trigger turns a
// scheduled class into a locked calendar block automatically.

import { useEffect, useState } from 'react';
import { GraduationCap, Plus } from 'lucide-react';
import type { ClassRow } from '@rocky/core';
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase';
import { fetchClasses } from '../../lib/queries';
import { minutesToHHmm } from '../../lib/remote';
import { CLASS_DAYS, timeInputToMin } from '../../lib/wizard';
import { WizardContinue } from './StepProfile';

async function insertClass(row: {
  name: string;
  code: string | null;
  meeting_days: number[];
  start_min: number | null;
  end_min: number | null;
}): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured.');
  const { error } = await sb.from('classes').insert(row);
  if (error) throw new Error(error.message);
}

export function WizardClassesStep({ onContinue }: { onContinue: () => void }) {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchClasses()
      .then((c) => alive && (setClasses(c), setLoading(false)))
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const toggleDay = (d: number) =>
    setDays((list) => (list.includes(d) ? list.filter((x) => x !== d) : [...list, d].sort()));

  const add = async () => {
    const clean = name.trim();
    if (!clean) {
      setError('Give the class a name first.');
      return;
    }
    let startMin: number | null = null;
    let endMin: number | null = null;
    if (start || end) {
      startMin = timeInputToMin(start);
      endMin = timeInputToMin(end);
      if (startMin == null || endMin == null || endMin <= startMin) {
        setError('Use a valid time range, e.g. 09:00 to 10:30.');
        return;
      }
      if (days.length === 0) {
        setError('Pick at least one meeting day for a scheduled class.');
        return;
      }
    }
    setAdding(true);
    setError(null);
    try {
      await insertClass({
        name: clean,
        code: code.trim() || null,
        meeting_days: days,
        start_min: startMin,
        end_min: endMin,
      });
      setClasses(await fetchClasses());
      setName('');
      setCode('');
      setDays([]);
      setStart('');
      setEnd('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the class.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="flex w-full max-w-[760px] flex-col gap-6">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight">Add your classes</h1>
        <p className="mt-2 text-[16px] text-ink2">
          They become fixed blocks. Rocky plans everything else around them.
        </p>
      </div>

      {!isSupabaseConfigured() || loading ? (
        <p className="text-sm text-ink3">{loading ? 'Loading classes…' : 'Sign in to add classes.'}</p>
      ) : classes.length > 0 ? (
        <ul className="flex list-none flex-col gap-2 p-0">
          {classes.map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
              <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-cls-bg text-cls-fg">
                <GraduationCap size={16} aria-hidden />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-bold">
                  {c.name}
                  {c.code ? <span className="ml-2 text-xs font-semibold text-ink3">{c.code}</span> : null}
                </span>
                <span className="tnum text-xs text-ink2">
                  {c.meeting_days.length > 0
                    ? `${[...c.meeting_days].sort().map((d) => CLASS_DAYS[d]).join(' · ')}${c.start_min != null && c.end_min != null ? ` · ${minutesToHHmm(c.start_min)}–${minutesToHHmm(c.end_min)}` : ''}`
                    : 'No weekly schedule yet'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink2">No classes yet — add your first one below, or continue.</p>
      )}

      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
        <span className="text-sm font-bold">Add a class</span>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-ink2">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Biology Lecture"
              className="h-11 rounded-xl border border-line bg-surface2 px-3.5 text-[15px] outline-none placeholder:text-ink4 focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-ink2">Code (optional)</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="BIOL 101"
              className="h-11 rounded-xl border border-line bg-surface2 px-3.5 text-[15px] outline-none placeholder:text-ink4 focus:border-accent"
            />
          </label>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-ink2">Meeting days</span>
          <div className="flex flex-wrap gap-1.5">
            {CLASS_DAYS.map((label, d) => (
              <button
                key={label}
                type="button"
                onClick={() => toggleDay(d)}
                aria-pressed={days.includes(d)}
                className="h-9 min-w-9 rounded-lg border px-2.5 text-[13px] font-bold"
                style={{
                  borderColor: days.includes(d) ? 'var(--accent)' : 'var(--line)',
                  background: days.includes(d) ? 'var(--accent-soft)' : 'transparent',
                  color: days.includes(d) ? 'var(--accent-ink)' : 'var(--ink2)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-ink2">Start (optional)</span>
            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="h-11 rounded-xl border border-line bg-surface2 px-3.5 text-[15px] outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-ink2">End (optional)</span>
            <input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              min={start || undefined}
              className="h-11 rounded-xl border border-line bg-surface2 px-3.5 text-[15px] outline-none focus:border-accent"
            />
          </label>
        </div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button
          type="button"
          onClick={() => void add()}
          disabled={adding}
          className="inline-flex h-10 items-center gap-1.5 self-start rounded-[10px] border border-line px-4 text-sm font-bold disabled:opacity-50"
        >
          <Plus size={15} aria-hidden />
          {adding ? 'Adding…' : 'Add class'}
        </button>
        <p className="text-xs text-ink3">
          {days.length > 0 || (start && end)
            ? `Meets ${days.length ? [...days].sort().map((d) => CLASS_DAYS[d]).join(', ') : '—'}${start && end ? ` ${start}–${end}` : ''}.`
            : 'Times are optional — a class without a schedule still tracks assignments.'}
        </p>
      </div>

      <WizardContinue saving={false} onContinue={onContinue} />
    </div>
  );
}
