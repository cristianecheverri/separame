import { FEEDBACK_KINDS, type FeedbackRequest } from '../../../shared/api';
import type { ProProfile } from '../../../shared/types';
import { detailsCard, esc, paragraph, renderLayout, stack, type RenderedEmail } from '../layout';
import { proFooter, textRows } from './common';

/** «Ayúdanos a mejorar» → the operator. Replying answers the professional (Reply-To). */
export function feedbackAdminEmail(d: { siteUrl: string; profile: ProProfile; feedback: FeedbackRequest; plan: string }): RenderedEmail {
  const kind = FEEDBACK_KINDS.find((k) => k.kind === d.feedback.kind)?.label ?? 'Mensaje';
  const subject = `${kind} · ${d.profile.name}`;
  const heading = `${kind} desde «Ayúdanos a mejorar»`;
  const rows: [string, string][] = [
    ['Profesional', `${d.profile.name} · ${d.profile.title}`],
    ['Correo', d.profile.email],
    ['Enlace', `${d.siteUrl.replace(/^https?:\/\//, '')}/${d.profile.slug}`],
    ['Plan', d.plan],
    ...(d.feedback.page ? [['Estaba en', d.feedback.page] as [string, string]] : []),
  ];
  const intro = 'Responde este correo para contestarle directamente.';
  const footer = proFooter(d.siteUrl);
  const html = renderLayout({
    title: subject,
    preheader: d.feedback.message.slice(0, 120),
    heading,
    body: stack([paragraph(esc(d.feedback.message).replace(/\n/g, '<br>')), detailsCard(rows), paragraph(esc(intro))]),
    footer: footer.html,
  });
  return { subject, html, text: [heading, d.feedback.message, textRows(rows), intro].join('\n\n') };
}
