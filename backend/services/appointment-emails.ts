import type { ProProfile } from '../../shared/types';
import { log } from '../lib/logger';
import {
  sendClientCancelled, sendClientChanged, sendClientConfirmation, sendProCancelled, sendProChanged, sendProNewBooking,
} from '../mail/notifications';
import { sendOnce } from '../mail/sender';
import { toAppointment, type AppointmentItem } from './appointments';
import { getProfile } from './profiles';

/**
 * What the DynamoDB stream should email for an appointment change. Pure
 * decision (`decideEmails`) + execution with one idempotency marker per
 * (appointment, kind, updatedAt), so stream retries never double-send.
 *
 *  INSERT confirmed            → client confirmation (+ .ics) and, when the
 *                                client booked, "Nueva cita" to the pro
 *  start changed (confirmed)   → "Tu cita cambió" to the client (+ .ics) and a
 *                                notice to the pro unless the pro moved it
 *  confirmed → cancelled       → the other party (by client → pro; by pro →
 *                                client; by admin/system → both)
 */

export type EmailKind = 'client-confirmed' | 'pro-new-booking' | 'client-changed' | 'pro-changed' | 'client-cancelled' | 'pro-cancelled';

type ApptImage = Pick<AppointmentItem, 'status' | 'start' | 'client' | 'createdBy' | 'cancelledBy' | 'lastChangedBy'>;

export function decideEmails(before: ApptImage | undefined, after: ApptImage | undefined): EmailKind[] {
  if (!after) return [];
  const hasClientEmail = !!after.client?.email;
  const kinds: EmailKind[] = [];

  if (!before) {
    if (after.status !== 'confirmed') return [];
    if (hasClientEmail) kinds.push('client-confirmed');
    if (after.createdBy !== 'pro') kinds.push('pro-new-booking');
    return kinds;
  }

  if (before.status === 'confirmed' && after.status === 'cancelled') {
    const by = after.cancelledBy ?? after.lastChangedBy;
    if (by !== 'client' && hasClientEmail) kinds.push('client-cancelled');
    if (by !== 'pro') kinds.push('pro-cancelled');
    return kinds;
  }

  if (before.status === 'confirmed' && after.status === 'confirmed' && before.start !== after.start) {
    if (hasClientEmail) kinds.push('client-changed');
    if (after.lastChangedBy !== 'pro') kinds.push('pro-changed');
  }
  return kinds;
}

async function send(kind: EmailKind, before: AppointmentItem | undefined, after: AppointmentItem, pro: ProProfile, now: Date) {
  const appt = toAppointment(after);
  switch (kind) {
    case 'client-confirmed': return sendClientConfirmation(appt, pro, now);
    case 'pro-new-booking': return sendProNewBooking(appt, pro);
    case 'client-changed': return sendClientChanged(appt, before?.start ?? appt.start, pro, now);
    case 'pro-changed': return sendProChanged(appt, before?.start ?? appt.start, pro);
    case 'client-cancelled': return sendClientCancelled(appt, pro);
    case 'pro-cancelled': return sendProCancelled(appt, pro);
  }
}

/** Sends every email the change calls for. Throws on failure (the record is retried). */
export async function processAppointmentChange(before: AppointmentItem | undefined, after: AppointmentItem | undefined, now: Date = new Date()): Promise<EmailKind[]> {
  const kinds = decideEmails(before, after);
  if (!after || kinds.length === 0) return [];
  const pro = await getProfile(after.proId);
  if (!pro) {
    log.warn('appointment email: profile missing', { proId: after.proId, appointmentId: after.id });
    return [];
  }
  const sent: EmailKind[] = [];
  for (const kind of kinds) {
    const fresh = await sendOnce(`${after.id}#${kind}#${after.updatedAt}`, () => send(kind, before, after, pro, now), now);
    if (fresh) sent.push(kind);
  }
  log.info('appointment emails', { proId: after.proId, appointmentId: after.id, kinds: sent });
  return sent;
}
