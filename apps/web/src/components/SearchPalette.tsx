// ⌘K palette: local title search across events, tasks, assignments and
// classes. Results jump to the owning page; nothing is sent anywhere.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Search } from 'lucide-react';
import { addDays } from '@rocky/core';
import { todayLocal } from '../lib/remote';
import {
  fetchClasses,
  fetchEventsRange,
  fetchOpenAssignments,
  fetchTasksRange,
} from '../lib/queries';
import { filterSearchItems, type SearchItem } from '../lib/search';

export function SearchPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    let alive = true;
    const today = todayLocal();
    const from = addDays(today, -45);
    const to = addDays(today, 45);
    Promise.all([
      fetchEventsRange(from, to),
      fetchTasksRange(from, to),
      fetchOpenAssignments(),
      fetchClasses(),
    ])
      .then(([events, tasks, asgs, classes]) => {
        if (!alive) return;
        setItems([
          ...events.map((e): SearchItem => ({
            id: `event:${e.id}`,
            title: e.title,
            sub: e.subtitle ?? 'Calendar event',
            path: '/calendar',
          })),
          ...tasks.map((t): SearchItem => ({
            id: `task:${t.id}`,
            title: t.title,
            sub: `Task · ${t.task_date}`,
            path: '/tasks',
          })),
          ...asgs.map((a): SearchItem => ({
            id: `asg:${a.id}`,
            title: a.title,
            sub: 'Assignment',
            path: '/classes',
          })),
          ...classes.map((c): SearchItem => ({
            id: `class:${c.id}`,
            title: c.name,
            sub: c.code ?? 'Class',
            path: '/classes',
          })),
        ]);
        setLoading(false);
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const results = useMemo(() => filterSearchItems(items, query), [items, query]);

  return (
    <div className="fixed inset-0 z-50 flex justify-center" role="dialog" aria-modal="true" aria-label="Search">
      <button type="button" aria-label="Close search" onClick={onClose} className="absolute inset-0 bg-black/55" />
      <div className="rk-pop relative mt-[12vh] flex max-h-[60vh] w-[min(560px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search size={17} aria-hidden className="shrink-0 text-ink3" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search events, tasks, assignments, classes…"
            aria-label="Search"
            className="h-13 w-full bg-transparent py-3.5 text-[15px] text-ink1 outline-none placeholder:text-ink4"
          />
          <span className="tnum flex-none rounded-md border border-line px-2 py-0.5 text-xs text-ink3">esc</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading ? (
            <p className="px-3 py-6 text-center text-sm text-ink3">Loading…</p>
          ) : !query.trim() ? (
            <p className="px-3 py-6 text-center text-sm text-ink3">
              Type to search your calendar, tasks, assignments, and classes.
            </p>
          ) : results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-ink3">No matches for “{query.trim()}”.</p>
          ) : (
            <ul className="flex list-none flex-col p-0">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      navigate(r.path);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface2"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[15px] font-semibold">{r.title}</span>
                      {r.sub && <span className="truncate text-xs text-ink3">{r.sub}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
