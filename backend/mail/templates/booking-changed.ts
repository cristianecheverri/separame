import { formatDuration } from '../../../shared/format';
import type { ISOInstant } from '../../../shared/time';
import { detailsCard, outlineButton, paragraph, type RenderedEmail, renderLayout, sentence, stack } from '../layout';
import { bookingRows, calendarBlock, manageBlock, reminderNote, type BookingEmailData } from './booking-confirmed';
import { agendaRows, clientFooter, firstName, proFooter, type ProInfo, subjectWhen, textRows, whenLong } from './common';

/** "Tu cita cambió" (client, new .ics) and the professional's notice when the client moved it. */

export interface BookingChangedData extends BookingEmailData {
  previousStart: ISOInstant;
}

export function bookingChangedEmail(d: BookingChangedData): RenderedEmail {
  const subject = `Tu cita cambió · ${subjectWhen(d.start)} · ${d.pro.name}`;
  const heading = `${firstName(d.clientName)}, tu cita cambió.`;
  const rows = bookingRows(d);
  const reminder = reminderNote(d.reminderAt);
  const footer = clientFooter(d.siteUrl, d.pro.slug);
  const card = detailsCard([
    ...rows.slice(0, 2),
    ['Antes', whenLong(d.previousStart), { strike: true }],
    ['Ahora', whenLong(d.start)],
    rows[3],
  ]);
  const html = renderLayout({
    title: subject,
    preheader: sentence(`Nueva fecha: ${whenLong(d.start)}`),
    heading,
    body: stack([
      paragraph('Esta es la nueva fecha de tu cita. Te adjuntamos el archivo actualizado para tu calendario.'),
      card,
      calendarBlock(d),
      reminder.html,
      manageBlock(d.manageUrl),
    ]),
    footer: footer.html,
  });
  const text = [
    heading,
    'Esta es la nueva fecha de tu cita.',
    textRows([...rows.slice(0, 2), ['Antes', whenLong(d.previousStart)], ['Ahora', whenLong(d.start)], rows[3]]),
    `Google Calendar: ${d.googleUrl}\nOutlook: ${d.outlookUrl}`,
    reminder.text,
    `¿Te salió algo? Cambia o cancela tu cita aquí:\n${d.manageUrl}`,
    footer.text,
  ].filter(Boolean).join('\n\n');
  return { subject, html, text };
}

export interface ProBookingChangedData {
  siteUrl: string;
  pro: ProInfo;
  clientName: string;
  serviceName: string;
  durationMin: number;
  start: ISOInstant;
  previousStart: ISOInstant;
}

export function proBookingChangedEmail(d: ProBookingChangedData): RenderedEmail {
  const subject = `Cita movida · ${subjectWhen(d.start)} · ${d.clientName}`;
  const heading = `${d.clientName} movió su cita`;
  const rows: [string, string, { strike?: boolean }?][] = [
    ...agendaRows(d.pro.agendaOf),
    ['Cliente', d.clientName],
    ['Servicio', `${d.serviceName} · ${formatDuration(d.durationMin)}`],
    ['Antes', whenLong(d.previousStart), { strike: true }],
    ['Ahora', whenLong(d.start)],
  ];
  const agendaUrl = `${d.siteUrl}/app/`;
  const footer = proFooter(d.siteUrl);
  const html = renderLayout({
    title: subject,
    preheader: sentence(`Ahora es el ${whenLong(d.start)}`),
    heading,
    body: stack([detailsCard(rows), outlineButton(agendaUrl, 'Ver mi agenda')]),
    footer: footer.html,
  });
  const text = [heading, textRows(rows.map(([k, v]) => [k, v])), `Ver mi agenda: ${agendaUrl}`, footer.text].join('\n\n');
  return { subject, html, text };
}
