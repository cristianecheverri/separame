import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { SSM_PARAMS } from '../../shared/infra';
import { getParam } from './ssm';

/**
 * Signed links for the client's cancel/reschedule page (`/c/<token>`), so the
 * client needs no account. Format: `<base64url(payload)>.<base64url(hmac)>`
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

export function signManageToken(payload: ManageTokenPayload, secret: string): string {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body, secret)}`;
}

export function verifyManageToken(token: string, secret: string, now: Date = new Date()): VerifyResult {
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false };
  const [body, signature] = parts;
  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false };
  let payload: ManageTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ManageTokenPayload;
  } catch {
    return { ok: false };
  }
  if (typeof payload?.p !== 'string' || typeof payload.a !== 'string' || typeof payload.e !== 'number') return { ok: false };
  return { ok: true, payload, expired: now.getTime() / 1000 > payload.e };
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
