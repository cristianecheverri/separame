import { codeBox, detailsCard, esc, paragraph, pillButton, renderLayout, stack, type RenderedEmail } from '../layout';
import { proFooter } from './common';

/**
 * Cognito account emails (custom message trigger). Sign-in is email +
 * password; Cognito still emails codes to confirm the address, reset the
 * password and invite the admin. `code` / `username` are Cognito's
 * placeholders (`{####}`, `{username}`), replaced by Cognito after the
 * trigger — they must appear verbatim in the HTML.
 */

export type AccountEmailKind = 'confirm' | 'forgot_password' | 'verify_attribute' | 'admin_invite';

export const ACCOUNT_SUBJECTS: Record<AccountEmailKind, string> = {
  confirm: 'Confirma tu correo en Sepárame',
  forgot_password: 'Crea una nueva contraseña',
  verify_attribute: 'Confirma tu nuevo correo en Sepárame',
  admin_invite: 'Te invitamos a administrar Sepárame',
};

const IGNORE = 'Si no fuiste tú, ignora este correo: nadie puede usar tu cuenta sin este código.';

export function accountCodeEmail(d: { siteUrl: string; kind: Exclude<AccountEmailKind, 'admin_invite'>; code: string }): RenderedEmail {
  const copy = {
    confirm: {
      heading: 'Confirma tu correo',
      intro: 'Escribe este código en Sepárame para confirmar tu correo y empezar a armar tu agenda.',
    },
    forgot_password: {
      heading: 'Crea una nueva contraseña',
      intro: 'Escribe este código en Sepárame para crear tu nueva contraseña. Vence en una hora.',
    },
    verify_attribute: {
      heading: 'Confirma tu nuevo correo',
      intro: 'Escribe este código en Sepárame para confirmar tu nuevo correo.',
    },
  }[d.kind];
  const subject = ACCOUNT_SUBJECTS[d.kind];
  const footer = proFooter(d.siteUrl);
  const html = renderLayout({
    title: subject,
    preheader: copy.intro,
    heading: copy.heading,
    body: stack([paragraph(esc(copy.intro)), codeBox(d.code), paragraph(esc(IGNORE), { muted: true, size: 13 })]),
    footer: footer.html,
  });
  return { subject, html, text: `${copy.heading}\n\n${copy.intro}\n\n${d.code}\n\n${IGNORE}\n\n${footer.text}` };
}

export function adminInviteEmail(d: { siteUrl: string; username: string; tempPassword: string }): RenderedEmail {
  const subject = ACCOUNT_SUBJECTS.admin_invite;
  const heading = 'Te invitamos a administrar Sepárame';
  const loginUrl = `${d.siteUrl}/app/login`;
  const intro = 'Ya tienes una cuenta de administración. Entra con estos datos; la primera vez te pediremos crear una contraseña nueva.';
  const footer = proFooter(d.siteUrl);
  const html = renderLayout({
    title: subject,
    preheader: intro,
    heading,
    body: stack([
      paragraph(esc(intro)),
      // Placeholders go in raw (not escaped) so Cognito can substitute them.
      detailsCard([['Usuario', '§USER§'], ['Contraseña temporal', '§PASS§']])
        .replace('§USER§', d.username)
        .replace('§PASS§', d.tempPassword),
      pillButton(loginUrl, 'Entrar a Sepárame'),
      paragraph('La contraseña temporal vence en unos días. Si vence, pide una invitación nueva.', { muted: true, size: 13 }),
    ]),
    footer: footer.html,
  });
  const text = `${heading}\n\n${intro}\n\nUsuario: ${d.username}\nContraseña temporal: ${d.tempPassword}\n\nEntrar: ${loginUrl}\n\n${footer.text}`;
  return { subject, html, text };
}
