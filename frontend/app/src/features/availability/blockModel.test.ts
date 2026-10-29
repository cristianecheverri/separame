import { describe, expect, it } from 'vitest';
import { toInstant } from '@shared/time';
import type { Appointment } from '@shared/types';
import { blockRequest, coveredAppointments, hourPresets, initialDraft, nextHalfHour, submitLabel, type BlockDraft } from './blockModel';

const TODAY = '2026-10-20';
const NOW = new Date(toInstant(TODAY, '10:10'));
const draft = (over: Partial<BlockDraft> = {}): BlockDraft => ({ ...initialDraft(TODAY, NOW), ...over });
const schedule = { mon: [], tue: [{ start: '08:00', end: '12:00' }, { start: '14:00', end: '18:00' }], wed: [], thu: [], fri: [], sat: [], sun: [] };

describe('blockModel', () => {
  it('opens on today from the next half hour, two hours long', () => {
    expect(nextHalfHour(NOW)).toBe('10:30');
    expect(draft()).toMatchObject({ when: 'today', allDay: false, startTime: '10:30', endTime: '12:30' });
  });

  it('a free gap opens on that day and those hours', () => {
    expect(initialDraft(TODAY, NOW, { date: '2026-10-21', startTime: '09:30', endTime: '10:00' })).toMatchObject({ when: 'tomorrow', startTime: '09:30', endTime: '10:00' });
    expect(initialDraft(TODAY, NOW, { date: '2026-10-23', startTime: '09:30', endTime: '10:00' })).toMatchObject({ when: 'other', date: '2026-10-23' });
  });

  it('builds the request: hours of one day, whole days, or the same hours every day', () => {
    expect(blockRequest(draft({ startTime: '14:00', endTime: '16:00' }), TODAY)).toEqual({
      label: undefined, start: toInstant(TODAY, '14:00'), end: toInstant(TODAY, '16:00'),
    });
    expect(blockRequest(draft({ when: 'tomorrow', allDay: true, reason: ' Congreso ' }), TODAY)).toEqual({
      label: 'Congreso', start: toInstant('2026-10-21', '00:00'), end: toInstant('2026-10-22', '00:00'),
    });
    expect(blockRequest(draft({ when: 'range', from: '2026-10-20', to: '2026-10-23', allDay: true }), TODAY)).toMatchObject({
      start: toInstant('2026-10-20', '00:00'), end: toInstant('2026-10-24', '00:00'),
    });
    expect(blockRequest(draft({ when: 'range', from: '2026-10-20', to: '2026-10-23', startTime: '14:00', endTime: '16:00' }), TODAY)).toEqual({
      label: undefined, start: toInstant(TODAY, '14:00'), end: toInstant(TODAY, '16:00'), repeatUntil: '2026-10-23',
    });
  });

  it('refuses an end before the start and a range that ends before it begins', () => {
    expect(blockRequest(draft({ startTime: '16:00', endTime: '14:00' }), TODAY)).toBeNull();
    expect(blockRequest(draft({ startTime: '14:00', endTime: '14:00' }), TODAY)).toBeNull();
    expect(blockRequest(draft({ when: 'range', from: '2026-10-23', to: '2026-10-20', allDay: true }), TODAY)).toBeNull();
  });

  it('labels the button with what will be blocked', () => {
    expect(submitLabel(draft({ startTime: '14:00', endTime: '16:00' }), TODAY)).toBe('Bloquear hoy · 2:00 p. m. – 4:00 p. m.');
    expect(submitLabel(draft({ when: 'tomorrow', allDay: true }), TODAY)).toBe('Bloquear mañana todo el día');
    expect(submitLabel(draft({ when: 'other', date: '2026-10-23', allDay: true }), TODAY)).toBe('Bloquear el vie 23 oct. todo el día');
    expect(submitLabel(draft({ when: 'range', from: '2026-10-20', to: '2026-10-23', allDay: true }), TODAY)).toBe('Bloquear del 20 al 23 oct.');
    expect(submitLabel(draft({ when: 'range', from: '2026-10-30', to: '2026-11-02', allDay: true }), TODAY)).toBe('Bloquear del 30 oct. al 2 nov.');
  });

  it('hour shortcuts follow the weekly hours; «Desde ahora» only today', () => {
    expect(hourPresets(TODAY, schedule, TODAY, NOW).map((p) => [p.label, p.startTime, p.endTime])).toEqual([
      ['Toda la mañana', '08:00', '12:00'], ['Toda la tarde', '14:00', '18:00'], ['Desde ahora', '10:30', '18:00'],
    ]);
    expect(hourPresets('2026-10-21', schedule, TODAY, NOW).map((p) => p.key)).toEqual(['morning', 'afternoon']);
  });

  it('warns about the confirmed appointments the range covers, every day of a repeat', () => {
    const appt = (start: string, status: Appointment['status'] = 'confirmed') =>
      ({ id: start, status, start, end: new Date(Date.parse(start) + 30 * 60_000).toISOString() }) as Appointment;
    const list = [appt(toInstant(TODAY, '15:00')), appt(toInstant('2026-10-22', '14:30')), appt(toInstant('2026-10-22', '17:00')), appt(toInstant(TODAY, '14:00'), 'cancelled')];
    const request = blockRequest(draft({ when: 'range', from: TODAY, to: '2026-10-23', startTime: '14:00', endTime: '16:00' }), TODAY)!;
    expect(coveredAppointments(request, list).map((a) => a.start)).toEqual([toInstant(TODAY, '15:00'), toInstant('2026-10-22', '14:30')]);
  });
});
