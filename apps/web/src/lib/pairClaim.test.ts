import { describe, expect, it } from 'vitest';
import { detectPairClaim, type ClaimDeviceSnapshot } from './pairClaim';

const CREATED = 1_700_000_000_000;

function laptopRow(over: Partial<ClaimDeviceSnapshot> = {}): ClaimDeviceSnapshot {
  return {
    pair_code: 'K7P2QM',
    name: 'My laptop',
    last_seen: new Date(CREATED).toISOString(),
    created_at: new Date(CREATED - 60_000).toISOString(),
    ...over,
  };
}

function phoneRow(over: Partial<ClaimDeviceSnapshot> = {}): ClaimDeviceSnapshot {
  return {
    pair_code: null,
    name: 'My phone',
    // Defaults describe a phone paired long ago (stale): freshness tests
    // override last_seen/created_at with post-createdAt timestamps.
    last_seen: new Date(CREATED - 120_000).toISOString(),
    created_at: new Date(CREATED - 3_600_000).toISOString(),
    ...over,
  };
}

const OPTS = { publishedCode: 'K7P2QM', published: true, createdAtMs: CREATED };

describe('detectPairClaim (rows -> claimed status)', () => {
  it('claims when the laptop pair_code was cleared (single use) while our code was published', () => {
    const res = detectPairClaim(
      laptopRow({ pair_code: null }),
      phoneRow({ name: 'Pixel 8', last_seen: new Date(CREATED + 1_000).toISOString() }),
      OPTS,
    );
    expect(res.claimed).toBe(true);
    expect(res.phoneName).toBe('Pixel 8');
  });

  it('does not claim while the published code is still on the laptop row', () => {
    const res = detectPairClaim(
      laptopRow({ pair_code: 'K7P2QM' }),
      phoneRow({ last_seen: new Date(CREATED - 120_000).toISOString() }),
      OPTS,
    );
    expect(res.claimed).toBe(false);
    expect(res.phoneName).toBe('My phone');
  });

  it('never claims when the current code was not published (fresh account / failed publish)', () => {
    const unpublished = { ...OPTS, published: false };
    expect(
      detectPairClaim(laptopRow({ pair_code: null }), phoneRow(), unpublished).claimed,
    ).toBe(false);
    const noCode = { ...OPTS, publishedCode: '' };
    expect(
      detectPairClaim(laptopRow({ pair_code: null }), phoneRow(), noCode).claimed,
    ).toBe(false);
  });

  it('claims via a fresh phone row even if the laptop row still shows the code', () => {
    const res = detectPairClaim(
      laptopRow({ pair_code: 'K7P2QM' }),
      phoneRow({ last_seen: new Date(CREATED + 5_000).toISOString() }),
      OPTS,
    );
    expect(res.claimed).toBe(true);
  });

  it('ignores a stale phone row paired long before this code', () => {
    const res = detectPairClaim(
      laptopRow({ pair_code: 'K7P2QM' }),
      phoneRow({
        last_seen: new Date(CREATED - 60_000).toISOString(),
        created_at: new Date(CREATED - 3600_000).toISOString(),
      }),
      OPTS,
    );
    expect(res.claimed).toBe(false);
  });

  it('falls back to phone created_at when last_seen is missing', () => {
    const res = detectPairClaim(
      laptopRow({ pair_code: 'K7P2QM' }),
      phoneRow({ last_seen: null, created_at: new Date(CREATED + 2_000).toISOString() }),
      OPTS,
    );
    expect(res.claimed).toBe(true);
  });

  it('claims on laptop clear even with no phone row yet (read raced the insert)', () => {
    const res = detectPairClaim(laptopRow({ pair_code: null }), null, OPTS);
    expect(res.claimed).toBe(true);
    expect(res.phoneName).toBeNull();
  });

  it('returns false with no rows and passes the phone name through', () => {
    const res = detectPairClaim(null, null, OPTS);
    expect(res).toEqual({ claimed: false, phoneName: null });
  });

  it('treats blank phone names as null and tolerates bad dates', () => {
    const res = detectPairClaim(
      laptopRow({ pair_code: 'K7P2QM' }),
      phoneRow({ name: '   ', last_seen: 'not-a-date', created_at: 'also-bad' }),
      OPTS,
    );
    expect(res.claimed).toBe(false);
    expect(res.phoneName).toBeNull();
  });
});
