// One task row with a working Done checkbox (writes tasks.done).

import { useState } from 'react';
import { Check } from 'lucide-react';
import type { Task } from '@rocky/core';
import { setTaskDone } from '../lib/queries';

export function TaskRow({
  task,
  onChanged,
}: {
  task: Task;
  onChanged: (next: Task) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await setTaskDone(task.id, !task.done);
      onChanged({ ...task, done: !task.done });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the task.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 rounded-xl px-2 py-2">
        <button
          type="button"
          role="checkbox"
          aria-checked={task.done}
          aria-label={task.done ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`}
          disabled={pending}
          onClick={() => void toggle()}
          className="grid h-6 w-6 flex-none place-items-center rounded-lg border-[1.5px] disabled:opacity-50"
          style={{
            background: task.done ? 'var(--accent)' : 'transparent',
            borderColor: task.done ? 'var(--accent)' : 'var(--ink4)',
            color: '#fff',
          }}
        >
          {task.done && <Check size={15} aria-hidden />}
        </button>
        <span
          className="min-w-0 flex-1 truncate text-[15px]"
          style={{
            color: task.done ? 'var(--ink3)' : 'var(--ink1)',
            textDecoration: task.done ? 'line-through' : 'none',
          }}
        >
          {task.title}
        </span>
      </div>
      {error && (
        <p role="alert" className="px-2 pb-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
