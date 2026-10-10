// Supabase reads/writes for the laptop app shell (Dashboard, Calendar,
// Classes, Tasks, Activity, Settings → Profile).
//
// Rows are the user's own via RLS; user_id defaults to auth.uid() so writes
// omit it. Recurrence expansion stays in @rocky/core (expandEvents) — callers
// fetch raw rows here and expand client-side (see remote.ts useOccurrences).

import type { Assignment, ClassRow, Command, Profile, Task } from '@rocky/core';
import { getSupabase, isSupabaseConfigured } from './supabase';
import type { ProfileRowUpdate } from './profile';

function sbOrNull() {
  return isSupabaseConfigured() ? getSupabase() : null;
}

export async function fetchTasksForDate(date: string): Promise<Task[]> {
  const sb = sbOrNull();
  if (!sb) return [];
  const { data, error } = await sb
    .from('tasks')
    .select('*')
    .eq('task_date', date)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Task[];
}

export async function fetchTasksRange(from: string, to: string): Promise<Task[]> {
  const sb = sbOrNull();
  if (!sb) return [];
  const { data, error } = await sb
    .from('tasks')
    .select('*')
    .gte('task_date', from)
    .lte('task_date', to)
    .order('task_date', { ascending: true })
    .order('position', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Task[];
}

export async function setTaskDone(id: string, done: boolean): Promise<void> {
  const sb = sbOrNull();
  if (!sb) throw new Error('Supabase is not configured.');
  const { error } = await sb.from('tasks').update({ done }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function fetchAssignmentsDue(fromIso: string, toIso: string): Promise<Assignment[]> {
  const sb = sbOrNull();
  if (!sb) return [];
  const { data, error } = await sb
    .from('assignments')
    .select('*')
    .neq('status', 'done')
    .not('due_at', 'is', null)
    .lte('due_at', toIso)
    .gte('due_at', fromIso)
    .order('due_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Assignment[];
}

/** Open assignments with a due date (for Due soon + class cards). */
export async function fetchOpenAssignments(): Promise<Assignment[]> {
  const sb = sbOrNull();
  if (!sb) return [];
  const { data, error } = await sb
    .from('assignments')
    .select('*')
    .neq('status', 'done')
    .not('due_at', 'is', null)
    .order('due_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Assignment[];
}

export async function fetchClasses(): Promise<ClassRow[]> {
  const sb = sbOrNull();
  if (!sb) return [];
  const { data, error } = await sb
    .from('classes')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ClassRow[];
}

export async function fetchRecentCommands(limit = 5): Promise<Command[]> {
  const sb = sbOrNull();
  if (!sb) return [];
  const { data, error } = await sb
    .from('commands')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as Command[];
}

/** The signed-in user's profile row (auto-created on sign-up by the DB). */
export async function readProfile(): Promise<Profile | null> {
  const sb = sbOrNull();
  if (!sb) return null;
  const { data, error } = await sb.from('profiles').select('*').limit(1).maybeSingle();
  if (error || !data) return null;
  return data as Profile;
}

/** Upsert the editable profile fields. user_id is required for the upsert. */
export async function saveProfile(row: ProfileRowUpdate): Promise<void> {
  const sb = sbOrNull();
  if (!sb) throw new Error('Supabase is not configured.');
  const { error } = await sb
    .from('profiles')
    .upsert(row, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
}
