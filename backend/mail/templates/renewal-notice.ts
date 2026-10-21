import { formatDayLong } from '../../../shared/format';
import { GRACE_DAYS } from '../../../shared/subscription';
import { bogotaDate, type ISOInstant } from '../../../shared/time';
import { esc, note, paragraph, pillButton, renderLayout, stack, type RenderedEmail } from '../layout';
import { firstName, proFooter } from './common';

/** Sent RENEWAL_NOTICE_DAYS before accessUntil (trial end or paid period end). */

export interface RenewalNoticeData {
  siteUrl: string;
  name: string;
  accessUntil: ISOInstant;
  isTrial: boolean;
}

export function renewalNoticeEmail(d: RenewalNoticeData): RenderedEmail {
  const day = formatDayLong(bogotaDate(d.accessUntil));
  const subject = d.isTrial ? `Tu prueba gratis termina el ${day}` : `Tu plan de Sepárame vence el ${day}`;
  const heading = 'Sigue recibiendo citas sin parar';
  const billingUrl = `${d.siteUrl}/app/billing`;
  const intro = d.isTrial
    ? `Hola, ${firstName(d.name)}. Tu prueba gratis termina el ${day}. Elige un plan para que tu página siga recibiendo reservas: pagas por Nequi o transferencia y nos avisas con «Ya pagué».`
    : `Hola, ${firstName(d.name)}. Tu plan vence el ${day}. Renueva pagando por Nequi o transferencia y avísanos con «Ya pagué» desde tu panel.`;
  const grace = `Tienes ${GRACE_DAYS} días de gracia con todo funcionando. Después, tu página dice «Agenda no disponible temporalmente» y nadie puede reservar. Tus citas ya agendadas siguen en pie, con recordatorio.`;
  const footer = proFooter(d.siteUrl);
  const html = renderLayout({
    title: subject,
    preheader: intro,
    heading,
    body: stack([paragraph(esc(intro)), pillButton(billingUrl, d.isTrial ? 'Elegir mi plan' : 'Renovar ahora'), note(esc(grace))]),
    footer: footer.html,
  });
  const text = [heading, intro, `Renovar: ${billingUrl}`, grace, footer.text].join('\n\n');
  return { subject, html, text };
}
