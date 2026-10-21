import { formatDayShort, formatInstantTime, MONTH_SHORT } from '../../../shared/format';
import { bogotaDate, type ISODate, type ISOInstant } from '../../../shared/time';
import { sendOnce } from '../../mail/sender';
import type { AppointmentItem } from '../appointments';
import { pushToPro, type PushPayload } from '../push';
import type { WaitItem } from '../waitlist';

/**
 * Stream module: web push to the pro when the CLIENT books, moves, cancels or
 * confirms attendance, and when someone joins the waitlist. Replay-safe: one
 * conditional marker per (appointment, kind, revision) with a 2-day TTL, and
 * events older than an hour are skipped (a push about a stale change is noise).
 */

export const PUSH_MAX_AGE_MS = 60 * 60 * 1000;
const MARKER_TTL_DAYS = 2;

export type PushKind = 'booked' | 'moved' | 'cancelled' | 'confirmed';

const TITLES: Record<PushKind, string> = {
  booked: 'Nueva cita',
  moved: 'Cita movida',
  cancelled: 'Cita cancelada',
  confirmed: 'Asistencia confirmada',
};

type Image = Pick<AppointmentItem, 'status' | 'start' | 'createdBy' | 'cancelledBy' | 'lastChangedBy' | 'clientConfirmation'>;

/** Only client actions notify the pro. Pure. */
export function decidePush(before: Image | undefined, after: Image | undefined): PushKind | null {
  if (!after) return null;
  if (!before) return after.status === 'confirmed' && after.createdBy === 'client' ? 'booked' : null;
  if (before.status === 'confirmed' && after.status === 'cancelled') return (after.cancelledBy ?? after.lastChangedBy) === 'client' ? 'cancelled' : null;
  if (before.status === 'confirmed' && after.status === 'confirmed' && before.start !== after.start) {
    return after.lastChangedBy === 'client' ? 'moved' : null;
  }
  if (after.status === 'confirmed' && before.clientConfirmation !== 'confirmed' && after.clientConfirmation === 'confirmed') return 'confirmed';
  return null;
}

/** "Jue 22 oct" */
export function shortDay(date: ISODate): string {
  return `${formatDayShort(date)} ${MONTH_SHORT[Number(date.slice(5, 7)) - 1].replace('.', '')}`;
}

/** "Jue 22 oct · 10:00 a. m." */
export const shortWhen = (instant: ISOInstant) => `${shortDay(bogotaDate(instant))} · ${formatInstantTime(instant)}`;

export function appointmentPayload(kind: PushKind, appt: AppointmentItem): PushPayload {
  return {
    title: TITLES[kind],
    body: `${shortWhen(appt.start)} · ${appt.client.name} · ${appt.serviceName}`,
    url: '/app/',
    tag: appt.id,
  };
}

const isStale = (eventAt: Date, now: Date) => now.getTime() - eventAt.getTime() > PUSH_MAX_AGE_MS;

export async function pushOnAppointment(before: AppointmentItem | undefined, after: AppointmentItem | undefined, eventAt: Date, now: Date): Promise<void> {
  const kind = decidePush(before, after);
  if (!kind || !after || isStale(eventAt, now)) return;
  await sendOnce(`push#${after.id}#${kind}#${after.revision ?? 0}`, () => pushToPro(after.proId, appointmentPayload(kind, after), now), now, MARKER_TTL_DAYS);
}

export async function pushOnWaitlistJoin(entry: WaitItem, eventAt: Date, now: Date): Promise<void> {
  if (entry.status !== 'waiting' || isStale(eventAt, now)) return;
  const payload: PushPayload = {
    title: 'Lista de espera',
    body: `${entry.client.name} · ${entry.serviceName} · ${entry.dates.map(shortDay).join(', ')}`,
    url: '/app/',
    tag: `wait-${entry.id}`,
  };
  await sendOnce(`push#wait#${entry.id}`, () => pushToPro(entry.proId, payload, now), now, MARKER_TTL_DAYS);
}

