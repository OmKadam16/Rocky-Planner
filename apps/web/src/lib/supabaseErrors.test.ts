import { describe, expect, it } from 'vitest';
import { mapDbErrcode, mapPairFailure, PairError } from './supabase';

describe('mapDbErrcode (Postgres codes, never message sniffing)', () => {
  it('maps claim_pair raise codes', () => {
    expect(mapDbErrcode('P0001')).toBe('expired');
    expect(mapDbErrcode('P0002')).toBe('wrong');
    expect(mapDbErrcode('28000')).toBe('not-signed-in');
  });

  it('maps session/permission failures to not-signed-in', () => {
    expect(mapDbErrcode('42501')).toBe('not-signed-in');
    expect(mapDbErrcode('401')).toBe('not-signed-in');
  });

  it('returns null for anything else (caller builds unknown)', () => {
    expect(mapDbErrcode('PGRST301')).toBeNull();
    expect(mapDbErrcode('500')).toBeNull();
    expect(mapDbErrcode(null)).toBeNull();
    expect(mapDbErrcode(undefined)).toBeNull();
    expect(mapDbErrcode('')).toBeNull();
  });
});

describe('mapPairFailure', () => {
  it('preserves the real server message on every kind', () => {
    const expired = mapPairFailure({ code: 'P0001', message: 'That pairing code has expired' });
    expect(expired).toBeInstanceOf(PairError);
    expect(expired.kind).toBe('expired');
    expect(expired.message).toBe('That pairing code has expired');

    const wrong = mapPairFailure({ code: 'P0002', message: 'That code is not active for this account' });
    expect(wrong.kind).toBe('wrong');
    expect(wrong.message).toBe('That code is not active for this account');

    const auth = mapPairFailure({ code: '28000', message: 'Sign in first: no account on this request' });
    expect(auth.kind).toBe('not-signed-in');
    expect(auth.message).toBe('Sign in first: no account on this request');
  });

  it('never maps an unrecognized error to laptop offline', () => {
    // There is no 'offline' kind at all: offline is decided only from
    // devices.last_seen, never from an error payload.
    const kinds = ['PGRST116', '500', null, undefined].map(
      (code) => mapPairFailure({ code, message: 'weird relay response' }).kind,
    );
    for (const kind of kinds) {
      expect(kind).toBe('unknown');
      expect(kind).not.toBe('offline');
    }
    const failure = mapPairFailure({ code: 'XX000', message: 'internal error detail here' });
    expect(failure.kind).toBe('unknown');
    expect(failure.message).toBe('internal error detail here');
  });
});
