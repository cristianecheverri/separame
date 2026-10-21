import { formatDuration, formatServicePrice } from '../../../shared/format';
import type { ISOInstant } from '../../../shared/time';
import type { PriceDisplay } from '../../../shared/types';
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
  /** Snapshot of the service's price option; `hidden` drops the "Precio" row. */
  priceDisplay?: PriceDisplay;
  start: ISOInstant;
}

const formatPhone = (phone: string) => (/^\d{10}$/.test(phone) ? `${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}` : phone);

/** Contact rows only for what the client gave (pro-created appointments may have neither). */
const contactRows = (client: ProNewBookingData['client']): [string, string][] => [
  ...(client.phone ? [['Celular', formatPhone(client.phone)] as [string, string]] : []),
  ...(client.email ? [['Correo', client.email] as [string, string]] : []),
];

export function proNewBookingEmail(d: ProNewBookingData): RenderedEmail {
  const subject = `Nueva cita · ${subjectWhen(d.start)} · ${d.client.name}`;
  const heading = 'Tienes una cita nueva';
  const rows: [string, string][] = [
    ['Cliente', d.client.name],
    ...contactRows(d.client),
    ['Servicio', `${d.serviceName} · ${formatDuration(d.durationMin)}`],
    ['Precio', formatServicePrice(d)],
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
