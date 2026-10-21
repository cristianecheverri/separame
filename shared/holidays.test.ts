import { describe, expect, it } from 'vitest';
import { colombianHolidays, easterSunday, holidayOn, upcomingHolidays } from './holidays';

describe('easterSunday', () => {
  it.each([
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
  ])('%i → %s', (year, date) => {
    expect(easterSunday(year)).toBe(date);
  });
});

describe('colombianHolidays', () => {
  it('matches the official 2026 calendar (18 holidays, Ley Emiliani applied)', () => {
    expect(colombianHolidays(2026).map((h) => h.date)).toEqual([
      '2026-01-01', '2026-01-12', '2026-03-23', '2026-04-02', '2026-04-03', '2026-05-01',
      '2026-05-18', '2026-06-08', '2026-06-15', '2026-06-29', '2026-07-20', '2026-08-07',
      '2026-08-17', '2026-10-12', '2026-11-02', '2026-11-16', '2026-12-08', '2026-12-25',
    ]);
  });

  it('names the November holidays shown in the panel', () => {
    expect(holidayOn('2026-11-02')?.name).toBe('Todos los Santos');
    expect(holidayOn('2026-11-16')?.name).toBe('Independencia de Cartagena');
    expect(holidayOn('2026-11-03')).toBeUndefined();
  });

  it('lists upcoming holidays across the year boundary', () => {
    expect(upcomingHolidays('2026-12-20', 3).map((h) => h.date)).toEqual(['2026-12-25', '2027-01-01', '2027-01-11']);
  });
});
