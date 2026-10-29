import { describe, expect, it } from 'vitest';
import { derivedStats, type StatsAppointment } from './stats';

const appt = (over: Partial<StatsAppointment>): StatsAppointment => ({
  status: 'confirmed', start: '2026-10-22T15:00:00.000Z', createdAt: '2026-10-19T15:00:00.000Z', updatedAt: '2026-10-19T15:00:00.000Z',
  createdBy: 'client', clientConfirmation: 'pending', ...over,
});

describe('derivedStats', () => {
  it('what Sepárame did: online bookings, time saved, reminders, confirmations and recovered slots', () => {
    const s = derivedStats([
      appt({ reminderSentAt: '2026-10-21T15:00:00.000Z', clientConfirmation: 'confirmed' }),
      appt({ reminderSentAt: '2026-10-21T15:00:00.000Z', fromWaitlist: true }),
      appt({ createdBy: 'pro' }),
      appt({ status: 'cancelled', reminderSentAt: '2026-10-21T15:00:00.000Z' }),
    ]);
    expect(s.value).toEqual({ online: 2, onlineShare: 2 / 3, savedMinutes: 10, remindersSent: 3, confirmationRate: 0.5, recovered: 1 });
  });

  it('late cancellations: less than 24 h before the start', () => {
    const s = derivedStats([
      appt({ status: 'cancelled', updatedAt: '2026-10-22T05:00:00.000Z' }),
      appt({ status: 'cancelled', updatedAt: '2026-10-20T05:00:00.000Z' }),
    ]);
    expect(s.cancelledLate).toBe(1);
  });

  it('busiest Bogotá start hours and how far ahead clients book', () => {
    const s = derivedStats([
      appt({ start: '2026-10-22T15:00:00.000Z' }), // 10 a. m.
      appt({ start: '2026-10-22T15:30:00.000Z', createdAt: '2026-10-22T13:00:00.000Z' }), // same day
      appt({ start: '2026-10-22T19:00:00.000Z', createdBy: 'pro' }), // 2 p. m.
    ]);
    expect(s.byHour).toEqual([{ hour: 10, appointments: 2 }, { hour: 14, appointments: 1 }]);
    expect(s.avgLeadDays).toBe(1.6); // (3 days + 2.5 h) / 2
    expect(s.shortLeadShare).toBe(0.5);
  });

  it('nothing to measure: zeros and no average', () => {
    expect(derivedStats([])).toMatchObject({ value: { online: 0, onlineShare: 0, confirmationRate: 0 }, byHour: [], avgLeadDays: null, shortLeadShare: 0 });
  });
});
