import { capitalize, DAY_NAMES, DAY_SHORT, formatDayLong, formatInstantTime, MONTH_SHORT } from '../../../shared/format';
import { bogotaDate, jsWeekday, type ISOInstant } from '../../../shared/time';
import { esc, link } from '../layout';

/** Shared copy helpers for the templates (Spanish, Colombia, tuteo). */

export interface ProInfo {
  name: string;
  title: string;
  neighborhood: string;
  address: string;
  city: string;
  slug: string;
}

/** "jue 22 oct., 10:00 a. m." — the subject-line date. */
export function subjectWhen(instant: ISOInstant): string {
  const date = bogotaDate(instant);
  const [, m, d] = date.split('-').map(Number);
  return `${DAY_SHORT[jsWeekday(date)].toLowerCase()} ${d} ${MONTH_SHORT[m - 1]}, ${formatInstantTime(instant)}`;
}

/** "Jueves 22 de octubre, 10:00 a. m." — the "Cuándo" row. */
export const whenLong = (instant: ISOInstant): string =>
  `${capitalize(formatDayLong(bogotaDate(instant)))}, ${formatInstantTime(instant)}`;

/** "miércoles 21 a las 10:00 a. m." — the reminder note. */
export function dayAndTime(instant: ISOInstant): string {
  const date = bogotaDate(instant);
  return `${DAY_NAMES[jsWeekday(date)]} ${Number(date.slice(8, 10))} a las ${formatInstantTime(instant)}`;
}

export const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;

const HONORIFICS = new Set(['dr', 'dra', 'dr.', 'dra.', 'psic', 'psic.', 'lic', 'lic.', 'ing', 'ing.', 'abg', 'abg.', 'prof', 'prof.']);

/** "Dra. Laura Pérez" → "Laura" (the mockups' "Hola, Laura."); falls back to the first word. */
export function greetingName(name: string): string {
  const words = name.trim().split(/\s+/);
  return words.find((w) => !HONORIFICS.has(w.toLowerCase())) ?? words[0] ?? name;
}

/**
 * "Cra. 43A #1-50, consultorio 302, El Poblado, Medellín" — address,
 * neighborhood and city, skipping parts the address already spells out.
 */
export function whereText(pro: Pick<ProInfo, 'address' | 'neighborhood' | 'city'>): string {
  const parts: string[] = [];
  for (const part of [pro.address, pro.neighborhood, pro.city].map((p) => (p ?? '').trim()).filter(Boolean)) {
    if (!parts.join(', ').toLowerCase().includes(part.toLowerCase())) parts.push(part);
  }
  return parts.join(', ');
}

export const proWithTitle = (pro: Pick<ProInfo, 'name' | 'title'>): string => (pro.title ? `${pro.name} · ${pro.title}` : pro.name);

const hostOf = (siteUrl: string) => siteUrl.replace(/^https?:\/\//, '');
export const privacyUrl = (siteUrl: string) => `${siteUrl}/privacy`;
/** Data deletion instructions (Ley 1581) — a section of the privacy page. */
export const deleteDataUrl = (siteUrl: string) => `${siteUrl}/privacy#borrar-datos`;
const SIGNATURE = 'Sepárame · Medellín, Colombia';

/** Ley 1581 footer for emails to a professional's client. */
export function clientFooter(siteUrl: string, slug: string): { html: string[]; text: string } {
  const page = `${hostOf(siteUrl)}/${slug}`;
  const why = `Recibes este correo porque separaste una cita en ${page}. Tus datos se usan solo para gestionar esta cita (Ley 1581 de 2012).`;
  return {
    html: [
      `${esc(why)} ${link(privacyUrl(siteUrl), 'Política de privacidad')} · ${link(deleteDataUrl(siteUrl), 'Borrar mis datos')}`,
      esc(SIGNATURE),
    ],
    text: `${why}\nPolítica de privacidad: ${privacyUrl(siteUrl)}\nBorrar mis datos: ${deleteDataUrl(siteUrl)}\n${SIGNATURE}`,
  };
}

/** Footer for emails to professionals (account holders). */
export function proFooter(siteUrl: string): { html: string[]; text: string } {
  const why = `Recibes este correo porque tienes una cuenta en ${hostOf(siteUrl)}. Tratamos tus datos según la Ley 1581 de 2012.`;
  return {
    html: [
      `${esc(why)} ${link(privacyUrl(siteUrl), 'Política de privacidad')} · ${link(deleteDataUrl(siteUrl), 'Borrar mis datos')}`,
      esc(SIGNATURE),
    ],
    text: `${why}\nPolítica de privacidad: ${privacyUrl(siteUrl)}\n${SIGNATURE}`,
  };
}

/** Plain-text detail lines ("Con: …"). */
export const textRows = (rows: [string, string][]): string =>
  rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n');
