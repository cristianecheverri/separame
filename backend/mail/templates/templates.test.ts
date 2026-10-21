import { describe, expect, it } from 'vitest';
import type { Payment, PriceVersion } from '../../../shared/types';
import { accountCodeEmail, adminInviteEmail } from './account-code';
import { bookingConfirmedEmail, type BookingEmailData } from './booking-confirmed';
import { bookingChangedEmail } from './booking-changed';
import { clientCancelledEmail, proCancelledEmail } from './booking-cancelled';
import { manualPaymentReceiptEmail } from './manual-payment-receipt';
import { priceMigrationNoticeEmail } from './price-migration-notice';
import { proNewBookingEmail } from './pro-new-booking';
import { reminderEmail } from './reminder-24h';
import { renewalNoticeEmail } from './renewal-notice';

const pro = { name: 'Dra. Laura Pérez', title: 'Odontóloga', neighborhood: 'El Poblado', address: 'Cra. 43A #1-50, consultorio 302', city: 'Medellín', slug: 'dra-laura-perez' };
const data: BookingEmailData = {
  siteUrl: 'https://separame.app',
  clientName: 'Mariana Gómez',
  pro,
  serviceName: 'Valoración',
  durationMin: 30,
  start: '2026-10-22T15:00:00.000Z',
  manageUrl: 'https://separame.app/c/tok.sig',
  googleUrl: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=x',
  outlookUrl: 'https://outlook.live.com/calendar/0/deeplink/compose?subject=x',
  reminderAt: '2026-10-21T15:00:00.000Z',
};

describe('booking confirmed (mockup copy)', () => {
  const email = bookingConfirmedEmail(data);

  it('uses the mockup subject and heading', () => {
    expect(email.subject).toBe('Cita confirmada · jue 22 oct., 10:00 a. m. · Dra. Laura Pérez');
    expect(email.html).toContain('¡Listo, Mariana! Tu cita quedó separada.');
  });

  it('renders the details card, calendar buttons, reminder note, manage link and Ley 1581 footer', () => {
    expect(email.html).toContain('Dra. Laura Pérez · Odontóloga');
    expect(email.html).toContain('Valoración · 30 min');
    expect(email.html).toContain('Jueves 22 de octubre, 10:00 a. m.');
    expect(email.html).toContain('Cra. 43A #1-50, consultorio 302, El Poblado, Medellín');
    expect(email.html).toContain('Google Calendar');
    expect(email.html).toContain('Outlook');
    expect(email.html).toContain('¿Usas otro calendario? Abre el archivo .ics adjunto.');
    expect(email.html).toContain('Te mandamos un recordatorio el <strong>miércoles 21 a las 10:00 a. m.</strong>, un día antes.');
    expect(email.html).toContain('href="https://separame.app/c/tok.sig"');
    expect(email.html).toContain('Cancelar o reprogramar');
    expect(email.html).toContain('separaste una cita en separame.app/dra-laura-perez');
    expect(email.html).toContain('Ley 1581 de 2012');
    expect(email.html).toContain('href="https://separame.app/privacy"');
    expect(email.html).toContain('href="https://separame.app/privacy#borrar-datos"');
    expect(email.html).toContain('#0B6E4F');
    expect(email.text).toContain('https://separame.app/c/tok.sig');
  });

  it('shows the Google Calendar and Outlook logos (PNG on the site, with empty alt) in the calendar buttons', () => {
    expect(email.html).toContain('src="https://separame.app/email/google-calendar.png"');
    expect(email.html).toContain('src="https://separame.app/email/outlook.png"');
    expect(email.html).toMatch(/<img src="https:\/\/separame\.app\/email\/google-calendar\.png" width="24" height="24" alt=""/);
  });

  it('escapes user-provided text and omits the reminder note when there is none', () => {
    const e = bookingConfirmedEmail({ ...data, clientName: '<script>x</script>', reminderAt: null });
    expect(e.html).not.toContain('<script>x');
    expect(e.html).not.toContain('Te mandamos un recordatorio');
  });
});

describe('other templates', () => {
  it('booking changed shows old and new dates', () => {
    const e = bookingChangedEmail({ ...data, previousStart: '2026-10-21T15:00:00.000Z' });
    expect(e.subject).toBe('Tu cita cambió · jue 22 oct., 10:00 a. m. · Dra. Laura Pérez');
    expect(e.html).toContain('Miércoles 21 de octubre, 10:00 a. m.');
    expect(e.html).toContain('line-through');
  });

  it('cancellation variants', () => {
    const base = { siteUrl: data.siteUrl, pro, clientName: 'Mariana Gómez', serviceName: 'Valoración', durationMin: 30, start: data.start, reason: 'Viaje' };
    expect(clientCancelledEmail(base).subject).toBe('Cita cancelada · jue 22 oct., 10:00 a. m. · Dra. Laura Pérez');
    expect(clientCancelledEmail(base).html).toContain('Separar otra cita');
    const p = proCancelledEmail(base);
    expect(p.subject).toBe('Cita cancelada · jue 22 oct., 10:00 a. m. · Mariana Gómez');
    expect(p.html).toContain('Mariana Gómez canceló su cita');
    expect(p.html).toContain('Viaje');
  });

  it('reminder and pro new booking', () => {
    expect(reminderEmail(data).subject).toBe('Recordatorio: tu cita es mañana · jue 22 oct., 10:00 a. m. · Dra. Laura Pérez');
    const n = proNewBookingEmail({
      siteUrl: data.siteUrl, pro, client: { name: 'Mariana Gómez', email: 'mariana@correo.com', phone: '3001234567' },
      serviceName: 'Valoración', durationMin: 30, priceCop: 60000, start: data.start,
    });
    expect(n.subject).toBe('Nueva cita · jue 22 oct., 10:00 a. m. · Mariana Gómez');
    expect(n.html).toContain('300 123 4567');
    expect(n.html).toContain('$60.000');
  });

  it('renewal notice links to billing', () => {
    const e = renewalNoticeEmail({ siteUrl: data.siteUrl, name: 'Laura', accessUntil: '2026-10-25T15:00:00.000Z', isTrial: true });
    expect(e.subject).toBe('Tu prueba gratis termina el domingo 25 de octubre');
    expect(e.html).toContain('href="https://separame.app/app/billing"');
    expect(e.html).toContain('Agenda no disponible temporalmente');
  });

  it('manual payment receipt', () => {
    const payment: Payment = {
      id: 'p1', proId: 'x', method: 'transfer', status: 'approved', source: 'admin', amountCop: 15000, months: 3, paidAt: '2026-10-20T17:00:00.000Z',
      until: '2027-01-20T15:00:00.000Z', reference: 'Bancolombia #482913', priceVersionId: 'fundador-v1', createdAt: '2026-10-20T17:00:00.000Z',
    };
    const price = { id: 'fundador-v1', name: 'Fundador', monthlyCop: 5000 } as PriceVersion;
    const e = manualPaymentReceiptEmail({ siteUrl: data.siteUrl, name: 'Estudio Lúa', payment, price });
    expect(e.subject).toBe('Pago registrado · tu agenda está activa hasta el miércoles 20 de enero de 2027');
    expect(e.html).toContain('Transferencia');
    expect(e.html).toContain('Fundador · $5.000/mes');
  });

  it('price migration notice (admin-prices mockup copy)', () => {
    const e = priceMigrationNoticeEmail({ siteUrl: data.siteUrl, name: 'Felipe Ríos', effectiveDate: '2026-12-01', fromMonthlyCop: 5900, toMonthlyCop: 7900 });
    expect(e.subject).toBe('Tu precio en Sepárame cambia el 1 de diciembre');
    expect(e.text).toContain('Hola, Felipe. Desde tu renovación del 1 de diciembre, tu plan pasa de $5.900 a $7.900 al mes.');
  });

  it('account emails keep Cognito placeholders verbatim', () => {
    const c = accountCodeEmail({ siteUrl: data.siteUrl, kind: 'confirm', code: '{####}' });
    expect(c.subject).toBe('Confirma tu correo en Sepárame');
    expect(c.html).toContain('{####}');
    const invite = adminInviteEmail({ siteUrl: data.siteUrl, username: '{username}', tempPassword: '{####}' });
    expect(invite.html).toContain('{username}');
    expect(invite.html).toContain('{####}');
    expect(invite.html).toContain('href="https://separame.app/app/login"');
  });
});
