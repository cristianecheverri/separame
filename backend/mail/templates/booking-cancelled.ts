import { formatDuration } from '../../../shared/format';
import type { ISOInstant } from '../../../shared/time';
import { detailsCard, esc, outlineButton, paragraph, pillButton, renderLayout, stack, type RenderedEmail } from '../layout';
import { agendaRows, clientFooter, firstName, proFooter, type ProInfo, proWithTitle, subjectWhen, textRows, whenLong } from './common';

/** Cancellation notices: to the client when the pro cancels, to the pro when the client cancels. */

export interface CancelledData {
  siteUrl: string;
  pro: ProInfo;
  clientName: string;
  serviceName: string;
  durationMin: number;
  start: ISOInstant;
  reason?: string;
}

export function clientCancelledEmail(d: CancelledData): RenderedEmail {
  const subject = `Cita cancelada · ${subjectWhen(d.start)} · ${d.pro.name}`;
  const heading = `${firstName(d.clientName)}, tu cita fue cancelada.`;
  const rows: [string, string, { strike?: boolean }?][] = [
    ['Con', proWithTitle(d.pro)],
    ['Servicio', `${d.serviceName} · ${formatDuration(d.durationMin)}`],
    ['Cuándo', whenLong(d.start), { strike: true }],
    ['Motivo', d.reason ?? ''],
  ];
  const bookUrl = `${d.siteUrl}/${d.pro.slug}`;
  const footer = clientFooter(d.siteUrl, d.pro.slug);
  const intro = `${d.pro.name} canceló tu cita. No te llegarán más recordatorios de esta cita.`;
  const html = renderLayout({
    title: subject,
    preheader: intro,
    heading,
    body: stack([
      paragraph(esc(intro)),
      detailsCard(rows),
      paragraph('Si quieres, separa otra hora cuando te quede bien:'),
      pillButton(bookUrl, 'Separar otra cita'),
    ]),
    footer: footer.html,
  });
  const text = [heading, intro, textRows(rows.map(([k, v]) => [k, v])), `Separar otra cita: ${bookUrl}`, footer.text].join('\n\n');
  return { subject, html, text };
}

export function proCancelledEmail(d: CancelledData): RenderedEmail {
  const subject = `Cita cancelada · ${subjectWhen(d.start)} · ${d.clientName}`;
  const heading = `${d.clientName} canceló su cita`;
  const rows: [string, string, { strike?: boolean }?][] = [
    ...agendaRows(d.pro.agendaOf),
    ['Cliente', d.clientName],
    ['Servicio', `${d.serviceName} · ${formatDuration(d.durationMin)}`],
    ['Cuándo', whenLong(d.start), { strike: true }],
    ['Motivo', d.reason ?? ''],
  ];
  const agendaUrl = `${d.siteUrl}/app/`;
  const footer = proFooter(d.siteUrl);
  const html = renderLayout({
    title: subject,
    preheader: 'El espacio quedó libre para otra persona.',
    heading,
    body: stack([
      paragraph('El espacio quedó libre en tu agenda para otra persona.'),
      detailsCard(rows),
      outlineButton(agendaUrl, 'Ver mi agenda'),
    ]),
    footer: footer.html,
  });
  const text = [heading, 'El espacio quedó libre en tu agenda para otra persona.', textRows(rows.map(([k, v]) => [k, v])), `Ver mi agenda: ${agendaUrl}`, footer.text].join('\n\n');
  return { subject, html, text };
}
