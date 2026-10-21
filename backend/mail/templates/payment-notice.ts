import { formatCop, formatDateShort } from '../../../shared/format';
import { bogotaDate } from '../../../shared/time';
import type { Payment, PriceVersion, ProProfile } from '../../../shared/types';
import { detailsCard, esc, note, outlineButton, paragraph, pillButton, renderLayout, stack, type RenderedEmail } from '../layout';
import { firstName, proFooter, textRows } from './common';
import { METHOD_LABELS } from './manual-payment-receipt';

/** "Ya pagué" flow: alert to the operator, receipt of the notice and rejection, both to the professional. */

const monthsLabel = (months: number | null) => (months === 1 ? '1 mes' : `${months ?? '—'} meses`);

export function noticeAdminEmail(d: { siteUrl: string; profile: ProProfile; payment: Payment; price: PriceVersion }): RenderedEmail {
  const subject = `Nuevo aviso de pago · ${d.profile.name} · ${d.price.name}`;
  const heading = 'Nuevo aviso de pago';
  const reviewUrl = `${d.siteUrl}/app/admin/pros/${encodeURIComponent(d.profile.id)}`;
  const rows: [string, string][] = [
    ['Profesional', d.profile.name],
    ['Correo', d.profile.email],
    ['Plan', `${d.price.name} · ${monthsLabel(d.payment.months)}`],
    ['Monto', formatCop(d.payment.amountCop)],
    ['Método', METHOD_LABELS[d.payment.method]],
    ['Referencia', d.payment.reference],
  ];
  const intro = `${d.profile.name} dice que ya pagó. Revisa que el dinero haya llegado y aprueba o rechaza el aviso.`;
  const footer = proFooter(d.siteUrl);
  const html = renderLayout({
    title: subject,
    preheader: intro,
    heading,
    body: stack([paragraph(esc(intro)), detailsCard(rows), pillButton(reviewUrl, 'Revisar el aviso')]),
    footer: footer.html,
  });
  return { subject, html, text: [heading, intro, textRows(rows), `Revisar: ${reviewUrl}`].join('\n\n') };
}

export function noticeReceivedEmail(d: { siteUrl: string; name: string; payment: Payment }): RenderedEmail {
  const subject = 'Recibimos tu aviso de pago';
  const heading = 'Recibimos tu aviso, te confirmamos pronto';
  const rows: [string, string][] = [
    ['Paquete', monthsLabel(d.payment.months)],
    ['Monto', formatCop(d.payment.amountCop)],
    ['Método', METHOD_LABELS[d.payment.method]],
    ['Referencia', d.payment.reference],
  ];
  const intro = `Hola, ${firstName(d.name)}. Vamos a verificar tu pago y te escribimos apenas tu plan quede activo, normalmente el mismo día.`;
  const billingUrl = `${d.siteUrl}/app/billing`;
  const footer = proFooter(d.siteUrl);
  const html = renderLayout({
    title: subject,
    preheader: intro,
    heading,
    body: stack([paragraph(esc(intro)), detailsCard(rows), outlineButton(billingUrl, 'Ver mi plan')]),
    footer: footer.html,
  });
  return { subject, html, text: [heading, intro, textRows(rows), `Ver mi plan: ${billingUrl}`, footer.text].join('\n\n') };
}

export function noticeRejectedEmail(d: { siteUrl: string; name: string; payment: Payment }): RenderedEmail {
  const subject = 'No pudimos confirmar tu pago';
  const heading = 'No pudimos confirmar tu pago';
  const when = formatDateShort(bogotaDate(d.payment.createdAt));
  const intro = `Hola, ${firstName(d.name)}. Revisamos tu aviso del ${when} por ${formatCop(d.payment.amountCop)} y no lo pudimos confirmar.`;
  const reason = d.payment.rejectReason ?? '';
  const billingUrl = `${d.siteUrl}/app/billing`;
  const footer = proFooter(d.siteUrl);
  const html = renderLayout({
    title: subject,
    preheader: intro,
    heading,
    body: stack([
      paragraph(esc(intro)),
      reason ? note(`<strong>Motivo:</strong> ${esc(reason)}`) : '',
      paragraph('Si ya pagaste, responde este correo con el comprobante y lo revisamos de nuevo.'),
      pillButton(billingUrl, 'Ver mi plan'),
    ]),
    footer: footer.html,
  });
  const text = [heading, intro, reason ? `Motivo: ${reason}` : '', 'Si ya pagaste, responde este correo con el comprobante.', `Ver mi plan: ${billingUrl}`, footer.text]
    .filter(Boolean).join('\n\n');
  return { subject, html, text };
}
