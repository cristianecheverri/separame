import { describe, expect, it } from 'vitest';
import { toInstant } from '@shared/time';
import { firstName, formatBlockRange, formatCopInput, formatDateLong, formatDayShortMonth, formatPhone, formatWeekdayDay, linkLabel, parseCopInput } from './format';

describe('panel formatting', () => {
  it('formats blocked periods like the mockup', () => {
    expect(formatBlockRange({ start: toInstant('2026-12-21', '00:00'), end: toInstant('2027-01-05', '00:00') })).toBe('21 dic. 2026 – 4 ene. 2027');
    expect(formatBlockRange({ start: toInstant('2026-11-13', '00:00'), end: toInstant('2026-11-14', '00:00') })).toBe('Viernes 13 nov., todo el día');
    expect(formatBlockRange({ start: toInstant('2026-11-13', '14:00'), end: toInstant('2026-11-13', '18:00') })).toBe('Viernes 13 nov., 2:00 p. m. – 6:00 p. m.');
  });

  it('formats dates', () => {
    expect(formatDateLong('2027-01-25')).toBe('25 de enero de 2027');
    expect(formatDayShortMonth('2026-11-02')).toBe('Lun 2 nov.');
    expect(formatWeekdayDay('2026-10-21', '2026-10-20')).toBe('Miércoles 21');
    expect(formatWeekdayDay('2026-11-02', '2026-10-20')).toBe('Lunes 2 nov.');
  });

  it('formats people and links', () => {
    expect(firstName('Dra. Laura Pérez')).toBe('Laura');
    expect(formatPhone('3105550199')).toBe('+57 310 555 0199');
    expect(linkLabel('https://separame.app/dra-laura-perez')).toBe('separame.app/dra-laura-perez');
  });

  it('handles COP inputs', () => {
    expect(formatCopInput('60000')).toBe('60.000');
    expect(formatCopInput('0012a3')).toBe('123');
    expect(parseCopInput('450.000')).toBe(450000);
    expect(parseCopInput('')).toBeNull();
  });
});
