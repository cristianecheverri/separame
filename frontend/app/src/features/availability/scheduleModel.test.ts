import { describe, expect, it } from 'vitest';
import type { WeeklySchedule } from '@shared/types';
import { sameSchedule, stableJson } from './scheduleModel';

const week: WeeklySchedule = {
  mon: [{ start: '08:00', end: '12:00' }, { start: '14:00', end: '18:00' }],
  tue: [{ start: '08:00', end: '18:00' }], wed: [], thu: [], fri: [], sat: [], sun: [],
};

describe('sameSchedule', () => {
  it('ignores key order and range order (the API returns days alphabetically and ranges as {end,start})', () => {
    const fromApi = {
      fri: [], mon: [{ end: '18:00', start: '14:00' }, { end: '12:00', start: '08:00' }], sat: [], sun: [], thu: [],
      tue: [{ end: '18:00', start: '08:00' }], wed: [],
    } as unknown as WeeklySchedule;
    expect(sameSchedule(fromApi, week)).toBe(true);
    expect(sameSchedule(fromApi, { ...week, wed: [{ start: '08:00', end: '12:00' }] })).toBe(false);
  });

  it('stableJson sorts object keys at every level', () => {
    expect(stableJson({ b: 1, a: { d: 2, c: 3 } })).toBe(stableJson({ a: { c: 3, d: 2 }, b: 1 }));
  });
});
