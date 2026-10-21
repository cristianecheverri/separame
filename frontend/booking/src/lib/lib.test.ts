import { describe, expect, it } from 'vitest';
import type { BookingSummary } from '@shared/api';
import { eventFromBooking, googleCalendarUrl, icsContent, outlookCalendarUrl } from './calendar';
import { manageTokenFromLocation, readEmbeddedData, slugFromLocation } from './bootstrap';
import { monthLabel, splitSlots } from './slots';
import { formatPhone, fullAddress, normalizePhone, placeLine, telHref } from './text';
import { fieldsFromApi, isContactFilled, validateContact } from './validation';

describe('validateContact', () => {
  const ok = { name: 'Mariana Gómez', email: 'mariana@correo.com', phone: '300 123 4567', agree: true };

  it('accepts a valid contact (spaces and +57 in the phone are fine)', () => {
    expect(validateContact(ok)).toEqual({});
    expect(validateContact({ ...ok, phone: '+57 300-123-4567' })).toEqual({});
  });

  it('mirrors the backend rules and messages', () => {
    expect(validateContact({ name: 'M', email: 'mariana@correo', phone: '300 123', agree: false })).toEqual({
      name: 'Escribe tu nombre completo',
      email: 'Revisa tu correo, parece que le falta algo',
      phone: 'El celular debe tener 10 dígitos',
      agree: 'Debes autorizar el tratamiento de tus datos',
    });
  });

  it('knows when every field has something', () => {
    expect(isContactFilled(ok)).toBe(true);
    expect(isContactFilled({ ...ok, agree: false })).toBe(false);
  });

  it('maps API field errors onto the form', () => {
    expect(fieldsFromApi({ 'client.email': 'Correo inválido', consent: 'x', start: 'y' })).toEqual({ email: 'Correo inválido', agree: 'x' });
  });
});

describe('text helpers', () => {
  it('builds the place line and the full address from the neighbourhood', () => {
    expect(placeLine({ neighborhood: 'El Poblado', city: 'Medellín' })).toBe('El Poblado, Medellín');
    expect(placeLine({ neighborhood: '', city: 'Cali' })).toBe('Cali');
    const place = { address: 'Cra. 43A #1-50, consultorio 302', neighborhood: 'El Poblado', city: 'Medellín' };
    expect(fullAddress(place, false)).toBe('Cra. 43A #1-50, consultorio 302, El Poblado');
    expect(fullAddress(place, true)).toBe('Cra. 43A #1-50, consultorio 302, El Poblado, Medellín');
  });

  it('formats and normalises phones', () => {
    expect(formatPhone('6044441234')).toBe('604 444 1234');
    expect(normalizePhone('+57 (300) 123-4567')).toBe('3001234567');
    expect(telHref('604 444 1234')).toBe('tel:+576044441234');
  });
});

describe('slots helpers', () => {
  it('splits morning and afternoon at noon Bogotá', () => {
    const slots = ['2026-10-22T13:00:00.000Z', '2026-10-22T16:30:00.000Z', '2026-10-22T17:00:00.000Z'];
    expect(splitSlots(slots)).toEqual({ morning: slots.slice(0, 2), afternoon: slots.slice(2) });
  });

  it('labels weeks that span two months', () => {
    expect(monthLabel(['2026-10-20', '2026-10-26'])).toBe('Octubre 2026');
    expect(monthLabel(['2026-10-27', '2026-11-02'])).toBe('Octubre – Noviembre 2026');
  });
});

describe('calendar links', () => {
  const booking: BookingSummary = {
    appointmentId: 'a1', status: 'confirmed', start: '2026-10-22T15:00:00.000Z', end: '2026-10-22T15:30:00.000Z',
    serviceId: 's1', serviceName: 'Valoración', durationMin: 30, priceCop: 60000,
    client: { name: 'Mariana Gómez', email: 'mariana@correo.com' },
    pro: {
      slug: 'dra', name: 'Dra. Laura Pérez', title: 'Odontóloga', address: 'Cra. 43A #1-50', neighborhood: 'El Poblado',
      city: 'Medellín', phone: null, initials: 'LP',
    },
  };
  const event = eventFromBooking(booking, 'https://separame.app/c/tok');

  it('builds a Google Calendar template link', () => {
    const url = new URL(googleCalendarUrl(event));
    expect(url.searchParams.get('dates')).toBe('20261022T150000Z/20261022T153000Z');
    expect(url.searchParams.get('text')).toBe('Valoración · Dra. Laura Pérez');
  });

  it('builds an Outlook deeplink', () => {
    const url = new URL(outlookCalendarUrl(event));
    expect(url.searchParams.get('rru')).toBe('addevent');
    expect(url.searchParams.get('startdt')).toBe('2026-10-22T15:00:00.000Z');
  });

  it('writes a valid .ics', () => {
    const ics = icsContent(event, new Date('2026-10-20T12:00:00Z'));
    expect(ics).toContain('DTSTART:20261022T150000Z');
    expect(ics).toContain('LOCATION:Cra. 43A #1-50\\, El Poblado\\, Medellín');
    expect(ics.split('\r\n').every((line) => line.length <= 75)).toBe(true);
  });
});

describe('bootstrap', () => {
  it('reads the embedded profile and config', () => {
    document.body.innerHTML = '<script type="application/json" id="separame-data">{"profile":{"slug":"dra"},"config":{"apiUrl":"https://x"}}</script>';
    const data = readEmbeddedData();
    expect(data.profile?.slug).toBe('dra');
    expect(data.config.apiUrl).toBe('https://x');
    document.body.innerHTML = '';
    expect(readEmbeddedData()).toEqual({ profile: null, config: {} });
  });

  it('derives the slug and the manage token from the URL', () => {
    expect(slugFromLocation({ pathname: '/dra-laura-perez', search: '' })).toBe('dra-laura-perez');
    expect(slugFromLocation({ pathname: '/_templates/booking.html', search: '?slug=otro' })).toBe('otro');
    expect(manageTokenFromLocation({ pathname: '/c/abc.def' })).toBe('abc.def');
    expect(manageTokenFromLocation({ pathname: '/dra' })).toBeNull();
  });
});
