import { formatDateShort } from '../../../shared/format';
import { referralLinkLabel, type ReferralRewardOutcome } from '../../../shared/referrals';
import { bogotaDate, type ISOInstant } from '../../../shared/time';
import { detailsCard, esc, link, note, paragraph, pillButton, renderLayout, stack, type RenderedEmail } from '../layout';
import { greetingName, proFooter, textRows } from './common';

/**
 * "¡Ganaste un mes gratis!" — to the referrer when an account that signed up with their link makes
 * its first qualifying payment (mockups/proposals/referral-email-month-earned.dc.html). Two variants:
 * the month was added to the plan, or the plan is expired and the month is saved for the next payment.
 */

export interface ReferralRewardData {
  siteUrl: string;
  name: string;
  referred: { name: string; title: string };
  paidMonths: number;
  paidAt: ISOInstant;
  outcome: ReferralRewardOutcome;
  /** The referrer's accessUntil before the reward (the "Venció el …" date when saved). */
  previousAccessUntil: ISOInstant;
  /** Months saved in total after this one (saved variant). */
  savedMonths: number;
  referralUrl: string;
}

const shortDate = (instant: ISOInstant) => formatDateShort(bogotaDate(instant));
const months = (n: number) => (n === 1 ? '1 mes' : `${n} meses`);

export function referralRewardEmail(d: ReferralRewardData): RenderedEmail {
  const saved = d.outcome.kind === 'saved';
  const newUntil = d.outcome.kind === 'applied' ? shortDate(d.outcome.paidUntil) : '';
  const subject = saved ? '¡Ganaste un mes gratis! · Lo guardamos para tu próximo pago' : `¡Ganaste un mes gratis! · Tu plan ahora vence el ${newUntil}`;
  const heading = '¡Ganaste un mes gratis!';
  const intro = `Hola, ${greetingName(d.name)}. ${d.referred.name} se registró con tu enlace y pagó su primer plan. Gracias por recomendar Sepárame: ${
    saved ? 'te ganaste 1 mes gratis.' : 'sumamos 1 mes al final de tu periodo actual.'
  }`;
  const rows: [string, string][] = [
    ['Invitaste a', d.referred.title ? `${d.referred.name} · ${d.referred.title}` : d.referred.name],
    ['Pagó', `Plan ${months(d.paidMonths)} · ${shortDate(d.paidAt)}`],
    ...(d.outcome.kind === 'applied'
      ? ([['Vencía', shortDate(d.outcome.previousUntil)], ['Tu plan ahora vence el', newUntil]] as [string, string][])
      : ([['Tu plan', `Venció el ${shortDate(d.previousAccessUntil)}`], ['Meses guardados', months(Math.max(1, d.savedMonths))]] as [string, string][])),
  ];
  const savedNote = 'Guardamos tu mes: se aplica en tu próximo pago.';
  const savedNoteRest = 'Cuando renueves, lo sumamos al final del plan que elijas.';
  const keepInviting = 'Sigue invitando: por cada profesional que pague su primer plan con tu enlace, ganas otro mes.';
  const billingUrl = `${d.siteUrl}/app/billing`;
  const linkLabel = referralLinkLabel(d.referralUrl);
  const footer = proFooter(d.siteUrl);
  const html = renderLayout({
    title: subject,
    preheader: intro,
    heading,
    body: stack([
      paragraph(esc(intro)),
      detailsCard(rows),
      saved ? note(`<strong>${esc(savedNote)}</strong> ${esc(savedNoteRest)}`) : '',
      pillButton(billingUrl, 'Ver mi suscripción'),
      stack([paragraph(esc(keepInviting), { size: 14 }), paragraph(`<strong>${link(d.referralUrl, linkLabel)}</strong>`, { size: 14 })], 6),
    ]),
    footer: footer.html,
  });
  const text = [
    heading,
    intro,
    textRows(rows),
    saved ? `${savedNote} ${savedNoteRest}` : '',
    `Ver mi suscripción: ${billingUrl}`,
    `${keepInviting}\n${d.referralUrl}`,
    footer.text,
  ].filter(Boolean).join('\n\n');
  return { subject, html, text };
}
