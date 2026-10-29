import { describe, expect, it } from 'vitest';
import { blocksOn, buildDayRows, freeGaps, isNewAppointment, upcomingDays } from './agenda';
import { MOCK_NOW, rules, schedule, TODAY, trialAppointments } from '../mocks/fixtures';

const now = new Date(MOCK_NOW);

describe('day agenda', () => {
  const today = trialAppointments().filter((a) => a.start.startsWith('2026-10-20'));

  it('finds the 9:30 free gap of the mockup and nothing else', () => {
    const gaps = freeGaps(TODAY, today, schedule, rules, now);
    expect(gaps).toEqual([{ start: '2026-10-20T14:30:00.000Z', minutes: 30 }]);
  });

  it('builds rows in time order with their kinds', () => {
    const rows = buildDayRows(TODAY, today, schedule, rules, now);
    expect(rows.map((r) => `${r.time} ${r.kind}`)).toEqual([
      '8:00 a. m. confirmed',
      '8:30 a. m. confirmed',
      '9:30 a. m. free',
      '10:00 a. m. new',
      '11:00 a. m. confirmed',
      '2:00 p. m. cancelled',
      '3:00 p. m. confirmed',
      '4:00 p. m. confirmed',
    ]);
  });

  it('a block replaces the free gap it covers and shows as its own row', () => {
    const block = { id: 'b1', label: 'No disponible', start: '2026-10-20T14:30:00.000Z', end: '2026-10-20T15:00:00.000Z' };
    const rows = buildDayRows(TODAY, today, schedule, rules, now, { blocks: [block] });
    expect(rows.filter((r) => r.kind === 'free')).toHaveLength(0);
    expect(rows.find((r) => r.kind === 'blocked')).toMatchObject({ time: '9:30 a. m.', allDay: false, block });
  });

  it('a block over several days is «Todo el día» on the days in between', () => {
    const vacation = { id: 'b2', label: 'Vacaciones', start: '2026-10-19T05:00:00.000Z', end: '2026-10-23T05:00:00.000Z' };
    expect(blocksOn(TODAY, [vacation])).toEqual([{ block: vacation, start: '2026-10-20T05:00:00.000Z', end: '2026-10-21T05:00:00.000Z', allDay: true }]);
    expect(blocksOn('2026-10-23', [vacation])).toEqual([]);
  });

  it('marks client bookings from the last 24 h as new', () => {
    const sofia = today.find((a) => a.client.name === 'Sofía Castaño')!;
    expect(isNewAppointment(sofia, now)).toBe(true);
    expect(isNewAppointment(sofia, new Date('2026-10-22T12:00:00.000Z'))).toBe(false);
  });

  it('shows no free rows for past days', () => {
    expect(freeGaps('2026-10-19', today, schedule, rules, now)).toEqual([]);
  });
});

describe('upcoming days', () => {
  it('lists the next three working days and the next holiday', () => {
    const days = upcomingDays(TODAY, trialAppointments(), schedule, true);
    expect(days).toEqual([
      { date: '2026-10-21', count: 6 },
      { date: '2026-10-22', count: 7 },
      { date: '2026-10-23', count: 3 },
      { date: '2026-11-02', count: null, holidayName: 'Todos los Santos' },
    ]);
  });

  it('treats holidays as normal days when the pro works on them', () => {
    const days = upcomingDays(TODAY, [], schedule, false);
    expect(days.every((d) => d.count === 0)).toBe(true);
  });
});
