import { describe, expect, it } from 'vitest';
import { computeSubscription, extendPaidUntil } from './subscription';
import { slugProblem, slugify } from './slug';
import { createBookingSchema, manualPaymentSchema, phoneSchema, putAvailabilitySchema } from './schemas';
import { DEFAULT_RULES, DEFAULT_SCHEDULE } from './availability';

const at = (iso: string) => new Date(iso);
const base = { trialEndsAt: '2026-10-25T15:00:00.000Z', paidUntil: null, priceVersionId: 'p1' };

describe('computeSubscription', () => {
  it('trial → grace → expired', () => {
    expect(computeSubscription(base, at('2026-10-20T15:00:00Z'))).toMatchObject({ state: 'trial', daysLeft: 5, canAcceptBookings: true, readOnly: false });
    expect(computeSubscription(base, at('2026-10-26T15:00:00Z'))).toMatchObject({ state: 'grace', canAcceptBookings: true });
    expect(computeSubscription(base, at('2026-10-29T15:00:00Z'))).toMatchObject({ state: 'expired', canAcceptBookings: false, readOnly: true });
  });

  it('a paid period wins over the trial', () => {
    const s = computeSubscription({ ...base, paidUntil: '2027-01-25T15:00:00.000Z' }, at('2026-10-20T15:00:00Z'));
    expect(s.state).toBe('active');
    expect(s.accessUntil).toBe('2027-01-25T15:00:00.000Z');
  });
});

describe('extendPaidUntil', () => {
  it('paying during the trial counts from the trial end', () => {
    expect(extendPaidUntil(base, 3, at('2026-10-20T15:00:00Z'))).toBe('2027-01-25T15:00:00.000Z');
  });

  it('an expired plan counts from now', () => {
    const expired = { trialEndsAt: '2026-07-18T15:00:00.000Z', paidUntil: '2026-10-18T15:00:00.000Z' };
    expect(extendPaidUntil(expired, 3, at('2026-10-20T15:00:00.000Z'))).toBe('2027-01-20T15:00:00.000Z');
  });
});

describe('slug', () => {
  it('slugifies names', () => {
    expect(slugify('Dra. Laura Pérez')).toBe('dra-laura-perez');
    expect(slugify('  Estudio   Lúa!! ')).toBe('estudio-lua');
  });

  it('rejects reserved and malformed slugs', () => {
    expect(slugProblem('app')).toBe('reserved');
    expect(slugProblem('ab')).toBe('too_short');
    expect(slugProblem('-laura')).toBe('invalid');
    expect(slugProblem('la--ura')).toBe('invalid');
    expect(slugProblem('dra-laura-perez')).toBeNull();
  });
});

describe('schemas', () => {
  it('normalizes Colombian phones', () => {
    expect(phoneSchema.parse('+57 300 123 4567')).toBe('3001234567');
    expect(phoneSchema.safeParse('12345').success).toBe(false);
  });

  it('requires consent on bookings', () => {
    const body = {
      serviceId: 's1',
      start: '2026-10-22T15:00:00.000Z',
      client: { name: 'Mariana Gómez', email: ' Mariana@Correo.com ', phone: '300 123 4567' },
      consent: true,
      turnstileToken: 'x',
    };
    const ok = createBookingSchema.parse(body);
    expect(ok.client.email).toBe('mariana@correo.com');
    expect(createBookingSchema.safeParse({ ...body, consent: false }).success).toBe(false);
  });

  it('accepts the default schedule and rejects overlapping ranges', () => {
    expect(putAvailabilitySchema.safeParse({ schedule: DEFAULT_SCHEDULE, rules: DEFAULT_RULES }).success).toBe(true);
    const bad = { ...DEFAULT_SCHEDULE, mon: [{ start: '08:00', end: '12:00' }, { start: '11:00', end: '13:00' }] };
    expect(putAvailabilitySchema.safeParse({ schedule: bad, rules: DEFAULT_RULES }).success).toBe(false);
  });

  it('manual payments need an amount unless courtesy', () => {
    const p = { method: 'transfer', amountCop: null, paidAt: '2026-10-20', period: { months: 3 }, reference: '', notify: true };
    expect(manualPaymentSchema.safeParse(p).success).toBe(false);
    expect(manualPaymentSchema.safeParse({ ...p, method: 'courtesy' }).success).toBe(true);
    expect(manualPaymentSchema.safeParse({ ...p, amountCop: 15000 }).success).toBe(true);
  });
});
