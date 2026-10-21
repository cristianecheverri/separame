import { capitalize, formatDayLong, formatInstantTime } from '../../../shared/format';
import type { ISODate, ISOInstant } from '../../../shared/time';
import { detailsCard, esc, outlineButton, paragraph, pillButton, renderLayout, stack, type RenderedEmail } from '../layout';
import { clientFooter, firstName, proWithTitle, textRows, type ProInfo } from './common';

/** Waitlist emails to the client: joined, and "se liberó un cupo". */

const daysList = (dates: ISODate[]) => dates.map((d) => capitalize(formatDayLong(d))).join(' · ');

export function waitlistJoinedEmail(d: {
  siteUrl: string; clientName: string; pro: ProInfo; serviceName: string; dates: ISODate[]; leaveUrl: string;
}): RenderedEmail {
  const subject = `Te avisaremos si se libera un cupo · ${d.pro.name}`;
  const heading = 'Te avisaremos si se libera un cupo';
  const rows: [string, string][] = [['Con', proWithTitle(d.pro)], ['Servicio', d.serviceName], ['Días', daysList(d.dates)]];
  const intro = `Hola, ${firstName(d.clientName)}. Quedaste en la lista de espera. Si alguien cancela en esos días, te escribimos de inmediato para que separes la hora.`;
  const footer = clientFooter(d.siteUrl, d.pro.slug);
  const html = renderLayout({
    title: subject,
    preheader: intro,
    heading,
    body: stack([
      paragraph(esc(intro)),
      detailsCard(rows),
      paragraph('El primero que separe se queda con la hora. ¿Ya no lo necesitas?', { muted: true, size: 13 }),
      outlineButton(d.leaveUrl, 'Salir de la lista de espera'),
    ]),
    footer: footer.html,
  });
  return { subject, html, text: [heading, intro, textRows(rows), `Salir de la lista de espera: ${d.leaveUrl}`, footer.text].join('\n\n') };
}

export function waitlistOfferEmail(d: {
  siteUrl: string; clientName: string; pro: ProInfo; serviceId: string; serviceName: string; date: ISODate; slots: ISOInstant[]; leaveUrl: string;
}): RenderedEmail {
  const day = formatDayLong(d.date);
  const first = formatInstantTime(d.slots[0]);
  const more = d.slots.length > 1 ? ' (y otras horas)' : '';
  const subject = `Se liberó un cupo el ${day}: ${first}${more}`;
  const heading = '¡Se liberó un cupo!';
  const bookUrl = `${d.siteUrl}/${d.pro.slug}?service=${encodeURIComponent(d.serviceId)}&date=${d.date}`;
  const rows: [string, string][] = [
    ['Con', proWithTitle(d.pro)],
    ['Servicio', d.serviceName],
    ['Día', capitalize(day)],
    ['Horas libres', d.slots.slice(0, 6).map(formatInstantTime).join(' · ') + (d.slots.length > 6 ? '…' : '')],
  ];
  const intro = `Hola, ${firstName(d.clientName)}. Hay espacio el ${day}. El primero que separe se queda con la hora, así que no esperes mucho.`;
  const footer = clientFooter(d.siteUrl, d.pro.slug);
  const html = renderLayout({
    title: subject,
    preheader: `${capitalize(day)}: ${first}${more}`,
    heading,
    body: stack([
      paragraph(esc(intro)),
      detailsCard(rows),
      pillButton(bookUrl, 'Separar mi cita'),
      outlineButton(d.leaveUrl, 'Salir de la lista de espera'),
    ], 16),
    footer: footer.html,
  });
  return {
    subject, html,
    text: [heading, intro, textRows(rows), `Separar mi cita: ${bookUrl}`, `Salir de la lista de espera: ${d.leaveUrl}`, footer.text].join('\n\n'),
  };
}
