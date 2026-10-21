import { describe, expect, it } from 'vitest';
import { formatServicePrice, priceDisplayOf } from './format';
import { onboardingSchema, updateProfileSchema, upsertServiceSchema } from './schemas';

describe('service price display', () => {
  it('derives the option for items saved before it existed (null/0 → "Sin costo")', () => {
    expect(priceDisplayOf({ priceCop: 60000 })).toBe('fixed');
    expect(priceDisplayOf({ priceCop: null })).toBe('free');
    expect(priceDisplayOf({ priceCop: 0 })).toBe('free');
    expect(priceDisplayOf({ priceCop: null, priceDisplay: 'fixed' })).toBe('free');
  });

  it('formats each option as the client sees it', () => {
    expect(formatServicePrice({ priceCop: 60000, priceDisplay: 'fixed' })).toBe('$60.000');
    expect(formatServicePrice({ priceCop: 60000 })).toBe('$60.000');
    expect(formatServicePrice({ priceCop: null })).toBe('Sin costo');
    expect(formatServicePrice({ priceCop: null, priceDisplay: 'free' })).toBe('Sin costo');
    expect(formatServicePrice({ priceCop: null, priceDisplay: 'agreed' })).toBe('Precio a convenir');
    expect(formatServicePrice({ priceCop: null, priceDisplay: 'hidden' })).toBe('');
  });
});

describe('upsertServiceSchema price option', () => {
  const base = { name: 'Valoración', durationMin: 30, description: '', visible: true };

  it('keeps older clients working: priceDisplay derived from priceCop', () => {
    expect(upsertServiceSchema.parse({ ...base, priceCop: 60000 })).toMatchObject({ priceCop: 60000, priceDisplay: 'fixed' });
    expect(upsertServiceSchema.parse({ ...base, priceCop: null })).toMatchObject({ priceCop: null, priceDisplay: 'free' });
  });

  it('needs a value with "Valor fijo" and drops it for the other options', () => {
    const fixed = upsertServiceSchema.safeParse({ ...base, priceCop: null, priceDisplay: 'fixed' });
    expect(fixed.success).toBe(false);
    expect(fixed.error?.issues[0]).toMatchObject({ path: ['priceCop'], message: 'Escribe el valor de referencia' });
    expect(upsertServiceSchema.parse({ ...base, priceCop: 50000, priceDisplay: 'agreed' })).toMatchObject({ priceCop: null, priceDisplay: 'agreed' });
    expect(upsertServiceSchema.parse({ ...base, priceCop: null, priceDisplay: 'hidden' })).toMatchObject({ priceCop: null, priceDisplay: 'hidden' });
    expect(upsertServiceSchema.safeParse({ ...base, priceCop: null, priceDisplay: 'gratis' }).success).toBe(false);
  });
});

describe('onboarding referral code', () => {
  const profile = { name: 'Nombre del profesional', title: 'Profesión', city: 'Ciudad', slug: 'mi-agenda' };

  it('accepts an optional code (normalized) and never fails on a bad one', () => {
    expect(onboardingSchema.parse({ ...profile, referralCode: ' Laura-Perez ' }).referralCode).toBe('laura-perez');
    expect(onboardingSchema.parse({ ...profile, referralCode: 42 }).referralCode).toBeUndefined();
    expect(onboardingSchema.parse(profile).referralCode).toBeUndefined();
  });

  it('is not part of the profile edit', () => {
    expect(updateProfileSchema.parse({ ...profile, referralCode: 'laura-perez' })).not.toHaveProperty('referralCode');
  });
});
