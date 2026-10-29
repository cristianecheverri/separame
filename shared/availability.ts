/**
 * Slot computation — the single implementation used by the API (to offer and
 * to validate a booking) and by the frontends (to preview). Pure and
 * deterministic: everything time-dependent comes in through `now`.
 *
 * Conflict rule: a candidate [s, s+d) is free when it stays `bufferMin` away
 * from every confirmed appointment (and live hold) and doesn't overlap any block.
 *
 * Candidates are the `slotStepMin` grid plus, around each busy interval, the
 * start right after its buffer and the last start that ends a buffer before it.
 * Without them a 10-minute buffer on a 30-minute grid would hide the grid slot
 * before and after every appointment (10:00–10:30 booked → 9:30 and 10:30
 * gone); with them the day offers 9:20 and 10:40 instead.
 *
 * Double-booking is prevented at write time with lock items on a 5-minute grid
 * (see `lockUnits`): each appointment locks [start, end + buffer). Two bookings
 * closer than the buffer always share at least one unit, so the second
 * conditional write fails inside the DynamoDB transaction.
 */
import { holidayOn } from './holidays';
import {
  addDays, addMinutes, bogotaDate, diffDays, hhmm, minutesOf, toInstant, todayBogota, weekdayOf,
  type ISODate, type ISOInstant, type Weekday,
} from './time';
import type { BookingRules, TimeRange, WeeklySchedule } from './types';

export const LOCK_UNIT_MIN = 5;
/**
 * Without minimum notice (the pro's own bookings, or a pro who set it to 0), an
 * hour that just started can still be booked this many minutes after its start.
 */
export const STARTED_SLOT_GRACE_MIN = 5;
const LOCK_UNIT_MS = LOCK_UNIT_MIN * 60_000;

export interface Interval {
  start: ISOInstant;
  end: ISOInstant;
}

export type ClosedReason = 'past' | 'weekly' | 'holiday' | 'out_of_window' | 'blocked';

export interface DayAvailability {
  date: ISODate;
  weekday: Weekday;
  /** Why the whole day is closed; `null` when open (even if every slot is taken). */
  closed: ClosedReason | null;
  holidayName?: string;
  /** Bookable start instants, ascending. */
  slots: ISOInstant[];
}

export interface AvailabilityContext {
  schedule: WeeklySchedule;
  rules: BookingRules;
  /** Blocked periods (vacations, congress…). */
  blocks: Interval[];
  /** Confirmed appointments (cancelled ones must be excluded by the caller). */
  busy: Interval[];
  durationMin: number;
  now: Date;
}

/**
 * No margin between appointments by default (owner's decision, 29-oct-2026): a 30-minute
 * agenda books back to back. A pro can still choose one in Disponibilidad.
 */
export const DEFAULT_RULES: BookingRules = {
  bufferMin: 0,
  minNoticeMin: 120,
  maxDaysAhead: 60,
  slotStepMin: 30,
  closedOnHolidays: true,
};

const WEEKDAY_RANGES: TimeRange[] = [
  { start: '08:00', end: '12:00' },
  { start: '14:00', end: '18:00' },
];

export const DEFAULT_SCHEDULE: WeeklySchedule = {
  mon: WEEKDAY_RANGES,
  tue: WEEKDAY_RANGES,
  wed: WEEKDAY_RANGES,
  thu: WEEKDAY_RANGES,
  fri: WEEKDAY_RANGES,
  sat: [{ start: '08:00', end: '12:00' }],
  sun: [],
};

const ms = (iso: ISOInstant) => new Date(iso).getTime();

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function computeDay(date: ISODate, ctx: AvailabilityContext): DayAvailability {
  const weekday = weekdayOf(date);
  const base = { date, weekday, slots: [] as ISOInstant[] };
  const today = todayBogota(ctx.now);
  const ahead = diffDays(today, date);

  if (ahead < 0) return { ...base, closed: 'past' };
  if (ahead > ctx.rules.maxDaysAhead) return { ...base, closed: 'out_of_window' };

  const holiday = holidayOn(date);
  if (holiday && ctx.rules.closedOnHolidays) return { ...base, closed: 'holiday', holidayName: holiday.name };

  const ranges = ctx.schedule[weekday] ?? [];
  if (ranges.length === 0) return { ...base, closed: 'weekly' };

  const dayBlocks = ctx.blocks.map((b) => [ms(b.start), ms(b.end)] as const);
  const fullyBlocked = ranges.every((r) => {
    const rs = ms(toInstant(date, r.start));
    const re = ms(toInstant(date, r.end));
    return dayBlocks.some(([bs, be]) => bs <= rs && be >= re);
  });
  if (fullyBlocked) return { ...base, closed: 'blocked', ...(holiday ? { holidayName: holiday.name } : {}) };

  const earliest = ctx.rules.minNoticeMin > 0
    ? ctx.now.getTime() + ctx.rules.minNoticeMin * 60_000
    : ctx.now.getTime() - STARTED_SLOT_GRACE_MIN * 60_000;
  const buffer = ctx.rules.bufferMin * 60_000;
  const duration = ctx.durationMin * 60_000;
  const busy = ctx.busy.map((b) => [ms(b.start), ms(b.end)] as const);
  const step = Math.max(LOCK_UNIT_MIN, ctx.rules.slotStepMin);

  const slots: ISOInstant[] = [];
  // A day whose remaining starts are all inside the notice window is over for
  // booking ("past"), not full: it must not offer the waitlist.
  let anyUpcoming = false;
  for (const range of ranges) {
    const rangeStart = ms(toInstant(date, range.start));
    const rangeEnd = ms(toInstant(date, range.end));
    const grid: number[] = [];
    for (let m = minutesOf(range.start); m + ctx.durationMin <= minutesOf(range.end); m += step) grid.push(ms(toInstant(date, hhmm(m))));
    if (grid.some((s) => s >= earliest)) anyUpcoming = true;
    const anchors = busy.flatMap(([bs, be]) => [be + buffer, bs - buffer - duration])
      .filter((s) => s >= rangeStart && s + duration <= rangeEnd && s % LOCK_UNIT_MS === 0);
    for (const s of [...new Set([...grid, ...anchors])].sort((a, b) => a - b)) {
      const e = s + duration;
      if (s < earliest) continue;
      if (busy.some(([bs, be]) => overlaps(s, e, bs - buffer, be + buffer))) continue;
      if (dayBlocks.some(([bs, be]) => overlaps(s, e, bs, be))) continue;
      slots.push(new Date(s).toISOString());
    }
  }
  if (!anyUpcoming) return { ...base, closed: 'past' };
  return { ...base, closed: null, ...(holiday ? { holidayName: holiday.name } : {}), slots };
}

/**
 * Minutes the professional is open on a day (weekly ranges minus blocks; 0 on
 * closed days and on holidays when closedOnHolidays). Ignores the booking
 * window and minimum notice — it measures capacity, for occupancy stats.
 */
export function bookableMinutes(date: ISODate, ctx: Pick<AvailabilityContext, 'schedule' | 'rules' | 'blocks'>): number {
  if (ctx.rules.closedOnHolidays && holidayOn(date)) return 0;
  const ranges = ctx.schedule[weekdayOf(date)] ?? [];
  let total = 0;
  for (const r of ranges) {
    const rs = ms(toInstant(date, r.start));
    const re = ms(toInstant(date, r.end));
    let blocked = 0;
    for (const b of ctx.blocks) {
      const s = Math.max(rs, ms(b.start));
      const e = Math.min(re, ms(b.end));
      if (e > s) blocked += e - s;
    }
    total += Math.max(0, re - rs - blocked) / 60_000;
  }
  return Math.round(total);
}

export function computeAvailability(from: ISODate, days: number, ctx: AvailabilityContext): DayAvailability[] {
  return Array.from({ length: days }, (_, i) => computeDay(addDays(from, i), ctx));
}

/** Server-side guard: is this exact start instant offered right now? */
export function isSlotBookable(start: ISOInstant, ctx: AvailabilityContext): boolean {
  const iso = new Date(start).toISOString();
  return computeDay(bogotaDate(iso), ctx).slots.includes(iso);
}

/**
 * Lock instants (5-minute grid) an appointment occupies: [start, end + buffer).
 * Start times are always on the grid because schedule times, steps and
 * durations are validated as multiples of 5 minutes.
 */
export function lockUnits(start: ISOInstant, durationMin: number, bufferMin: number): ISOInstant[] {
  const total = durationMin + bufferMin;
  const count = Math.ceil(total / LOCK_UNIT_MIN);
  const first = new Date(start).toISOString();
  return Array.from({ length: count }, (_, i) => addMinutes(first, i * LOCK_UNIT_MIN));
}
