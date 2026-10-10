// Supabase writes for the /setup wizard. RLS scopes everything to
// auth.uid(); user_id is taken from the session, never from input.

import { getSupabase, getSessionUser, readLaptopLastSeen } from './supabase';
import { hhmmToMin, type ClassForm } from './onboarding';

export interface ProfilePatch {
  full_name?: string | null;
  display_name?: string | null;
  school?: string | null;
  program?: string | null;
  year?: string | null;
  traits?: string[];
  hobbies?: string[];
  study_styles?: string[];
  about_me?: string | null;
}

async function uid(): Promise<string> {
  const user = await getSessionUser();
  if (!user) throw new Error('No session — sign in first.');
  return user.id;
}

/** NULL onboarded_at (or missing profile) means "not onboarded". */
export async function readOnboardedAt(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const id = await uid();
  const { data, error } = await sb.from('profiles').select('onboarded_at').eq('user_id', id).maybeSingle();
  if (error || !data) return null;
  return (data as { onboarded_at: string | null }).onboarded_at;
}

export async function readProfile(): Promise<Record<string, unknown> | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const id = await uid();
  const { data, error } = await sb.from('profiles').select('*').eq('user_id', id).maybeSingle();
  if (error || !data) return null;
  return data as Record<string, unknown>;
}

export async function saveProfile(patch: ProfilePatch): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured.');
  const id = await uid();
  const { error } = await sb.from('profiles').upsert({ user_id: id, ...patch }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
}

/**
 * Saves a class row and creates its fixed weekly class event
 * (PLAN.md section 3: kind = 'class', fixed = true, weekly).
 */
export async function insertClassWithEvent(c: ClassForm): Promise<{ classId: string }> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured.');
  const id = await uid();
  const startMin = hhmmToMin(c.startHhmm);
  const endMin = hhmmToMin(c.endHhmm);
  if (startMin == null || endMin == null) throw new Error('Bad class times.');
  const { data: cls, error: clsError } = await sb
    .from('classes')
    .insert({
      user_id: id,
      name: c.name.trim(),
      professor: c.professor.trim() || null,
      code: c.code.trim() || null,
      starts_on: c.startsOn,
      ends_on: c.endsOn,
      start_min: startMin,
      end_min: endMin,
      meeting_days: [...c.meetingDays].sort(),
    })
    .select('id')
    .single();
  if (clsError || !cls) throw new Error(clsError?.message ?? 'Could not save the class.');
  const classId = (cls as { id: string }).id;
  const { error: evError } = await sb.from('events').insert({
    user_id: id,
    title: c.name.trim(),
    kind: 'class',
    event_date: c.startsOn,
    start_min: startMin,
    end_min: endMin,
    fixed: true,
    class_id: classId,
    repeat_freq: 'weekly',
    repeat_days: [...c.meetingDays].sort(),
    repeat_until: c.endsOn,
  });
  if (evError) throw new Error(evError.message);
  return { classId };
}

export async function setOnboarded(): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured.');
  const id = await uid();
  const { error } = await sb
    .from('profiles')
    .upsert({ user_id: id, onboarded_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
}

/**
 * Brain-app liveness for the setup checklist: the laptop row's last_seen
 * must be fresher than 45 s. Model/STT rows stay "needs action" until the
 * brain reports them — TODO(Phase 2): the brain writes its health
 * (model + STT status) somewhere the web can read; point this hook there.
 */
export async function readBrainAppAlive(): Promise<boolean> {
  const presence = await readLaptopLastSeen();
  if (!presence) return false;
  return Date.now() - presence.lastSeenMs < 45_000;
}
