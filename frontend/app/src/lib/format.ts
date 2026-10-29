/**
 * Panel-only display helpers built on shared/format.ts (which stays the single
 * source for day/month names, times and money).
 */
import { capitalize, DAY_NAMES, DAY_SHORT, formatDayLong, formatTime, MONTH_NAMES, MONTH_SHORT } from '@shared/format';
import { addDays, bogotaDate, bogotaTime, jsWeekday, type ISODate, type ISOInstant } from '@shared/time';
import type { Block } from '@shared/types';

function parts(date: ISODate) {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d, wd: jsWeekday(date) };
}

/** "25 de enero de 2027". */
export function formatDateLong(date: ISODate): string {
  const { y, m, d } = parts(date);
  return `${d} de ${MONTH_NAMES[m - 1]} de ${y}`;
}

/** "15 de octubre". */
export function formatDayMonth(date: ISODate): string {
  const { m, d } = parts(date);
  return `${d} de ${MONTH_NAMES[m - 1]}`;
}

/** "Lun 2 nov." */
export function formatDayShortMonth(date: ISODate): string {
  const { m, d, wd } = parts(date);
  return `${DAY_SHORT[wd]} ${d} ${MONTH_SHORT[m - 1]}`;
}

/** "Miércoles 21", or "Lunes 2 nov." when the month differs from `reference`. */
export function formatWeekdayDay(date: ISODate, reference: ISODate): string {
  const { m, d, wd } = parts(date);
  const base = `${capitalize(DAY_NAMES[wd])} ${d}`;
  return m === parts(reference).m ? base : `${base} ${MONTH_SHORT[m - 1]}`;
}

/** "jul. 2026". */
export function formatMonthShortYear(date: ISODate): string {
  const { y, m } = parts(date);
  return `${MONTH_SHORT[m - 1]} ${y}`;
}

/** "Martes 20 de octubre". */
export const formatDayTitle = (date: ISODate) => capitalize(formatDayLong(date));

/** "3105550199" → "+57 310 555 0199". */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length !== 10) return phone;
  return `+57 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

/** "https://separame.app/dra-laura-perez" → "separame.app/dra-laura-perez". */
export function linkLabel(url: string | null | undefined): string {
  return (url ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '');
}

const HONORIFICS = new Set(['dr', 'dra', 'dr.', 'dra.', 'psic', 'psic.', 'lic', 'lic.', 'ing', 'ing.', 'abg', 'abg.', 'prof', 'prof.', 'profe']);

/** "Dra. Laura Pérez" → "Laura". */
export function firstName(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => !HONORIFICS.has(w.toLowerCase()));
  return words[0] ?? name.trim();
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Lowercase without accents, for search. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Digits typed in a COP input → "60.000" (empty stays empty). */
export function formatCopInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 9);
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function parseCopInput(text: string): number | null {
  const digits = text.replace(/\D/g, '');
  return digits ? Number(digits) : null;
}

export function isFullDayBlock(block: Pick<Block, 'start' | 'end'>): boolean {
  return bogotaTime(block.start) === '00:00' && bogotaTime(block.end) === '00:00';
}

/** "21 dic. 2026 – 4 ene. 2027", "Viernes 13 nov., todo el día" or "Viernes 13 nov., 2:00 p. m. – 6:00 p. m.". */
export function formatBlockRange(block: Pick<Block, 'start' | 'end'>): string {
  const startDate = bogotaDate(block.start);
  if (isFullDayBlock(block)) {
    const lastDate = addDays(bogotaDate(block.end), -1);
    if (lastDate <= startDate) return `${dayWithMonth(startDate)}, todo el día`;
    return `${shortWithYear(startDate)} – ${shortWithYear(lastDate)}`;
  }
  const endDate = bogotaDate(block.end);
  if (endDate === startDate) {
    return `${dayWithMonth(startDate)}, ${formatTime(bogotaTime(block.start))} – ${formatTime(bogotaTime(block.end))}`;
  }
  return `${shortWithYear(startDate)} ${formatTime(bogotaTime(block.start))} – ${shortWithYear(endDate)} ${formatTime(bogotaTime(block.end))}`;
}

function dayWithMonth(date: ISODate): string {
  const { m, d, wd } = parts(date);
  return `${capitalize(DAY_NAMES[wd])} ${d} ${MONTH_SHORT[m - 1]}`;
}

function shortWithYear(date: ISODate): string {
  const { y, m, d } = parts(date);
  return `${d} ${MONTH_SHORT[m - 1]} ${y}`;
}

export const instantDate = (instant: ISOInstant) => bogotaDate(instant);

/** "martes 20 de octubre · 2:00 p. m." — lowercase, for the middle of a sentence. */
export function formatWhenInline(instant: ISOInstant): string {
  return `${formatDayLong(bogotaDate(instant))} · ${formatTime(bogotaTime(instant))}`;
}

/** Adds the final period unless the text already ends with one ("… 2:00 p. m."). */
export function endSentence(text: string): string {
  return /[.!?…]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
}

/** "≈ 25 min", "≈ 2 h", "≈ 1,5 h" (rounded to half hours from 1 h): the stats' time saved estimate. */
export function formatSavedTime(minutes: number): string {
  if (minutes < 60) return `≈ ${minutes} min`;
  const hours = Math.round(minutes / 30) / 2;
  return `≈ ${String(hours).replace('.', ',')} h`;
}
