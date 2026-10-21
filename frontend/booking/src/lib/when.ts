/** Time labels for the booking pages. */
import { capitalize, formatDayLong, formatInstantTime } from '@shared/format';
import { bogotaDate } from '@shared/time';

const NBSP = '\u00a0';

/** "10:00 a. m." glued with non-breaking spaces so it never wraps as "10:00 a." / "m." on narrow screens. */
export function timeLabel(instant: string): string {
  return formatInstantTime(instant).replace(/ /g, NBSP);
}

/** "Jueves 22 de octubre · 10:00 a. m." — the date may wrap, the time stays whole. */
export function whenLabel(instant: string): string {
  return `${capitalize(formatDayLong(bogotaDate(instant)))} · ${timeLabel(instant)}`;
}
