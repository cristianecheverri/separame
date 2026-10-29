import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES, DEFAULT_SCHEDULE, computeAvailability, computeDay, isSlotBookable, lockUnits,
  type AvailabilityContext,
} from './availability';
import { bogotaTime, toInstant } from './time';

// Tuesday 20 Oct 2026, 9:00 a. m. in Bogotá.
const NOW = new Date(toInstant('2026-10-20', '09:00'));

const ctx = (over: Partial<AvailabilityContext> = {}): AvailabilityContext => ({
  schedule: DEFAULT_SCHEDULE,
  rules: DEFAULT_RULES,
  blocks: [],
  busy: [],
  durationMin: 30,
  now: NOW,
  ...over,
});

const times = (slots: string[]) => slots.map(bogotaTime);
/** A pro who chose a 10-minute margin (none by default). */
const BUFFERED = { ...DEFAULT_RULES, bufferMin: 10 };

describe('computeDay', () => {
  it('offers every 30-min start that fits inside the weekly ranges', () => {
    const day = computeDay('2026-10-22', ctx());
    expect(day.closed).toBeNull();
    expect(times(day.slots)).toEqual([
      '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
      '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
    ]);
  });

  it('respects the minimum notice today (2 h from 9:00 → from 11:00)', () => {
    expect(times(computeDay('2026-10-20', ctx()).slots)[0]).toBe('11:00');
  });

  it('without minimum notice, an hour that just started stays bookable for 5 minutes', () => {
    const noNotice = { ...DEFAULT_RULES, minNoticeMin: 0 };
    const at = (time: string) => new Date(toInstant('2026-10-20', time));
    expect(times(computeDay('2026-10-20', ctx({ rules: noNotice, now: at('10:05') })).slots)[0]).toBe('10:00');
    expect(isSlotBookable(toInstant('2026-10-20', '10:00'), ctx({ rules: noNotice, now: at('10:05') }))).toBe(true);
    expect(times(computeDay('2026-10-20', ctx({ rules: noNotice, now: at('10:06') })).slots)[0]).toBe('10:30');
  });

  it('with a minimum notice, the notice rules (no grace for started hours)', () => {
    const halfHour = { ...DEFAULT_RULES, minNoticeMin: 30 };
    expect(times(computeDay('2026-10-20', ctx({ rules: halfHour, now: new Date(toInstant('2026-10-20', '10:02')) })).slots)[0]).toBe('11:00');
  });

  it('today after the last start (within the notice) is over, not full', () => {
    const evening = new Date(toInstant('2026-10-20', '16:30'));
    expect(computeDay('2026-10-20', ctx({ now: evening }))).toMatchObject({ closed: 'past', slots: [] });
  });

  it('a day whose upcoming starts are all taken stays open (full → waitlist)', () => {
    const allAfternoon = [{ start: toInstant('2026-10-20', '11:00'), end: toInstant('2026-10-20', '18:00') }];
    expect(computeDay('2026-10-20', ctx({ busy: allAfternoon }))).toMatchObject({ closed: null, slots: [] });
  });

  it('a 45-min service never overflows the range end', () => {
    const slots = times(computeDay('2026-10-22', ctx({ durationMin: 45 })).slots);
    expect(slots).toContain('11:00');
    expect(slots).not.toContain('11:30');
    expect(slots.at(-1)).toBe('17:00');
  });

  it('keeps the buffer around existing appointments', () => {
    const busy = [{ start: toInstant('2026-10-22', '10:00'), end: toInstant('2026-10-22', '10:30') }];
    const slots = times(computeDay('2026-10-22', ctx({ busy, rules: BUFFERED })).slots);
    // 9:30–10:00 would end exactly at 10:00 (< 10 min gap) and 10:30 starts right at the end.
    expect(slots).not.toContain('09:30');
    expect(slots).not.toContain('10:00');
    expect(slots).not.toContain('10:30');
    expect(slots).toContain('09:00');
    expect(slots).toContain('11:00');
  });

  it('offers the starts right around the buffer instead of losing the neighbouring grid slots', () => {
    const busy = [{ start: toInstant('2026-10-22', '10:00'), end: toInstant('2026-10-22', '10:30') }];
    const slots = times(computeDay('2026-10-22', ctx({ busy, rules: BUFFERED })).slots);
    expect(slots.slice(0, 7)).toEqual(['08:00', '08:30', '09:00', '09:20', '10:40', '11:00', '11:30']);
    // The extra starts are real slots: their locks never touch the booked appointment's.
    const booked = new Set(lockUnits(busy[0].start, 30, BUFFERED.bufferMin));
    for (const at of ['09:20', '10:40']) {
      expect(lockUnits(toInstant('2026-10-22', at), 30, BUFFERED.bufferMin).some((u) => booked.has(u))).toBe(false);
    }
  });

  it('by default there is no margin: a 30-minute agenda books back to back', () => {
    expect(DEFAULT_RULES.bufferMin).toBe(0);
    const busy = [{ start: toInstant('2026-10-22', '10:00'), end: toInstant('2026-10-22', '10:30') }];
    expect(times(computeDay('2026-10-22', ctx({ busy })).slots).slice(0, 7)).toEqual(['08:00', '08:30', '09:00', '09:30', '10:30', '11:00', '11:30']);
  });

  it('without a buffer the grid slots next to an appointment stay (no extra starts)', () => {
    const busy = [{ start: toInstant('2026-10-22', '10:00'), end: toInstant('2026-10-22', '10:30') }];
    const slots = times(computeDay('2026-10-22', ctx({ busy, rules: { ...DEFAULT_RULES, bufferMin: 0 } })).slots);
    expect(slots.slice(0, 7)).toEqual(['08:00', '08:30', '09:00', '09:30', '10:30', '11:00', '11:30']);
  });

  it('extra starts stay inside the weekly range', () => {
    const busy = [{ start: toInstant('2026-10-22', '11:00'), end: toInstant('2026-10-22', '11:30') }];
    const slots = times(computeDay('2026-10-22', ctx({ busy, rules: BUFFERED })).slots);
    // 11:40 would end at 12:10, after the morning range.
    expect(slots).not.toContain('11:40');
    expect(slots).toContain('10:20');
  });

  it('closes Sundays, holidays, the past and beyond the booking window', () => {
    expect(computeDay('2026-10-25', ctx()).closed).toBe('weekly');
    expect(computeDay('2026-11-02', ctx())).toMatchObject({ closed: 'holiday', holidayName: 'Todos los Santos' });
    expect(computeDay('2026-10-19', ctx()).closed).toBe('past');
    expect(computeDay('2026-12-31', ctx()).closed).toBe('out_of_window');
  });

  it('opens holidays when the professional works them', () => {
    const day = computeDay('2026-11-02', ctx({ rules: { ...DEFAULT_RULES, closedOnHolidays: false } }));
    expect(day.closed).toBeNull();
    expect(day.holidayName).toBe('Todos los Santos');
    expect(day.slots.length).toBeGreaterThan(0);
  });

  it('marks fully blocked days and trims partial blocks', () => {
    const vacation = [{ start: toInstant('2026-10-23', '00:00'), end: toInstant('2026-10-24', '00:00') }];
    expect(computeDay('2026-10-23', ctx({ blocks: vacation })).closed).toBe('blocked');

    const morningOff = [{ start: toInstant('2026-10-22', '08:00'), end: toInstant('2026-10-22', '12:00') }];
    expect(times(computeDay('2026-10-22', ctx({ blocks: morningOff })).slots)[0]).toBe('14:00');
  });
});

describe('computeAvailability / isSlotBookable', () => {
  it('returns one entry per requested day', () => {
    const days = computeAvailability('2026-10-20', 14, ctx());
    expect(days).toHaveLength(14);
    expect(days[0].date).toBe('2026-10-20');
    expect(days[13].date).toBe('2026-11-02');
  });

  it('validates exact offered instants only', () => {
    expect(isSlotBookable(toInstant('2026-10-22', '10:00'), ctx())).toBe(true);
    expect(isSlotBookable(toInstant('2026-10-22', '10:10'), ctx())).toBe(false);
    expect(isSlotBookable(toInstant('2026-10-25', '10:00'), ctx())).toBe(false);
  });
});

describe('lockUnits', () => {
  it('covers [start, end + buffer) on the 5-min grid', () => {
    const units = lockUnits(toInstant('2026-10-22', '10:00'), 30, 10);
    expect(units).toHaveLength(8);
    expect(times(units)).toEqual(['10:00', '10:05', '10:10', '10:15', '10:20', '10:25', '10:30', '10:35']);
  });

  it('two bookings closer than the buffer share a unit', () => {
    const a = new Set(lockUnits(toInstant('2026-10-22', '10:00'), 30, 10));
    const b = lockUnits(toInstant('2026-10-22', '10:35'), 30, 10);
    expect(b.some((u) => a.has(u))).toBe(true);
    const c = lockUnits(toInstant('2026-10-22', '10:40'), 30, 10);
    expect(c.some((u) => a.has(u))).toBe(false);
  });
});

describe('bookableMinutes', () => {
  it('sums weekly ranges, subtracts blocks and closes holidays', async () => {
    const { bookableMinutes } = await import('./availability');
    expect(bookableMinutes('2026-10-22', ctx())).toBe(480); // 8–12 + 14–18
    expect(bookableMinutes('2026-10-24', ctx())).toBe(240); // Saturday 8–12
    expect(bookableMinutes('2026-10-25', ctx())).toBe(0); // Sunday
    expect(bookableMinutes('2026-11-02', ctx())).toBe(0); // holiday
    const morningOff = [{ start: toInstant('2026-10-22', '08:00'), end: toInstant('2026-10-22', '12:00') }];
    expect(bookableMinutes('2026-10-22', ctx({ blocks: morningOff }))).toBe(240);
  });
});
