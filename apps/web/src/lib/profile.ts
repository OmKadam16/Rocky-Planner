// Profile form helpers — pure mapping between the Settings form state and
// the `profiles` row shape (PLAN.md section 3). Tested in profile.test.ts.

export interface ProfileFormState {
  fullName: string;
  displayName: string;
  school: string;
  program: string;
  year: string;
  aboutMe: string;
}

export interface ProfileRowUpdate {
  user_id: string;
  full_name: string | null;
  display_name: string | null;
  school: string | null;
  program: string | null;
  year: string | null;
  about_me: string | null;
}

export const EMPTY_PROFILE_FORM: ProfileFormState = {
  fullName: '',
  displayName: '',
  school: '',
  program: '',
  year: '',
  aboutMe: '',
};

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Trim every field; blank inputs become null (never empty strings). */
export function profileFormToRow(form: ProfileFormState, userId: string): ProfileRowUpdate {
  return {
    user_id: userId,
    full_name: emptyToNull(form.fullName),
    display_name: emptyToNull(form.displayName),
    school: emptyToNull(form.school),
    program: emptyToNull(form.program),
    year: emptyToNull(form.year),
    about_me: emptyToNull(form.aboutMe),
  };
}

/** Avatar initials: display name, else full name, else email local part. */
export function initialsFor(
  displayName: string | null | undefined,
  fullName: string | null | undefined,
  email: string | null | undefined,
): string {
  const src = (displayName ?? '').trim() || (fullName ?? '').trim();
  if (src) {
    const words = src.split(/\s+/).filter(Boolean);
    if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
    return `${words[0]![0]}${words[words.length - 1]![0]}`.toUpperCase();
  }
  const local = (email ?? '').trim().split('@')[0] ?? '';
  if (local) return local.slice(0, 2).toUpperCase();
  return '?';
}

/** Friendly name for greetings and menus; null when nothing is set. */
export function displayNameFor(
  displayName: string | null | undefined,
  fullName: string | null | undefined,
  email: string | null | undefined,
): string | null {
  const named = (displayName ?? '').trim() || (fullName ?? '').trim().split(/\s+/)[0] || '';
  if (named) return named;
  const local = (email ?? '').trim().split('@')[0] ?? '';
  return local || null;
}
