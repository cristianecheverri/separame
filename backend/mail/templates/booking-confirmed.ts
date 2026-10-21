import { formatDuration } from '../../../shared/format';
import type { ISOInstant } from '../../../shared/time';
import { calendarButtonPair, detailsCard, esc, note, outlineButton, paragraph, renderLayout, stack, type RenderedEmail } from '../layout';
import {
  clientFooter, dayAndTime, firstName, proWithTitle, subjectWhen, textRows, whenLong, whereText, type ProInfo,
} from './common';

/** Client confirmation (mockup: email-booking-confirmed.dc.html). Sent with the .ics attached. */

export interface BookingEmailData {
  siteUrl: string;
  clientName: string;
  pro: ProInfo;
  serviceName: string;
  durationMin: number;
  start: ISOInstant;
  manageUrl: string;
  googleUrl: string;
  outlookUrl: string;
  /** When the 24 h reminder goes out; null when there won't be one. */
  reminderAt: ISOInstant | null;
}

export function bookingRows(d: Pick<BookingEmailData, 'pro' | 'serviceName' | 'durationMin' | 'start'>): [string, string][] {
  return [
    ['Con', proWithTitle(d.pro)],
    ['Servicio', `${d.serviceName} · ${formatDuration(d.durationMin)}`],
    ['Cuándo', whenLong(d.start)],
    ['Dónde', whereText(d.pro)],
  ];
}

export function calendarBlock(d: Pick<BookingEmailData, 'googleUrl' | 'outlookUrl' | 'siteUrl'>): string {
  // Logos are PNGs published with the booking site (frontend/booking/public/email).
  const icon = (name: string) => `${d.siteUrl.replace(/\/$/, '')}/email/${name}.png`;
  return stack([
    paragraph('Agrégala a tu calendario', { bold: true }),
    calendarButtonPair(
      { href: d.googleUrl, label: 'Google Calendar', iconUrl: icon('google-calendar') },
      { href: d.outlookUrl, label: 'Outlook', iconUrl: icon('outlook') },
    ),
    paragraph('¿Usas otro calendario? Abre el archivo .ics adjunto.', { muted: true, size: 13 }),
  ], 10);
}

export function manageBlock(manageUrl: string): string {
  return stack([
    paragraph('¿Te salió algo? Cambia o cancela tu cita aquí, sin crear cuenta:'),
    outlineButton(manageUrl, 'Cancelar o reprogramar'),
  ], 8);
}

export function reminderNote(reminderAt: ISOInstant | null): { html: string; text: string } {
  if (!reminderAt) return { html: '', text: '' };
  const when = dayAndTime(reminderAt);
  return {
    html: note(`Te mandamos un recordatorio el <strong>${esc(when)}</strong>, un día antes.`),
    text: `Te mandamos un recordatorio el ${when}, un día antes.`,
  };
}

export function bookingConfirmedEmail(d: BookingEmailData): RenderedEmail {
  const subject = `Cita confirmada · ${subjectWhen(d.start)} · ${d.pro.name}`;
  const heading = `¡Listo, ${firstName(d.clientName)}! Tu cita quedó separada.`;
  const rows = bookingRows(d);
  const reminder = reminderNote(d.reminderAt);
  const footer = clientFooter(d.siteUrl, d.pro.slug);
  const html = renderLayout({
    title: subject,
    preheader: `${whenLong(d.start)} con ${d.pro.name}.`,
    heading,
    body: stack([detailsCard(rows), calendarBlock(d), reminder.html, manageBlock(d.manageUrl)]),
    footer: footer.html,
  });
  const text = [
    heading,
    textRows(rows),
    `Agrégala a tu calendario:\nGoogle Calendar: ${d.googleUrl}\nOutlook: ${d.outlookUrl}\n¿Usas otro calendario? Abre el archivo .ics adjunto.`,
    reminder.text,
    `¿Te salió algo? Cambia o cancela tu cita aquí, sin crear cuenta:\n${d.manageUrl}`,
    footer.text,
  ].filter(Boolean).join('\n\n');
  return { subject, html, text };
}
