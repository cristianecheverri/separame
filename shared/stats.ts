/**
 * Statistics derived the same way by the API and the panel's mock: what
 * Sepárame did for the pro («Lo que Sepárame hizo por ti»), late
 * cancellations, the busiest start hours and how far ahead clients book.
 * Pure; everything comes from the appointments of the range.
 */
import { bogotaDate, bogotaTime, diffDays } from './time';
import type { Appointment, ProStats } from './types';

/** ≈ minutes one booking made from the public link saves (agreeing on it by chat or phone). Shown as an estimate. */
export const MINUTES_SAVED_PER_ONLINE_BOOKING = 5;
/** A cancellation this close to the start counts as late. */
export const LATE_CANCEL_HOURS = 24;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export type StatsAppointment = Pick<
  Appointment, 'status' | 'start' | 'createdAt' | 'createdBy' | 'updatedAt' | 'clientConfirmation' | 'reminderSentAt' | 'fromWaitlist' | 'cancelledBy'
>;

const ratio = (a: number, b: number) => (b > 0 ? Math.min(1, Math.max(0, a / b)) : 0);
const ms = (iso: string) => new Date(iso).getTime();

export type DerivedStats = Pick<ProStats, 'value' | 'cancelledLate' | 'byHour' | 'avgLeadDays' | 'shortLeadShare'>;

/** `inRange`: every appointment (any status) whose Bogotá start date is in the period. */
export function derivedStats(inRange: StatsAppointment[]): DerivedStats {
  const active = inRange.filter((a) => a.status === 'confirmed');
  const online = active.filter((a) => a.createdBy === 'client');
  const reminded = active.filter((a) => a.reminderSentAt);

  const hours = new Map<number, number>();
  for (const a of active) {
    const hour = Number(bogotaTime(a.start).slice(0, 2));
    hours.set(hour, (hours.get(hour) ?? 0) + 1);
  }

  const leads = online.map((a) => Math.max(0, ms(a.start) - ms(a.createdAt)) / DAY_MS);
  const shortLead = online.filter((a) => diffDays(bogotaDate(a.createdAt), bogotaDate(a.start)) <= 1).length;

  return {
    value: {
      online: online.length,
      onlineShare: ratio(online.length, active.length),
      savedMinutes: online.length * MINUTES_SAVED_PER_ONLINE_BOOKING,
      remindersSent: inRange.filter((a) => a.reminderSentAt).length,
      confirmationRate: ratio(reminded.filter((a) => a.clientConfirmation === 'confirmed').length, reminded.length),
      recovered: active.filter((a) => a.fromWaitlist).length,
    },
    // Cancelled less than 24 h before the start (the cancel is the item's last change).
    cancelledLate: inRange.filter((a) => a.status === 'cancelled' && ms(a.start) - ms(a.updatedAt) < LATE_CANCEL_HOURS * HOUR_MS).length,
    byHour: [...hours.entries()].sort((a, b) => a[0] - b[0]).map(([hour, appointments]) => ({ hour, appointments })),
    avgLeadDays: leads.length ? Math.round((leads.reduce((sum, d) => sum + d, 0) / leads.length) * 10) / 10 : null,
    shortLeadShare: ratio(shortLead, online.length),
  };
}
