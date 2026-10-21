/**
 * Builds the rows of the day agenda (appointments + "Espacio libre" gaps) and
 * the "Próximos días" summary. Pure, so it is unit-tested.
 */
import { formatInstantTime } from '@shared/format';
import { holidayOn } from '@shared/holidays';
import { addDays, bogotaDate, minutesOf, toInstant, weekdayOf, type ISODate, type ISOInstant } from '@shared/time';
import type { Appointment, BookingRules, WeeklySchedule } from '@shared/types';

export type DayRowKind = 'confirmed' | 'new' | 'free' | 'cancelled';

export interface DayRow {
  key: string;
  kind: DayRowKind;
  start: ISOInstant;
  time: string;
  appointment?: Appointment;
  /** Free rows only. */
  freeMinutes?: number;
}

/** Gaps shorter than this are not worth showing. */
export const MIN_FREE_GAP_MIN = 30;
const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;

const ms = (iso: ISOInstant) => new Date(iso).getTime();

/** Booked by the client in the last 24 hours → "Nueva". */
export function isNewAppointment(appt: Appointment, now: Date): boolean {
  return appt.status === 'confirmed' && appt.createdBy === 'client' && now.getTime() - ms(appt.createdAt) < NEW_WINDOW_MS;
}

export const activeAppointments = (list: Appointment[]) => list.filter((a) => a.status === 'confirmed');

export function sortByStart(list: Appointment[]): Appointment[] {
  return [...list].sort((a, b) => ms(a.start) - ms(b.start));
}

function minutesOfInstant(date: ISODate, instant: ISOInstant): number {
  return Math.round((ms(instant) - ms(toInstant(date, '00:00'))) / 60_000);
}

/**
 * Free gaps between two consecutive appointments inside the same schedule
 * range, starting no earlier than now (rounded up to the slot step).
 */
export function freeGaps(
  date: ISODate,
  appointments: Appointment[],
  schedule: WeeklySchedule,
  rules: Pick<BookingRules, 'slotStepMin'>,
  now: Date,
): { start: ISOInstant; minutes: number }[] {
  const today = bogotaDate(now);
  if (date < today) return [];
  const active = sortByStart(activeAppointments(appointments));
  const cancelled = appointments.filter((a) => a.status === 'cancelled');
  const nowMin = date === today ? minutesOfInstant(date, now.toISOString()) : -1;
  const step = Math.max(5, rules.slotStepMin);
  const gaps: { start: ISOInstant; minutes: number }[] = [];

  for (const range of schedule[weekdayOf(date)] ?? []) {
    const rs = minutesOf(range.start);
    const re = minutesOf(range.end);
    const inRange = active.filter((a) => {
      const m = minutesOfInstant(date, a.start);
      return m >= rs && m < re;
    });
    for (let i = 0; i + 1 < inRange.length; i++) {
      const prevEnd = minutesOfInstant(date, inRange[i].end);
      const nextStart = minutesOfInstant(date, inRange[i + 1].start);
      const from = Math.ceil(Math.max(prevEnd, nowMin) / step) * step;
      const minutes = nextStart - from;
      if (minutes < MIN_FREE_GAP_MIN) continue;
      const gapStart = ms(toInstant(date, '00:00')) + from * 60_000;
      const gapEnd = gapStart + minutes * 60_000;
      if (cancelled.some((c) => ms(c.start) < gapEnd && ms(c.end) > gapStart)) continue;
      gaps.push({ start: new Date(gapStart).toISOString(), minutes });
    }
  }
  return gaps;
}

export function buildDayRows(
  date: ISODate,
  appointments: Appointment[],
  schedule: WeeklySchedule,
  rules: Pick<BookingRules, 'slotStepMin'>,
  now: Date,
  options: { includeFree?: boolean } = {},
): DayRow[] {
  const rows: DayRow[] = appointments.map((a) => ({
    key: a.id,
    kind: a.status === 'cancelled' ? 'cancelled' : isNewAppointment(a, now) ? 'new' : 'confirmed',
    start: a.start,
    time: formatInstantTime(a.start),
    appointment: a,
  }));
  if (options.includeFree !== false) {
    for (const gap of freeGaps(date, appointments, schedule, rules, now)) {
      rows.push({ key: `free-${gap.start}`, kind: 'free', start: gap.start, time: formatInstantTime(gap.start), freeMinutes: gap.minutes });
    }
  }
  return rows.sort((a, b) => ms(a.start) - ms(b.start) || (a.kind === 'cancelled' ? 1 : 0) - (b.kind === 'cancelled' ? 1 : 0));
}

export interface UpcomingDay {
  date: ISODate;
  /** null when the day is a (closed) holiday. */
  count: number | null;
  holidayName?: string;
}

/**
 * The next `openDays` working days after `today` with their appointment count,
 * plus the next closed holiday within `horizonDays` (as drawn in the mockup).
 */
export function upcomingDays(
  today: ISODate,
  appointments: Appointment[],
  schedule: WeeklySchedule,
  closedOnHolidays: boolean,
  openDays = 3,
  horizonDays = 30,
): UpcomingDay[] {
  const result: UpcomingDay[] = [];
  let open = 0;
  let holidayShown = false;
  const active = activeAppointments(appointments);
  for (let i = 1; i <= horizonDays; i++) {
    const date = addDays(today, i);
    const scheduled = (schedule[weekdayOf(date)] ?? []).length > 0;
    if (!scheduled) continue;
    const holiday = holidayOn(date);
    if (holiday && closedOnHolidays) {
      if (!holidayShown) {
        result.push({ date, count: null, holidayName: holiday.name });
        holidayShown = true;
      }
    } else if (open < openDays) {
      result.push({ date, count: active.filter((a) => bogotaDate(a.start) === date).length });
      open++;
    }
    if (open >= openDays && holidayShown) break;
  }
  return result;
}
