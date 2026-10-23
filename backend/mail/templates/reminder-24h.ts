import { formatInstantTime } from '../../../shared/format';
import type { ClientConfirmation } from '../../../shared/types';
import { detailsCard, esc, outlineButton, paragraph, pillButton, type RenderedEmail, renderLayout, sentence, stack } from '../layout';
import { bookingRows, type BookingEmailData } from './booking-confirmed';
import { clientFooter, firstName, subjectWhen, textRows, whenLong } from './common';

/**
 * 24 h reminder to the client (sent by jobs-tick, even if the pro's plan
 * expired). Asks "¿Confirmas tu asistencia?" with a "Sí, voy" pill
 * (`/c/<token>?action=confirm`) unless the client already confirmed.
 */

export type ReminderData = Pick<BookingEmailData, 'siteUrl' | 'clientName' | 'pro' | 'serviceName' | 'durationMin' | 'start' | 'manageUrl'> & {
  confirmUrl: string;
  clientConfirmation: ClientConfirmation;
};

export function reminderEmail(d: ReminderData): RenderedEmail {
  const confirmed = d.clientConfirmation === 'confirmed';
  const subject = confirmed
    ? `Recordatorio: tu cita es mañana · ${subjectWhen(d.start)} · ${d.pro.name}`
    : `¿Confirmas tu asistencia? · ${subjectWhen(d.start)} · ${d.pro.name}`;
  const heading = confirmed ? `${firstName(d.clientName)}, tu cita es mañana.` : '¿Confirmas tu asistencia?';
  const rows = bookingRows(d);
  const footer = clientFooter(d.siteUrl, d.pro.slug);
  const intro = confirmed
    ? `${sentence(`Te esperamos mañana a las ${formatInstantTime(d.start)}`)} Gracias por confirmar.`
    : `Hola, ${firstName(d.clientName)}. ${sentence(`Tu cita es mañana a las ${formatInstantTime(d.start)}`)} Cuéntanos si vas para que ${d.pro.name} te espere.`;
  const html = renderLayout({
    title: subject,
    preheader: `${whenLong(d.start)} con ${d.pro.name}.`,
    heading,
    body: stack([
      paragraph(esc(intro)),
      detailsCard(rows),
      confirmed ? '' : pillButton(d.confirmUrl, 'Sí, voy'),
      outlineButton(d.manageUrl, confirmed ? 'Cancelar o reprogramar' : 'Necesito cancelar o cambiar'),
    ], 16),
    footer: footer.html,
  });
  const text = [
    heading,
    intro,
    textRows(rows),
    confirmed ? '' : `Sí, voy: ${d.confirmUrl}`,
    `${confirmed ? 'Cancelar o reprogramar' : 'Necesito cancelar o cambiar'}: ${d.manageUrl}`,
    footer.text,
  ].filter(Boolean).join('\n\n');
  return { subject, html, text };
}
