/**
 * Client identity per professional. The same person booking twice (with the
 * same phone, or the same email when there's no phone) maps to one
 * ClientRecord. Phone first: it is required on public bookings while the
 * email is optional, so a client who books once with email and once without
 * stays one record. An appointment the pro created with a name only (no email, no
 * phone) has no key and no record: names are never used as identity, or
 * different people with the same name would be merged. Server-side only (uses node:crypto) — the booking bundle must
 * not import this file.
 */
import { createHash } from 'node:crypto';
import { normalizeEmail, normalizePhone } from './contact';
import type { ClientContact } from './types';

const KEY_LENGTH = 24;

const hash = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, KEY_LENGTH);

/** `clientKey` of an appointment without email or phone: it belongs to no ClientRecord. */
export const NO_CLIENT_KEY = '';

/** Stable key: hash of the phone, or of the normalized email when there's no phone; NO_CLIENT_KEY without both. */
export function clientKeyOf(client: Pick<ClientContact, 'email' | 'phone'>): string {
  const phone = normalizePhone(client.phone ?? '');
  if (phone) return hash(`tel:${phone}`);
  const email = normalizeEmail(client.email ?? '');
  return email ? hash(email) : NO_CLIENT_KEY;
}
