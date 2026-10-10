import { describe, expect, it } from 'vitest';
import {
  EMPTY_PROFILE_FORM,
  displayNameFor,
  initialsFor,
  profileFormToRow,
} from './profile';

describe('profileFormToRow (form state -> profiles row)', () => {
  it('trims fields and maps blanks to null', () => {
    const row = profileFormToRow(
      {
        ...EMPTY_PROFILE_FORM,
        fullName: '  Ada Lovelace  ',
        displayName: '',
        school: '   ',
        program: 'CS',
        year: 'Sophomore',
        aboutMe: '\n',
      },
      'user-1',
    );
    expect(row).toEqual({
      user_id: 'user-1',
      full_name: 'Ada Lovelace',
      display_name: null,
      school: null,
      program: 'CS',
      year: 'Sophomore',
      about_me: null,
    });
  });

  it('never writes empty strings', () => {
    const row = profileFormToRow(EMPTY_PROFILE_FORM, 'user-1');
    for (const [key, value] of Object.entries(row)) {
      if (key === 'user_id') continue;
      expect(value).toBeNull();
    }
  });
});

describe('initialsFor (avatar)', () => {
  it('uses the display name first, then the full name', () => {
    expect(initialsFor('Ada', 'Ada Lovelace', 'ada@school.edu')).toBe('AD');
    expect(initialsFor('', 'Ada Lovelace', 'ada@school.edu')).toBe('AL');
    expect(initialsFor('  ', '  ada  ', 'x@y.z')).toBe('AD');
  });

  it('falls back to the email local part, then ?', () => {
    expect(initialsFor(null, null, 'oma@school.edu')).toBe('OM');
    expect(initialsFor(null, null, null)).toBe('?');
    expect(initialsFor('', ' ', ' ')).toBe('?');
  });
});

describe('displayNameFor (greetings and menus)', () => {
  it('prefers the display name, then the first name, then the email', () => {
    expect(displayNameFor('Addy', 'Ada Lovelace', 'ada@school.edu')).toBe('Addy');
    expect(displayNameFor('', 'Ada Lovelace', 'ada@school.edu')).toBe('Ada');
    expect(displayNameFor(null, null, 'oma@school.edu')).toBe('oma');
    expect(displayNameFor(null, null, null)).toBeNull();
  });
});
