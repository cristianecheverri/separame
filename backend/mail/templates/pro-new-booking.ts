import { formatCop, formatDuration } from '../../../shared/format';
import type { ISOInstant } from '../../../shared/time';
import { detailsCard, outlineButton, paragraph, renderLayout, stack, type RenderedEmail } from '../layout';
import { proFooter, subjectWhen, textRows, whenLong, type ProInfo } from './common';

/** "Nueva cita" to the professional when a client books from the public page. */

export interface ProNewBookingData {
  siteUrl: string;
  pro: ProInfo;
  client: { name: string; email: string; phone: string };
  serviceName: string;
  durationMin: number;
  priceCop: number | null;
  start: ISOInstant;
}

const formatPhone = (phone: string) => (/^\d{10}$/.test(phone) ? `${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}` : phone);

export function proNewBookingEmail(d: ProNewBookingData): RenderedEmail {
  const subject = `Nueva cita · ${subjectWhen(d.start)} · ${d.client.name}`;
  const heading = 'Tienes una cita nueva';
  const rows: [string, string][] = [
    ['Cliente', d.client.name],
    ['Celular', formatPhone(d.client.phone)],
    ['Correo', d.client.email],
    ['Servicio', `${d.serviceName} · ${formatDuration(d.durationMin)}`],
    ['Precio', formatCop(d.priceCop)],
    ['Cuándo', whenLong(d.start)],
  ];
  const agendaUrl = `${d.siteUrl}/app/`;
  const footer = proFooter(d.siteUrl);
  const intro = 'Ya quedó en tu agenda y le mandamos la confirmación con recordatorio.';
  const html = renderLayout({
    title: subject,
    preheader: `${d.client.name} separó ${d.serviceName} para el ${whenLong(d.start)}.`,
    heading,
    body: stack([paragraph(intro), detailsCard(rows), outlineButton(agendaUrl, 'Ver mi agenda')]),
    footer: footer.html,
  });
  const text = [heading, intro, textRows(rows), `Ver mi agenda: ${agendaUrl}`, footer.text].join('\n\n');
  return { subject, html, text };
}
