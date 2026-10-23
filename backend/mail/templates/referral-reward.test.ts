import { describe, expect, it } from 'vitest';
import type { Payment, PriceVersion } from '../../../shared/types';
import { manualPaymentReceiptEmail } from './manual-payment-receipt';
import { proNewBookingEmail } from './pro-new-booking';
import { referralRewardEmail, type ReferralRewardData } from './referral-reward';

const base: Omit<ReferralRewardData, 'outcome'> = {
  siteUrl: 'https://separame.app',
  name: 'Dra. Laura Pérez',
  referred: { name: 'Nombre del referido', title: 'Abogado' },
  paidMonths: 3,
  paidAt: '2026-10-14T17:00:00.000Z',
  previousAccessUntil: '2026-10-18T05:00:00.000Z',
  savedMonths: 1,
  referralUrl: 'https://separame.app/r/laura-perez',
};

describe('referral reward email (mockup copy)', () => {
  it('month added: new expiry in the subject, before/after rows, keep-inviting link', () => {
    const email = referralRewardEmail({ ...base, outcome: { kind: 'applied', previousUntil: '2027-01-25T05:00:00.000Z', paidUntil: '2027-02-25T05:00:00.000Z' } });
    expect(email.subject).toBe('¡Ganaste un mes gratis! · Tu plan ahora vence el 25 feb. 2027');
    expect(email.html).toContain('¡Ganaste un mes gratis!');
    expect(email.html).toContain('Hola, Laura.');
    expect(email.html).toContain('Nombre del referido se registró con tu enlace y pagó su primer plan. Gracias por recomendar Sepárame: sumamos 1 mes al final de tu periodo actual.');
    expect(email.html).toContain('Nombre del referido · Abogado');
    expect(email.html).toContain('Plan 3 meses · 14 oct. 2026');
    expect(email.html).toContain('Vencía');
    expect(email.html).toContain('25 ene. 2027');
    expect(email.html).toContain('Tu plan ahora vence el');
    expect(email.html).toContain('href="https://separame.app/app/billing"');
    expect(email.html).toContain('Ver mi suscripción');
    expect(email.html).toContain('Sigue invitando: por cada profesional que pague su primer plan con tu enlace, ganas otro mes.');
    expect(email.html).toContain('>separame.app/r/laura-perez</a>');
    expect(email.html).not.toContain('Guardamos tu mes');
    expect(email.text).toContain('https://separame.app/r/laura-perez');
  });

  it('expired plan: the month is saved for the next payment', () => {
    const email = referralRewardEmail({ ...base, outcome: { kind: 'saved' } });
    expect(email.subject).toBe('¡Ganaste un mes gratis! · Lo guardamos para tu próximo pago');
    expect(email.html).toContain('Gracias por recomendar Sepárame: te ganaste 1 mes gratis.');
    expect(email.html).toContain('Venció el 18 oct. 2026');
    expect(email.html).toContain('Meses guardados');
    expect(email.html).toContain('1 mes');
    expect(email.html).toContain('<strong>Guardamos tu mes: se aplica en tu próximo pago.</strong> Cuando renueves, lo sumamos al final del plan que elijas.');
  });

  it('escapes the referred name', () => {
    const email = referralRewardEmail({ ...base, referred: { name: '<b>x</b>', title: '' }, outcome: { kind: 'saved' } });
    expect(email.html).not.toContain('<b>x</b>');
  });
});

describe('price display in emails', () => {
  const data = {
    siteUrl: 'https://separame.app',
    pro: { name: 'Dra. Laura Pérez', title: 'Odontóloga', neighborhood: '', address: '', city: 'Medellín', slug: 'dra-laura-perez' },
    client: { name: 'Nombre del cliente', email: '', phone: '3000000000' },
    serviceName: 'Control', durationMin: 15, start: '2026-10-22T15:00:00.000Z',
  };

  it('shows "Precio a convenir" and omits the row when the price is hidden', () => {
    expect(proNewBookingEmail({ ...data, priceCop: null, priceDisplay: 'agreed' }).html).toContain('Precio a convenir');
    const hidden = proNewBookingEmail({ ...data, priceCop: null, priceDisplay: 'hidden' });
    expect(hidden.html).not.toContain('>Precio<');
    expect(hidden.text).not.toContain('Precio:');
    expect(proNewBookingEmail({ ...data, priceCop: null }).html).toContain('Sin costo');
  });
});

describe('manual payment receipt with saved referral months', () => {
  const price: PriceVersion = {
    id: 'fundador-v1', code: 'fundador-v1', name: 'Fundador', currency: 'COP', monthlyCop: 5000, packages: [], extraProfessionalCop: null, status: 'active', isDefault: true, createdAt: '2026-01-01T00:00:00.000Z',
  };
  const payment: Payment = {
    id: 'p1', proId: 'x', method: 'nequi', status: 'approved', source: 'admin', amountCop: 15000, months: 3, paidAt: '2026-10-20T17:00:00.000Z',
    until: '2027-01-20T15:00:00.000Z', reference: '', priceVersionId: 'fundador-v1', createdAt: '2026-10-20T15:00:00.000Z',
  };

  it('adds the months row and the final date', () => {
    const email = manualPaymentReceiptEmail({ siteUrl: 'https://separame.app', name: 'Dra. Laura Pérez', payment, price, referralMonths: 1, accessUntil: '2027-02-20T15:00:00.000Z' });
    expect(email.html).toContain('Meses gratis por referidos');
    expect(email.html).toContain('+1 mes');
    expect(email.subject).toContain('20 de febrero de 2027');
    expect(manualPaymentReceiptEmail({ siteUrl: 'https://separame.app', name: 'Dra. Laura Pérez', payment, price }).html).not.toContain('Meses gratis por referidos');
  });
});
