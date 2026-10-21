import { MONTH_SHORT } from '@shared/format';
import type { ISODate } from '@shared/time';

/** "20 – 26 oct." or "28 oct. – 3 nov.". */
export function formatDateNoYearRange(from: ISODate, to: ISODate): string {
  const [, fm, fd] = from.split('-').map(Number);
  const [, tm, td] = to.split('-').map(Number);
  return fm === tm ? `${fd} – ${td} ${MONTH_SHORT[tm - 1]}` : `${fd} ${MONTH_SHORT[fm - 1]} – ${td} ${MONTH_SHORT[tm - 1]}`;
}
