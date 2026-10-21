import { formatInstantTime, MONTH_SHORT } from '@shared/format';
import type { ISODate, ISOInstant } from '@shared/time';

/** "20 – 26 oct." or "28 oct. – 3 nov.". */
export function formatDateNoYearRange(from: ISODate, to: ISODate): string {
  const [, fm, fd] = from.split('-').map(Number);
  const [, tm, td] = to.split('-').map(Number);
  return fm === tm ? `${fd} – ${td} ${MONTH_SHORT[tm - 1]}` : `${fd} ${MONTH_SHORT[fm - 1]} – ${td} ${MONTH_SHORT[tm - 1]}`;
}

/** "9:30 – 10:00 a. m.", or "11:30 a. m. – 12:30 p. m." when the period changes. */
export function formatTimeRange(start: ISOInstant, end: ISOInstant): string {
  const from = formatInstantTime(start);
  const to = formatInstantTime(end);
  const [fromClock, ...fromPeriod] = from.split(' ');
  const toPeriod = to.split(' ').slice(1).join(' ');
  return fromPeriod.join(' ') === toPeriod ? `${fromClock} – ${to}` : `${from} – ${to}`;
}
