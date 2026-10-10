// Settings → Profile: who Rocky is planning for. Saves to the profiles
// table (upsert on user_id); email is read-only from the session.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Check, LogOut } from 'lucide-react';
import { useSession } from '../../lib/auth';
import {
  EMPTY_PROFILE_FORM,
  initialsFor,
  profileFormToRow,
  type ProfileFormState,
} from '../../lib/profile';
import { readProfile, saveProfile } from '../../lib/queries';
import { Card, CardTitle } from '../../components/Page';

function Field({
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-ink2">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="h-11 rounded-xl border border-line bg-surface2 px-3.5 text-[15px] text-ink1 outline-none placeholder:text-ink4 focus:border-accent"
      />
    </label>
  );
}

export function ProfilePage() {
  const { user, signOut } = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState<ProfileFormState>(EMPTY_PROFILE_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void readProfile().then((p) => {
      if (!alive) return;
      if (p) {
        setForm({
          fullName: p.full_name ?? '',
          displayName: p.display_name ?? '',
          school: p.school ?? '',
          program: p.program ?? '',
          year: p.year ?? '',
          aboutMe: p.about_me ?? '',
        });
      }
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const set =
    (key: keyof ProfileFormState) =>
    (v: string): void => {
      setSaved(false);
      setForm((f) => ({ ...f, [key]: v }));
    };

  const onSave = async () => {
    if (!user) {
      setError('You are not signed in.');
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await saveProfile(profileFormToRow(form, user.id));
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  const onSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const email = user?.email ?? '';
  const initials = initialsFor(form.displayName, form.fullName, email);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <Card labelledBy="profile-heading">
        <div className="flex items-center gap-4">
          <span
            aria-hidden
            className="grid h-16 w-16 flex-none place-items-center rounded-full bg-accent-soft text-xl font-bold text-accent-ink"
          >
            {initials}
          </span>
          <div className="flex min-w-0 flex-col">
            <CardTitle id="profile-heading">Profile</CardTitle>
            <span className="truncate text-sm text-ink2">
              {form.displayName.trim() || form.fullName.trim() || email || 'Your account'}
            </span>
          </div>
        </div>
        {loading ? (
          <p className="text-sm text-ink3">Loading profile…</p>
        ) : (
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Full name" value={form.fullName} onChange={set('fullName')} autoComplete="name" placeholder="Ada Lovelace" />
            <Field label="What should Rocky call you?" value={form.displayName} onChange={set('displayName')} autoComplete="nickname" placeholder="Addy" />
            <Field label="School" value={form.school} onChange={set('school')} placeholder="Riverside High" />
            <Field label="Program" value={form.program} onChange={set('program')} placeholder="Science" />
            <Field label="Year" value={form.year} onChange={set('year')} placeholder="Sophomore" />
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-ink2">Email (read-only)</span>
              <input
                value={email}
                readOnly
                aria-readonly
                className="h-11 rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink3 outline-none"
              />
            </label>
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-xs font-semibold text-ink2">About you</span>
              <textarea
                value={form.aboutMe}
                onChange={(e) => set('aboutMe')(e.target.value)}
                rows={4}
                placeholder="Anything Rocky should know when planning your days — subjects you like, work hours, how you like to study."
                className="rounded-xl border border-line bg-surface2 px-3.5 py-2.5 text-[15px] text-ink1 outline-none placeholder:text-ink4 focus:border-accent"
              />
            </label>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">{error}</p>
        )}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={loading || saving}
            className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-accent px-5 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save profile'}
          </button>
          {saved && (
            <span role="status" className="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
              <Check size={15} aria-hidden /> Saved
            </span>
          )}
        </div>
      </Card>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[15px] font-bold">Sign out</span>
            <span className="text-sm text-ink2">Sign out of Rocky on this laptop.</span>
          </div>
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-line px-4 text-sm font-bold text-danger"
          >
            <LogOut size={15} aria-hidden />
            Sign out
          </button>
        </div>
      </Card>
    </div>
  );
}
