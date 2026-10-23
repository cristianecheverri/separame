import brand from '../../shared/brand.json';

/**
 * Email-safe building blocks for the line A look (see
 * `mockups/line-a/email-booking-confirmed.dc.html`): nested tables, inline styles,
 * Bricolage Grotesque / Figtree with Arial fallbacks (most clients drop web
 * fonts), green header band with the "sepárame." wordmark, soft-green
 * details card, pill buttons and the yellow note. Every interpolated value
 * must go through `esc()`; block helpers take already-safe HTML.
 */

export const C = brand.colors;
const BODY_FONT = "'Figtree', Arial, Helvetica, sans-serif";
const DISPLAY_FONT = "'Bricolage Grotesque', Arial, Helvetica, sans-serif";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function esc(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Wordmark: "sepárame" + yellow dot. */
export function wordmark(size = 22): string {
  return `<div style="font-family:${DISPLAY_FONT};font-weight:800;font-size:${size}px;letter-spacing:-0.5px;color:${C.white};line-height:1.2">sepárame<span style="color:${C.yellow}">.</span></div>`;
}

/** Soft-green card of label / value rows ("Con", "Servicio", "Cuándo", "Dónde"). Values are plain text. */
/** "10:00 a. m." never wraps inside the time (non-breaking spaces). */
export const keepTimeTogether = (text: string): string => text.replace(/(\d{1,2}:\d{2}) ([ap])\. m\./g, '$1\u00a0$2.\u00a0m.');

/** Ends a sentence once: a time like "10:00 a. m." already ends with a period. */
export const sentence = (text: string): string => (text.endsWith('.') ? text : `${text}.`);

export function detailsCard(rows: [label: string, value: string, opts?: { strike?: boolean }][]): string {
  const visible = rows.filter(([, value]) => value);
  const cells = visible
    .map(([label, value, opts], i) => {
      const border = i < visible.length - 1 ? `border-bottom:1px solid ${C.greenLine};` : '';
      const strike = opts?.strike ? `text-decoration:line-through;color:${C.muted};font-weight:600;` : '';
      return `<tr>
<td valign="top" style="padding:12px 0;${border}font-family:${BODY_FONT};font-size:15px;color:${C.ink2};white-space:nowrap;padding-right:16px">${esc(label)}</td>
<td valign="top" align="right" style="padding:12px 0;${border}font-family:${BODY_FONT};font-size:15px;font-weight:700;color:${C.ink};text-align:right;overflow-wrap:anywhere;word-break:break-word;${strike}">${esc(keepTimeTogether(value))}</td>
</tr>`;
    })
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.greenSoft};border-radius:18px">
<tr><td style="padding:6px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${cells}</table></td></tr>
</table>`;
}

/** Solid green pill button. */
export function pillButton(href: string, label: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" bgcolor="${C.green}" style="background:${C.green};border-radius:999px;height:50px;padding:0 24px">
<a href="${esc(href)}" style="display:block;line-height:50px;font-family:${BODY_FONT};font-weight:700;font-size:15px;color:${C.white};text-decoration:none;border-radius:999px;white-space:nowrap">${esc(label)}</a>
</td></tr></table>`;
}

/** Two pill buttons side by side (stack on narrow screens). */
export function buttonPair(a: { href: string; label: string }, b: { href: string; label: string }): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="sp-stack" width="50%" style="padding-right:5px">${pillButton(a.href, a.label)}</td>
<td class="sp-stack" width="50%" style="padding-left:5px">${pillButton(b.href, b.label)}</td>
</tr></table>`;
}

export interface CalendarButton {
  href: string;
  label: string;
  /** Absolute URL of a 96×96 PNG logo (shown at 24 px; email clients don't render SVG). */
  iconUrl: string;
}

/** White bordered pill with a logo ("Google Calendar", "Outlook"), as on the booking confirmation screen. */
export function calendarButton(b: CalendarButton): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" bgcolor="${C.white}" style="background:${C.white};border:2px solid ${C.line};border-radius:999px;height:48px;padding:0 16px">
<a href="${esc(b.href)}" style="display:block;line-height:48px;font-family:${BODY_FONT};font-weight:700;font-size:15px;color:${C.ink};text-decoration:none;border-radius:999px;white-space:nowrap">
<img src="${esc(b.iconUrl)}" width="24" height="24" alt="" style="display:inline-block;width:24px;height:24px;border:0;outline:none;vertical-align:middle;margin:-3px 8px 0 0">${esc(b.label)}</a>
</td></tr></table>`;
}

/** Two calendar buttons side by side (stack on narrow screens). */
export function calendarButtonPair(a: CalendarButton, b: CalendarButton): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="sp-stack" width="50%" style="padding-right:5px">${calendarButton(a)}</td>
<td class="sp-stack" width="50%" style="padding-left:5px">${calendarButton(b)}</td>
</tr></table>`;
}

/** Outlined green pill ("Cancelar o reprogramar"). */
export function outlineButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="border:2px solid ${C.green};border-radius:999px;height:44px;padding:0 22px">
<a href="${esc(href)}" style="display:block;line-height:44px;font-family:${BODY_FONT};font-weight:700;font-size:15px;color:${C.green};text-decoration:none">${esc(label)}</a>
</td></tr></table>`;
}

/** Yellow note ("Te mandamos un recordatorio…"). Takes safe HTML. */
export function note(html: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="background:${C.yellowSoft};border-radius:18px;padding:16px 20px;font-family:${BODY_FONT};font-size:15px;line-height:1.5;color:${C.ink}">${keepTimeTogether(html)}</td>
</tr></table>`;
}

/** Paragraph. Takes safe HTML. */
export function paragraph(html: string, opts: { muted?: boolean; size?: number; bold?: boolean } = {}): string {
  const color = opts.muted ? C.muted : C.ink2;
  return `<div style="font-family:${BODY_FONT};font-size:${opts.size ?? 15}px;line-height:1.5;color:${opts.bold ? C.ink : color};${opts.bold ? 'font-weight:700;' : ''}">${keepTimeTogether(html)}</div>`;
}

/** Big sign-in code box (Cognito). */
export function codeBox(code: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" style="background:${C.greenSoft};border-radius:18px;padding:22px 12px;font-family:${DISPLAY_FONT};font-weight:800;font-size:40px;letter-spacing:8px;color:${C.green}">${code}</td>
</tr></table>`;
}

/** Vertical stack with the mockup's 22 px gap; tighter groups pass `gap`. */
export function stack(blocks: string[], gap = 22): string {
  return blocks
    .filter(Boolean)
    .map((b, i) => (i === 0 ? b : `<div style="height:${gap}px;line-height:${gap}px;font-size:1px">&nbsp;</div>${b}`))
    .join('');
}

export function link(href: string, label: string): string {
  return `<a href="${esc(href)}" style="color:${C.green}">${esc(label)}</a>`;
}

export interface LayoutInput {
  /** Document title (usually the subject). */
  title: string;
  /** Hidden preview line shown by inbox lists. */
  preheader: string;
  /** Big white heading inside the green band (plain text). */
  heading: string;
  /** Body HTML (built with the helpers above). */
  body: string;
  /** Footer lines (safe HTML). */
  footer: string[];
}

export function renderLayout(input: LayoutInput): string {
  const footer = input.footer
    .map((line) => `<div style="padding-bottom:6px">${line}</div>`)
    .join('');
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(input.title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&amp;family=Figtree:wght@400;600;700&amp;display=swap">
<style>
body{margin:0;padding:0;background:${C.surface}}
a{color:${C.green}}
@media (max-width:620px){
.sp-container{width:100%!important}
.sp-pad{padding-left:20px!important;padding-right:20px!important}
.sp-stack{display:block!important;width:100%!important;padding:0 0 10px 0!important}
.sp-h1{font-size:26px!important}
}
</style>
</head>
<body style="margin:0;padding:0;background:${C.surface}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.surface}">${esc(input.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.surface}" style="background:${C.surface}">
<tr><td align="center" style="padding:20px 12px 28px">
<table role="presentation" class="sp-container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px">
<tr><td style="background:${C.white};border-radius:20px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td class="sp-pad" bgcolor="${C.green}" style="background:${C.green};border-radius:20px 20px 0 0;padding:26px 32px">
${wordmark()}
<div style="height:18px;line-height:18px;font-size:1px">&nbsp;</div>
<h1 class="sp-h1" style="margin:0;font-family:${DISPLAY_FONT};font-weight:800;font-size:32px;line-height:1.1;letter-spacing:-0.8px;color:${C.white}">${esc(input.heading)}</h1>
</td></tr>
<tr><td class="sp-pad" style="padding:28px 32px">
${input.body}
</td></tr>
</table>
</td></tr>
<tr><td style="padding:16px 8px 0;font-family:${BODY_FONT};font-size:12px;line-height:1.5;color:${C.muted}">
${footer}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
