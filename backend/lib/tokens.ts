import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { SSM_PARAMS } from '../../shared/infra';
import { getParam } from './ssm';

/**
 * Signed links for the client's cancel/reschedule page (`/c/<token>`) and the
 * waitlist "leave" page (`/w/<token>`), so the client needs no account. Format: `<base64url(payload)>.<base64url(hmac)>`
 * with payload `{ p: proId, a: appointmentId, e: expiry epoch seconds }` and
 * HMAC-SHA256 under the `/links/signing-secret` SSM parameter.
 *
 * A token expires one day after the appointment ends. Because an appointment
 * can be rescheduled later than the date the link was minted for, services
 * treat a token as valid while EITHER its own expiry OR the appointment's
 * current end + 1 day is in the future (see `appointments.ts`).
 */

export interface ManageTokenPayload {
  p: string;
  a: string;
  e: number;
}

export type VerifyResult = { ok: true; payload: ManageTokenPayload; expired: boolean } | { ok: false };

const DAY_SECONDS = 86_400;

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

/** Expiry for an appointment that ends at `end`: one day later, in epoch seconds. */
export const tokenExpiryFor = (end: string): number => Math.floor(new Date(end).getTime() / 1000) + DAY_SECONDS;

/** `<base64url(json)>.<base64url(hmac)>` for any small payload. */
export function signPayload(payload: object, secret: string): string {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body, secret)}`;
}

/** Verified payload (signature checked in constant time), or null. */
export function verifyPayload(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [body, signature] = parts;
  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const signManageToken = (payload: ManageTokenPayload, secret: string): string => signPayload(payload, secret);

export function verifyManageToken(token: string, secret: string, now: Date = new Date()): VerifyResult {
  const p = verifyPayload(token, secret);
  if (!p || typeof p.p !== 'string' || typeof p.a !== 'string' || typeof p.e !== 'number') return { ok: false };
  const payload: ManageTokenPayload = { p: p.p, a: p.a, e: p.e };
  return { ok: true, payload, expired: now.getTime() / 1000 > payload.e };
}

/** Waitlist "leave" links (`/w/<token>`): `{ p: proId, w: entryId, e: expiry epoch s }`. */
export interface WaitlistTokenPayload {
  p: string;
  w: string;
  e: number;
}

export const signWaitlistToken = (payload: WaitlistTokenPayload, secret: string): string => signPayload(payload, secret);

/** Signature-checked payload (expiry is reported, not enforced: leaving stays idempotent). */
export function verifyWaitlistToken(token: string, secret: string, now: Date = new Date()): { payload: WaitlistTokenPayload; expired: boolean } | null {
  const p = verifyPayload(token, secret);
  if (!p || typeof p.p !== 'string' || typeof p.w !== 'string' || typeof p.e !== 'number') return null;
  return { payload: { p: p.p, w: p.w, e: p.e }, expired: now.getTime() / 1000 > p.e };
}

/** The signing secret from SSM (cached). */
export const linkSecret = (): Promise<string> => getParam(SSM_PARAMS.linkSigningSecret);

export async function manageTokenFor(proId: string, appointmentId: string, end: string): Promise<string> {
  return signManageToken({ p: proId, a: appointmentId, e: tokenExpiryFor(end) }, await linkSecret());
}

/** Hex SHA-256 (trial markers, anonymized rate-limit ids). */
export const sha256Hex = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/** Constant-time comparison of two hex digests (case-insensitive). */
export function hexEquals(a: string, b: string): boolean {
  const x = Buffer.from(a.toLowerCase());
  const y = Buffer.from(b.toLowerCase());
  return x.length === y.length && timingSafeEqual(x, y);
}
