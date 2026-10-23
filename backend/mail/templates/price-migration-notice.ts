import { formatCop, MONTH_NAMES } from '../../../shared/format';
import type { ISODate } from '../../../shared/time';
import { esc, paragraph, renderLayout, stack, type RenderedEmail } from '../layout';
import { greetingName, proFooter } from './common';

/** Price change notice, sent MIGRATION_NOTICE_DAYS before it takes effect (mockup: admin-prices). */

export interface MigrationNoticeData {
  siteUrl: string;
  name: string;
  effectiveDate: ISODate;
  fromMonthlyCop: number | null;
  toMonthlyCop: number | null;
}

/** "1 de diciembre". */
const dayMonth = (date: ISODate) => `${Number(date.slice(8, 10))} de ${MONTH_NAMES[Number(date.slice(5, 7)) - 1]}`;

export function priceMigrationNoticeEmail(d: MigrationNoticeData): RenderedEmail {
  const when = dayMonth(d.effectiveDate);
  const subject = `Tu precio en Sepárame cambia el ${when}`;
  const heading = subject;
  const body = `Hola, ${greetingName(d.name)}. Desde tu renovación del ${when}, tu plan pasa de ${formatCop(d.fromMonthlyCop)} a ${formatCop(d.toMonthlyCop)} al mes. Hasta esa fecha todo sigue igual. Si tienes dudas, responde este correo.`;
  const footer = proFooter(d.siteUrl);
  const html = renderLayout({ title: subject, preheader: body, heading, body: stack([paragraph(esc(body))]), footer: footer.html });
  return { subject, html, text: [heading, body, footer.text].join('\n\n') };
}
