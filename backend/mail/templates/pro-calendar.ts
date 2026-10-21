import { formatDuration } from '../../../shared/format';
import type { ISOInstant } from '../../../shared/time';
import { detailsCard, paragraph, renderLayout, stack, type RenderedEmail } from '../layout';
import { proFooter, subjectWhen, textRows, whenLong } from './common';

/**
 * Short line-A emails that carry the calendar invitation when the pro made
 * the change himself (otherwise the invite rides on the regular pro email).
 */

export type ProCalendarKind = 'added' | 'updated' | 'removed';

const COPY: Record<ProCalendarKind, { title: string; intro: string }> = {
  added: { title: 'Agregamos esta cita a tu calendario', intro: 'Abre la invitación adjunta para verla en tu calendario.' },
  updated: { title: 'Actualizamos esta cita en tu calendario', intro: 'La invitación adjunta trae la nueva fecha y hora.' },
  removed: { title: 'Quitamos esta cita de tu calendario', intro: 'La cita se canceló; la invitación adjunta la quita de tu calendario.' },
};

export function proCalendarEmail(d: {
  siteUrl: string; kind: ProCalendarKind; clientName: string; serviceName: string; durationMin: number; start: ISOInstant;
}): RenderedEmail {
  const copy = COPY[d.kind];
  const subject = `${copy.title} · ${subjectWhen(d.start)} · ${d.clientName}`;
  const rows: [string, string, { strike?: boolean }?][] = [
    ['Cliente', d.clientName],
    ['Servicio', `${d.serviceName} · ${formatDuration(d.durationMin)}`],
    ['Cuándo', whenLong(d.start), { strike: d.kind === 'removed' }],
  ];
  const footer = proFooter(d.siteUrl);
  const html = renderLayout({
    title: subject,
    preheader: copy.intro,
    heading: copy.title,
    body: stack([paragraph(copy.intro), detailsCard(rows)]),
    footer: footer.html,
  });
  return { subject, html, text: [copy.title, copy.intro, textRows(rows.map(([k, v]) => [k, v])), footer.text].join('\n\n') };
}
