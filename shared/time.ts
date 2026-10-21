/**
 * Calendar math in Colombia's time zone. Colombia is UTC-5 all year (no DST),
 * so a fixed offset is exact and we avoid shipping Intl time-zone data to the
 * booking page. Instants are stored as UTC ISO strings; "dates" (YYYY-MM-DD)
 * and "times" (HH:mm) are always Bogotá wall-clock values.
 */

export const TIMEZONE = 'America/Bogota';
const OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Bogotá calendar day, `YYYY-MM-DD`. */
export type ISODate = string;
/** Bogotá wall-clock time, `HH:mm` (24 h). */
export type HHmm = string;
/** UTC instant, full ISO string (`2026-10-22T15:00:00.000Z`). */
export type ISOInstant = string;

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const pad = (n: number) => String(n).padStart(2, '0');

function toDate(instant: Date | string): Date {
  return typeof instant === 'string' ? new Date(instant) : instant;
}

/** Shifts an instant so its UTC fields read as Bogotá wall-clock fields. */
function bogotaFields(instant: Date | string): Date {
  return new Date(toDate(instant).getTime() - OFFSET_MS);
}

export function bogotaDate(instant: Date | string): ISODate {
  const d = bogotaFields(instant);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function bogotaTime(instant: Date | string): HHmm {
  const d = bogotaFields(instant);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function todayBogota(now: Date = new Date()): ISODate {
  return bogotaDate(now);
}

/** UTC instant for a Bogotá date + wall-clock time. */
export function toInstant(date: ISODate, time: HHmm): ISOInstant {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm) + OFFSET_MS).toISOString();
}

/** Midnight in Bogotá as a JS Date whose UTC fields are that calendar day (for date-only math). */
function dateOnly(date: ISODate): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = new Date(dateOnly(date).getTime() + days * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Whole days from `a` to `b` (b − a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((dateOnly(b).getTime() - dateOnly(a).getTime()) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday (JS convention), for a Bogotá date. */
export function jsWeekday(date: ISODate): number {
  return dateOnly(date).getUTCDay();
}

export function weekdayOf(date: ISODate): Weekday {
  return WEEKDAYS[(jsWeekday(date) + 6) % 7];
}

export function minutesOf(time: HHmm): number {
  const [hh, mm] = time.split(':').map(Number);
  return hh * 60 + mm;
}

export function hhmm(minutes: number): HHmm {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

export function addMinutes(instant: ISOInstant, minutes: number): ISOInstant {
  return new Date(toDate(instant).getTime() + minutes * 60_000).toISOString();
}

/**
 * Adds calendar months to an instant, clamping the day (Jan 31 + 1 month →
 * Feb 28/29) so a paid period never skips past the end of the target month.
 */
export function addMonths(instant: ISOInstant, months: number): ISOInstant {
  const d = toDate(instant);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1,
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString();
}

export function maxInstant(...values: (ISOInstant | null | undefined)[]): ISOInstant | null {
  let best: ISOInstant | null = null;
  for (const v of values) {
    if (v && (best === null || new Date(v).getTime() > new Date(best).getTime())) best = v;
  }
  return best;
}
