import { bogotaDate } from '../../../shared/time';
import { revisionOf, type AppointmentItem } from '../appointments';
import { getProfile } from '../profiles';
import { markBookedFor, offerFreedDate, onWaitlistJoined, type WaitItem } from '../waitlist';

/**
 * Stream module for the waitlist:
 *  - a booking (or a move) onto a day a client is waiting for marks their entry `booked`;
 *  - a cancellation or a move away from a day offers that day to waiting entries
 *    (idempotent per entry/day/`<apptId>#<revision>` marker);
 *  - a new WAIT item sends the "Te avisaremos…" email (marker per entry).
 */
export async function waitlistOnAppointment(before: AppointmentItem | undefined, after: AppointmentItem | undefined, now: Date): Promise<void> {
  if (!after) return;
  const moved = before?.status === 'confirmed' && after.status === 'confirmed' && before.start !== after.start;
  if (after.status === 'confirmed' && (!before || moved)) await markBookedFor(after, bogotaDate(after.start));

  const freed = before?.status === 'confirmed' && (after.status === 'cancelled' || moved);
  if (!freed || !before) return;
  const pro = await getProfile(after.proId);
  if (!pro) return;
  await offerFreedDate(pro, bogotaDate(before.start), `${after.id}#${revisionOf(after)}`, now);
}

export async function waitlistOnJoin(entry: WaitItem, now: Date): Promise<void> {
  const pro = await getProfile(entry.proId);
  if (pro) await onWaitlistJoined(entry, pro, now);
}
