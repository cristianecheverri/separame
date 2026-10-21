import type { ProProfile } from '../../shared/types';
import { log } from '../lib/logger';
import {
  sendClientCancelled, sendClientChanged, sendClientConfirmation, sendProCalendarNotice, sendProCancelled, sendProChanged,
  sendProNewBooking,
} from '../mail/notifications';
import { sendOnce, type CalendarInvite } from '../mail/sender';
import type { ProCalendarKind } from '../mail/templates/pro-calendar';
import { revisionOf, toAppointment, type AppointmentItem } from './appointments';
import { buildInvite, invitesEnabledFor } from './calendar-sync';
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
 *
 * Plus a calendar invitation for the pro (same UID, SEQUENCE = revision) on
 * every change when invitations are on: REQUEST for new/moved, CANCEL for
 * cancelled. It rides on the pro's email when there is one; when the pro
 * made the change himself it goes in a short "own action" email,
 * idempotent per (appointment, revision).
 */

export type EmailKind =
  | 'client-confirmed' | 'pro-new-booking' | 'client-changed' | 'pro-changed' | 'client-cancelled' | 'pro-cancelled'
  /** Standalone invitation carrier (the pro made the change). */
  | 'pro-calendar';

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

export type InviteDecision = { method: 'REQUEST' | 'CANCEL'; standalone: ProCalendarKind };

/** Which invitation (if any) a change produces for the pro's calendar. Pure. */
export function decideInvite(before: ApptImage | undefined, after: ApptImage | undefined): InviteDecision | null {
  if (!after) return null;
  if (!before) return after.status === 'confirmed' ? { method: 'REQUEST', standalone: 'added' } : null;
  if (before.status === 'confirmed' && after.status === 'cancelled') return { method: 'CANCEL', standalone: 'removed' };
  if (before.status === 'confirmed' && after.status === 'confirmed' && before.start !== after.start) {
    return { method: 'REQUEST', standalone: 'updated' };
  }
  return null;
}

async function send(
  kind: Exclude<EmailKind, 'pro-calendar'>, before: AppointmentItem | undefined, after: AppointmentItem, pro: ProProfile, now: Date,
  invite?: CalendarInvite,
) {
  const appt = toAppointment(after);
  switch (kind) {
    case 'client-confirmed': return sendClientConfirmation(appt, pro, now);
    case 'pro-new-booking': return sendProNewBooking(appt, pro, invite);
    case 'client-changed': return sendClientChanged(appt, before?.start ?? appt.start, pro, now);
    case 'pro-changed': return sendProChanged(appt, before?.start ?? appt.start, pro, invite);
    case 'client-cancelled': return sendClientCancelled(appt, pro);
    case 'pro-cancelled': return sendProCancelled(appt, pro, invite);
  }
}

const PRO_KINDS = new Set<EmailKind>(['pro-new-booking', 'pro-changed', 'pro-cancelled']);

/** Sends every email the change calls for. Throws on failure (the record is retried). */
export async function processAppointmentChange(before: AppointmentItem | undefined, after: AppointmentItem | undefined, now: Date = new Date()): Promise<EmailKind[]> {
  const kinds = decideEmails(before, after);
  const inviteDecision = decideInvite(before, after);
  if (!after || (kinds.length === 0 && !inviteDecision)) return [];
  const pro = await getProfile(after.proId);
  if (!pro) {
    log.warn('appointment email: profile missing', { proId: after.proId, appointmentId: after.id });
    return [];
  }
  const invite: CalendarInvite | undefined = inviteDecision && pro.email && (await invitesEnabledFor(pro.id))
    ? { method: inviteDecision.method, content: buildInvite(after, pro, inviteDecision.method, now) }
    : undefined;

  const sent: EmailKind[] = [];
  for (const kind of kinds) {
    if (kind === 'pro-calendar') continue;
    const attach = PRO_KINDS.has(kind) ? invite : undefined;
    const fresh = await sendOnce(`${after.id}#${kind}#${after.updatedAt}`, () => send(kind, before, after, pro, now, attach), now);
    if (fresh) sent.push(kind);
  }
  if (invite && inviteDecision && !kinds.some((k) => PRO_KINDS.has(k))) {
    const fresh = await sendOnce(
      `${after.id}#invite#${revisionOf(after)}`,
      () => sendProCalendarNotice(toAppointment(after), pro, inviteDecision.standalone, invite),
      now,
    );
    if (fresh) sent.push('pro-calendar');
  }
  log.info('appointment emails', { proId: after.proId, appointmentId: after.id, kinds: sent, invite: invite?.method ?? null });
  return sent;
}
