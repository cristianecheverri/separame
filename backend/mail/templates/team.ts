import { formatCop } from '../../../shared/format';
import type { ProProfile, TeamRequest } from '../../../shared/types';
import { detailsCard, esc, note, paragraph, pillButton, renderLayout, stack, type RenderedEmail } from '../layout';
import { greetingName, proFooter, textRows } from './common';

/** Team plan: request alert to the operator, and approval / rejection to the owner. */

const additional = (n: number) => (n === 1 ? '1 profesional adicional' : `${n} profesionales adicionales`);

export function teamRequestAdminEmail(d: { siteUrl: string; profile: ProProfile; request: TeamRequest }): RenderedEmail {
  const subject = `Solicitud de plan para equipos · ${d.request.name}`;
  const heading = 'Nueva solicitud de plan para equipos';
  const reviewUrl = `${d.siteUrl}/app/admin/teams`;
  const rows: [string, string][] = [
    ['Consultorio', d.request.name],
    ['Profesional', `${d.profile.name} · ${d.profile.title}`],
    ['Correo', d.profile.email],
    ['Profesionales', `${d.request.professionals} (${additional(d.request.professionals - 1)})`],
    ['Mensaje', d.request.message || '—'],
  ];
  const intro = `${d.profile.name} pide el plan para equipos. Apruébalo con los cupos que correspondan o recházalo con un motivo.`;
  const footer = proFooter(d.siteUrl);
  const html = renderLayout({
    title: subject,
    preheader: intro,
    heading,
    body: stack([paragraph(esc(intro)), detailsCard(rows), pillButton(reviewUrl, 'Revisar la solicitud')]),
    footer: footer.html,
  });
  return { subject, html, text: [heading, intro, textRows(rows), `Revisar: ${reviewUrl}`].join('\n\n') };
}

export function teamApprovedEmail(d: {
  siteUrl: string;
  name: string;
  teamName: string;
  teamUrl: string;
  seats: number;
  extraProfessionalCop: number | null;
}): RenderedEmail {
  const subject = 'Tu plan para equipos está listo';
  const heading = `¡Listo, ${d.teamName} ya es un equipo!`;
  const intro = `Hola, ${greetingName(d.name)}. Aprobamos tu solicitud con ${additional(d.seats)}. Ya puedes agregarlos en «Equipo» y manejar sus agendas desde tu cuenta.`;
  const price = d.extraProfessionalCop
    ? `Cada profesional adicional suma ${formatCop(d.extraProfessionalCop)} al mes a tu plan desde tu próxima renovación.`
    : 'El valor por profesional adicional se suma a tu plan desde tu próxima renovación.';
  const rows: [string, string][] = [
    ['Página del consultorio', d.teamUrl.replace(/^https?:\/\//, '')],
    ['Cupos', additional(d.seats)],
  ];
  const teamUrl = `${d.siteUrl}/app/team`;
  const footer = proFooter(d.siteUrl);
  const html = renderLayout({
    title: subject,
    preheader: intro,
    heading,
    body: stack([paragraph(esc(intro)), detailsCard(rows), paragraph(esc(price), { muted: true }), pillButton(teamUrl, 'Ir a mi equipo')]),
    footer: footer.html,
  });
  return { subject, html, text: [heading, intro, textRows(rows), price, `Ir a mi equipo: ${teamUrl}`, footer.text].join('\n\n') };
}

export function teamRejectedEmail(d: { siteUrl: string; name: string; teamName: string; reason: string }): RenderedEmail {
  const subject = 'Sobre tu solicitud de plan para equipos';
  const heading = 'No pudimos aprobar tu solicitud';
  const intro = `Hola, ${greetingName(d.name)}. Revisamos la solicitud de ${d.teamName} y por ahora no la pudimos aprobar. Tu agenda sigue igual.`;
  const agendaUrl = `${d.siteUrl}/app/`;
  const footer = proFooter(d.siteUrl);
  const html = renderLayout({
    title: subject,
    preheader: intro,
    heading,
    body: stack([
      paragraph(esc(intro)),
      note(`<strong>Motivo:</strong> ${esc(d.reason)}`),
      paragraph('Si quieres, envía otra solicitud desde tu agenda o responde este correo.'),
      pillButton(agendaUrl, 'Ir a mi agenda'),
    ]),
    footer: footer.html,
  });
  const text = [heading, intro, `Motivo: ${d.reason}`, 'Si quieres, envía otra solicitud desde tu agenda o responde este correo.', `Ir a mi agenda: ${agendaUrl}`, footer.text].join('\n\n');
  return { subject, html, text };
}
