import { describe, expect, it } from 'vitest';
import { createAppointmentSchema, createBookingSchema, joinWaitlistSchema, upsertServiceSchema } from './schemas';

const issues = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  Object.fromEntries((result.error?.issues ?? []).map((i) => [i.path.map(String).join('.'), i.message]));

const base = {
  serviceId: 'svc1',
  start: '2026-10-21T15:00:00.000Z',
  consent: true,
  turnstileToken: 'tok',
};

describe('createBookingSchema (public booking)', () => {
  it('requires the phone and makes the email optional', () => {
    const parsed = createBookingSchema.parse({ ...base, client: { name: 'Mariana Gómez', phone: '+57 300 123 4567' } });
    expect(parsed.client).toEqual({ name: 'Mariana Gómez', email: '', phone: '3001234567' });
    expect(createBookingSchema.parse({ ...base, client: { name: 'Mariana Gómez', email: ' ', phone: '3001234567' } }).client.email).toBe('');
    expect(issues(createBookingSchema.safeParse({ ...base, client: { name: 'Mariana Gómez', email: 'm@correo.com', phone: '' } })))
      .toEqual({ 'client.phone': 'El celular debe tener 10 dígitos' });
  });

  it('still validates an email when one is given', () => {
    expect(issues(createBookingSchema.safeParse({ ...base, client: { name: 'Mariana Gómez', email: 'mariana@', phone: '3001234567' } })))
      .toEqual({ 'client.email': 'Revisa tu correo, parece que le falta algo' });
    expect(createBookingSchema.parse({ ...base, client: { name: 'M G', email: ' Mariana@Correo.com ', phone: '3001234567' } }).client.email)
      .toBe('mariana@correo.com');
  });
});

describe('joinWaitlistSchema', () => {
  it('keeps the email required (offers only reach the client by email)', () => {
    const result = joinWaitlistSchema.safeParse({ ...base, dates: ['2026-10-22'], client: { name: 'Mariana Gómez', email: '', phone: '3001234567' } });
    expect(issues(result)).toHaveProperty(['client.email']);
  });
});

describe('createAppointmentSchema (pro-created)', () => {
  it('needs only the name; email and phone are optional but validated when present', () => {
    expect(createAppointmentSchema.parse({ serviceId: 'svc1', start: base.start, client: { name: 'Don Jorge' } }).client)
      .toEqual({ name: 'Don Jorge', email: '', phone: '' });
    expect(issues(createAppointmentSchema.safeParse({ serviceId: 'svc1', start: base.start, client: { name: 'Don Jorge', phone: '300' } })))
      .toEqual({ 'client.phone': 'El celular debe tener 10 dígitos' });
  });
});

describe('upsertServiceSchema.durationMin', () => {
  const service = (durationMin: unknown) => upsertServiceSchema.safeParse({ name: 'Valoración', durationMin, priceCop: null });

  it('explains the range and the 5-minute step in Spanish', () => {
    expect(issues(service(0))).toEqual({ durationMin: 'La duración va de 5 a 480 minutos (8 horas).' });
    expect(issues(service(500))).toEqual({ durationMin: 'La duración va de 5 a 480 minutos (8 horas).' });
    expect(issues(service(32))).toEqual({ durationMin: 'La duración va en múltiplos de 5 minutos.' });
    expect(issues(service(7.5))).toEqual({ durationMin: 'La duración va en múltiplos de 5 minutos.' });
    expect(issues(service('30'))).toEqual({ durationMin: 'La duración va de 5 a 480 minutos (8 horas).' });
    expect(service(45).success).toBe(true);
  });
});
