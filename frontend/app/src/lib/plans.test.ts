import { describe, expect, it } from 'vitest';
import type { PriceVersion } from '@shared/types';
import { buildPlans, defaultPlanIndex, minPackageAmount, monthlyAmount } from './plans';
import { prices } from '../mocks/fixtures';

const fundador = prices[0] as PriceVersion;

describe('plans from a price version', () => {
  it('derives the cards of the billing mockup', () => {
    const plans = buildPlans(fundador);
    expect(plans.map((p) => [p.name, p.amountCop, p.tag, p.monthlyText])).toEqual([
      ['3 meses', 15000, 'Precio fundador', '$5.000 al mes'],
      ['6 meses', 30000, 'Precio fundador', '$5.000 al mes'],
      ['12 meses', 50000, 'El más conveniente', '2 meses gratis · $4.167 al mes'],
    ]);
    expect(defaultPlanIndex(plans)).toBe(2);
  });

  it('puts the month-to-month package last', () => {
    const plans = buildPlans({ ...fundador, packages: [{ months: 1, amountCop: 5900 }, ...fundador.packages] });
    expect(plans.at(-1)).toMatchObject({ name: 'Mes a mes', tag: 'Flexible', monthlyText: 'Sin compromiso', amountCop: 5900 });
  });

  it('computes "Renovar desde"', () => {
    expect(minPackageAmount(fundador)).toBe(15000);
    expect(minPackageAmount({ ...fundador, packages: [] })).toBeNull();
  });
});

describe('team headline amounts', () => {
  const fundador = {
    id: 'fundador-v1', code: 'fundador-v1', name: 'Fundador', currency: 'COP' as const, monthlyCop: 5000,
    packages: [{ months: 3, amountCop: 15000 }, { months: 12, amountCop: 50000 }], extraProfessionalCop: 3900,
    status: 'active' as const, isDefault: true, createdAt: '2026-10-01T00:00:00.000Z',
  };

  it('«Renovar desde» and «desde $X/mes» include the additional professionals', () => {
    expect(minPackageAmount(fundador)).toBe(15000);
    expect(minPackageAmount(fundador, 2)).toBe(15000 + 2 * 3900 * 3);
    expect(monthlyAmount(fundador)).toBe(5000);
    expect(monthlyAmount(fundador, 2)).toBe(12800);
  });
});
