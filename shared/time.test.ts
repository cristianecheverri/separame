import { describe, expect, it } from 'vitest';
import { addDays, addMonths, bogotaDate, bogotaTime, diffDays, toInstant, weekdayOf } from './time';
import { formatCop, formatDayLong, formatDuration, formatTime, formatWhen, initials } from './format';

describe('Bogotá time (UTC-5, no DST)', () => {
  it('converts wall clock to UTC and back', () => {
    const instant = toInstant('2026-10-22', '10:00');
    expect(instant).toBe('2026-10-22T15:00:00.000Z');
    expect(bogotaDate(instant)).toBe('2026-10-22');
    expect(bogotaTime(instant)).toBe('10:00');
  });

  it('keeps late-evening instants on the Bogotá day, not the UTC day', () => {
    expect(bogotaDate('2026-10-23T03:30:00.000Z')).toBe('2026-10-22');
  });

  it('does date math and weekdays', () => {
    expect(weekdayOf('2026-10-20')).toBe('tue');
    expect(weekdayOf('2026-10-25')).toBe('sun');
    expect(addDays('2026-10-31', 2)).toBe('2026-11-02');
    expect(diffDays('2026-10-20', '2026-11-02')).toBe(13);
  });

  it('adds months clamping the day', () => {
    expect(addMonths('2026-01-31T15:00:00.000Z', 1)).toBe('2026-02-28T15:00:00.000Z');
    expect(addMonths('2026-10-25T15:00:00.000Z', 3)).toBe('2027-01-25T15:00:00.000Z');
  });
});

describe('format (es-CO, as in the mockups)', () => {
  it('formats times', () => {
    expect(formatTime('08:00')).toBe('8:00 a. m.');
    expect(formatTime('10:30')).toBe('10:30 a. m.');
    expect(formatTime('12:00')).toBe('12:00 m.');
    expect(formatTime('14:30')).toBe('2:30 p. m.');
    expect(formatTime('00:15')).toBe('12:15 a. m.');
  });

  it('formats days and the booking summary', () => {
    expect(formatDayLong('2026-10-22')).toBe('jueves 22 de octubre');
    expect(formatWhen('2026-10-22T15:00:00.000Z')).toBe('Jueves 22 de octubre · 10:00 a. m.');
  });

  it('formats money and durations', () => {
    expect(formatCop(60000)).toBe('$60.000');
    expect(formatCop(1250000)).toBe('$1.250.000');
    expect(formatCop(null)).toBe('Sin costo');
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(90)).toBe('1 h 30 min');
  });

  it('builds initials skipping honorifics', () => {
    expect(initials('Dra. Laura Pérez')).toBe('LP');
    expect(initials('Estudio Lúa')).toBe('EL');
    expect(initials('Camilo')).toBe('C');
  });
});
