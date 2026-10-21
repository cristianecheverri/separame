import { detailsCard, paragraph, renderLayout, stack, type RenderedEmail } from '../layout';
import { bookingRows, manageBlock, type BookingEmailData } from './booking-confirmed';
import { clientFooter, firstName, subjectWhen, textRows, whenLong } from './common';
import { formatInstantTime } from '../../../shared/format';

/** 24 h reminder to the client (sent by jobs-tick, even if the pro's plan expired). */

export type ReminderData = Pick<BookingEmailData, 'siteUrl' | 'clientName' | 'pro' | 'serviceName' | 'durationMin' | 'start' | 'manageUrl'>;

export function reminderEmail(d: ReminderData): RenderedEmail {
  const subject = `Recordatorio: tu cita es mañana · ${subjectWhen(d.start)} · ${d.pro.name}`;
  const heading = `${firstName(d.clientName)}, tu cita es mañana.`;
  const rows = bookingRows(d);
  const footer = clientFooter(d.siteUrl, d.pro.slug);
  const intro = `Te esperamos mañana a las ${formatInstantTime(d.start)}. Si llegas con unos minutos de anticipación, mejor.`;
  const html = renderLayout({
    title: subject,
    preheader: `${whenLong(d.start)} con ${d.pro.name}.`,
    heading,
    body: stack([paragraph(intro), detailsCard(rows), manageBlock(d.manageUrl)]),
    footer: footer.html,
  });
  const text = [heading, intro, textRows(rows), `¿Te salió algo? Cambia o cancela tu cita aquí:\n${d.manageUrl}`, footer.text].join('\n\n');
  return { subject, html, text };
}
