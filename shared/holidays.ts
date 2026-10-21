/**
 * Colombian public holidays (18 per year), computed — no external API.
 * Ley 51 de 1983 ("Ley Emiliani") moves most of them to the following Monday;
 * the Easter-based ones are anchored on Easter Sunday.
 */
import { addDays, jsWeekday, type ISODate } from './time';

export interface Holiday {
  date: ISODate;
  name: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Easter Sunday (Gregorian), anonymous algorithm (Meeus/Jones/Butcher). */
export function easterSunday(year: number): ISODate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Next Monday on or after the date (Ley Emiliani). */
function toMonday(date: ISODate): ISODate {
  const wd = jsWeekday(date); // 0 = Sunday
  const shift = wd === 1 ? 0 : (8 - wd) % 7;
  return addDays(date, shift);
}

const cache = new Map<number, Holiday[]>();

export function colombianHolidays(year: number): Holiday[] {
  const hit = cache.get(year);
  if (hit) return hit;

  const on = (mmdd: string) => `${year}-${mmdd}`;
  const easter = easterSunday(year);
  const list: Holiday[] = [
    { date: on('01-01'), name: 'Año Nuevo' },
    { date: toMonday(on('01-06')), name: 'Reyes Magos' },
    { date: toMonday(on('03-19')), name: 'San José' },
    { date: addDays(easter, -3), name: 'Jueves Santo' },
    { date: addDays(easter, -2), name: 'Viernes Santo' },
    { date: on('05-01'), name: 'Día del Trabajo' },
    { date: addDays(easter, 43), name: 'Ascensión del Señor' },
    { date: addDays(easter, 64), name: 'Corpus Christi' },
    { date: addDays(easter, 71), name: 'Sagrado Corazón' },
    { date: toMonday(on('06-29')), name: 'San Pedro y San Pablo' },
    { date: on('07-20'), name: 'Día de la Independencia' },
    { date: on('08-07'), name: 'Batalla de Boyacá' },
    { date: toMonday(on('08-15')), name: 'Asunción de la Virgen' },
    { date: toMonday(on('10-12')), name: 'Día de la Raza' },
    { date: toMonday(on('11-01')), name: 'Todos los Santos' },
    { date: toMonday(on('11-11')), name: 'Independencia de Cartagena' },
    { date: on('12-08'), name: 'Inmaculada Concepción' },
    { date: on('12-25'), name: 'Navidad' },
  ].sort((x, y) => x.date.localeCompare(y.date));

  cache.set(year, list);
  return list;
}

export function holidayOn(date: ISODate): Holiday | undefined {
  return colombianHolidays(Number(date.slice(0, 4))).find((h) => h.date === date);
}

/** Holidays from `from` (inclusive), across year boundaries, up to `count`. */
export function upcomingHolidays(from: ISODate, count: number): Holiday[] {
  const year = Number(from.slice(0, 4));
  return [...colombianHolidays(year), ...colombianHolidays(year + 1)]
    .filter((h) => h.date >= from)
    .slice(0, count);
}
