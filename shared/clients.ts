/**
 * Client identity per professional. The same person booking twice (with the
 * same email, or the same phone when there's no email) maps to one
 * ClientRecord. Server-side only (uses node:crypto) — the booking bundle must
 * not import this file.
 */
import { createHash } from 'node:crypto';
import { normalizeEmail, normalizePhone } from './contact';
import type { ClientContact } from './types';

const KEY_LENGTH = 24;

const hash = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, KEY_LENGTH);

/** Stable key: hash of the normalized email, or of the phone when the email is empty. */
export function clientKeyOf(client: Pick<ClientContact, 'email' | 'phone'>): string {
  const email = normalizeEmail(client.email ?? '');
  if (email) return hash(email);
  return hash(`tel:${normalizePhone(client.phone ?? '')}`);
}
