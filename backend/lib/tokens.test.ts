import { describe, expect, it } from 'vitest';
import { hexEquals, sha256Hex, signManageToken, tokenExpiryFor, verifyManageToken } from './tokens';

const SECRET = 'test-secret';

describe('manage tokens', () => {
  const end = '2026-10-22T15:30:00.000Z';
  const token = signManageToken({ p: 'pro1', a: 'appt1', e: tokenExpiryFor(end) }, SECRET);

  it('round-trips a valid token', () => {
    const result = verifyManageToken(token, SECRET, new Date('2026-10-20T12:00:00Z'));
    expect(result).toEqual({ ok: true, expired: false, payload: { p: 'pro1', a: 'appt1', e: tokenExpiryFor(end) } });
  });

  it('expires one day after the appointment ends', () => {
    expect(verifyManageToken(token, SECRET, new Date('2026-10-23T15:29:00Z'))).toMatchObject({ ok: true, expired: false });
    expect(verifyManageToken(token, SECRET, new Date('2026-10-23T15:31:00Z'))).toMatchObject({ ok: true, expired: true });
  });

  it('rejects tampered payloads, signatures and other secrets', () => {
    const [body, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ p: 'pro1', a: 'other', e: 9_999_999_999 })).toString('base64url');
    expect(verifyManageToken(`${forged}.${sig}`, SECRET)).toEqual({ ok: false });
    expect(verifyManageToken(`${body}.${sig.slice(0, -2)}xx`, SECRET)).toEqual({ ok: false });
    expect(verifyManageToken(token, 'another-secret')).toEqual({ ok: false });
    expect(verifyManageToken('garbage', SECRET)).toEqual({ ok: false });
  });
});

describe('hex helpers', () => {
  it('hashes and compares case-insensitively', () => {
    const h = sha256Hex('abc');
    expect(h).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hexEquals(h, h.toUpperCase())).toBe(true);
    expect(hexEquals(h, h.slice(1))).toBe(false);
  });
});
