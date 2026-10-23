/**
 * Spanish (Colombia) display formatting shared by the booking page, the panel
 * and the emails, so every surface writes dates, times and money the same way
 * as the mockups: "Jueves 22 de octubre", "10:00 a. m.", "12:00 m.", "$60.000".
 */
import { bogotaDate, bogotaTime, jsWeekday, type HHmm, type ISODate, type ISOInstant } from './time';
import type { PriceDisplay } from './types';

export const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
export const MONTH_SHORT = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'];

export function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function parts(date: ISODate) {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d, wd: jsWeekday(date) };
}

/** "2:30 p. m.", "10:00 a. m.", "12:00 m." (noon, Colombian usage). */
export function formatTime(time: HHmm): string {
  const [hh, mm] = time.split(':').map(Number);
  if (hh === 12 && mm === 0) return '12:00 m.';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'a. m.' : 'p. m.'}`;
}

export function formatInstantTime(instant: ISOInstant): string {
  return formatTime(bogotaTime(instant));
}

/** "jueves 22 de octubre" (lowercase; wrap in `capitalize` at sentence start). */
export function formatDayLong(date: ISODate): string {
  const { m, d, wd } = parts(date);
  return `${DAY_NAMES[wd]} ${d} de ${MONTH_NAMES[m - 1]}`;
}

/** "jueves 22 de octubre de 2026". */
export function formatDayLongWithYear(date: ISODate): string {
  return `${formatDayLong(date)} de ${parts(date).y}`;
}

/** "Jue 22" — day pills and compact summaries. */
export function formatDayShort(date: ISODate): string {
  const { d, wd } = parts(date);
  return `${DAY_SHORT[wd]} ${d}`;
}

/** "22 oct. 2026" — admin tables. */
export function formatDateShort(date: ISODate): string {
  const { y, m, d } = parts(date);
  return `${d} ${MONTH_SHORT[m - 1]} ${y}`;
}

/** "22 oct." — when the year is obvious. */
export function formatDateNoYear(date: ISODate): string {
  const { m, d } = parts(date);
  return `${d} ${MONTH_SHORT[m - 1]}`;
}

/** "Octubre 2026". */
export function formatMonthYear(date: ISODate): string {
  const { y, m } = parts(date);
  return `${capitalize(MONTH_NAMES[m - 1])} ${y}`;
}

/** "Jueves 22 de octubre · 10:00 a. m." for an instant. */
export function formatWhen(instant: ISOInstant): string {
  return `${capitalize(formatDayLong(bogotaDate(instant)))} · ${formatInstantTime(instant)}`;
}

/** "$60.000" — thousands with dots, no decimals (COP). `null` → "Sin costo". */
export function formatCop(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || amount === 0) return 'Sin costo';
  const digits = Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `$${digits}`;
}

/** Anything that carries a service price: Service, PublicService, Appointment, BookingSummary. */
export interface PricedItem {
  priceCop: number | null;
  priceDisplay?: PriceDisplay;
  /** Team page «Cualquiera disponible»: professionals charge differently; `priceCop` is the lowest. */
  priceFrom?: boolean;
}

/** The price display option, deriving it for items saved before it existed (null or 0 → "Sin costo"). */
export function priceDisplayOf(item: PricedItem): PriceDisplay {
  if (item.priceDisplay === 'fixed') return item.priceCop ? 'fixed' : 'free';
  if (item.priceDisplay) return item.priceDisplay;
  return item.priceCop ? 'fixed' : 'free';
}

/** Copy for the price display options (panel editor, booking page, emails). */
export const PRICE_DISPLAY_TEXT = {
  free: 'Sin costo',
  agreed: 'Precio a convenir',
} as const;

/**
 * A service price as the client sees it: "$60.000", "Sin costo", "Precio a convenir",
 * or '' when the professional chose not to show it (callers then omit the price entirely).
 */
export function formatServicePrice(item: PricedItem): string {
  const display = priceDisplayOf(item);
  if (display === 'fixed') return item.priceFrom ? `Desde ${formatCop(item.priceCop)}` : formatCop(item.priceCop);
  if (display === 'hidden') return '';
  return PRICE_DISPLAY_TEXT[display];
}

/** "30 min", "1 h", "1 h 30 min". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const TITLES = new Set(['dr', 'dra', 'dr.', 'dra.', 'psic', 'psic.', 'lic', 'lic.', 'ing', 'ing.', 'abg', 'abg.', 'prof', 'prof.']);

/** Avatar initials, skipping honorifics: "Dra. Laura Pérez" → "LP", "Estudio Lúa" → "EL". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => !TITLES.has(w.toLowerCase()));
  const letters = words.slice(0, 2).map((w) => w.charAt(0).toUpperCase());
  return letters.join('') || '?';
}
