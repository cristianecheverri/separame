import { formatCop, formatDateShort, formatDayLongWithYear } from '../../../shared/format';
import { bogotaDate, type ISOInstant } from '../../../shared/time';
import type { Payment, PriceVersion } from '../../../shared/types';
import { detailsCard, esc, outlineButton, paragraph, renderLayout, stack, type RenderedEmail } from '../layout';
import { firstName, proFooter, textRows } from './common';

/** Optional receipt when the admin records a payment or approves a "Ya pagué" notice. */

export interface ManualReceiptData {
  siteUrl: string;
  name: string;
  payment: Payment;
  price: PriceVersion;
  /** Months saved from referrals that were added after this payment (0/undefined = none). */
  referralMonths?: number;
  /** Final access date when referral months were added (defaults to the payment's `until`). */
  accessUntil?: ISOInstant;
}

export const METHOD_LABELS: Record<Payment['method'], string> = {
  transfer: 'Transferencia',
  nequi: 'Nequi',
  cash: 'Efectivo',
  courtesy: 'Cortesía',
  card: 'Tarjeta',
  pse: 'PSE',
};

export function manualPaymentReceiptEmail(d: ManualReceiptData): RenderedEmail {
  const extra = d.referralMonths ?? 0;
  const finalUntil = extra > 0 && d.accessUntil ? d.accessUntil : d.payment.until;
  const until = finalUntil ? formatDayLongWithYear(bogotaDate(finalUntil)) : '';
  const subject = `Pago registrado · tu agenda está activa hasta el ${until}`;
  const heading = '¡Gracias! Tu agenda está activa.';
  const rows: [string, string][] = [
    ['Método', METHOD_LABELS[d.payment.method]],
    ['Monto', d.payment.method === 'courtesy' ? 'Sin cobro' : formatCop(d.payment.amountCop)],
    ['Fecha del pago', formatDateShort(bogotaDate(d.payment.paidAt))],
    ['Referencia', d.payment.reference],
    ['Plan', d.price.monthlyCop ? `${d.price.name} · ${formatCop(d.price.monthlyCop)}/mes` : d.price.name],
    ['Meses gratis por referidos', extra > 0 ? `+${extra === 1 ? '1 mes' : `${extra} meses`}` : ''],
    ['Vigente hasta', until],
  ];
  const intro = `Hola, ${firstName(d.name)}. Registramos tu pago y tu página ya está recibiendo reservas.`;
  const billingUrl = `${d.siteUrl}/app/billing`;
  const footer = proFooter(d.siteUrl);
  const html = renderLayout({
    title: subject,
    preheader: intro,
    heading,
    body: stack([paragraph(esc(intro)), detailsCard(rows), outlineButton(billingUrl, 'Ver mi suscripción')]),
    footer: footer.html,
  });
  const text = [heading, intro, textRows(rows), `Ver mi suscripción: ${billingUrl}`, footer.text].join('\n\n');
  return { subject, html, text };
}
