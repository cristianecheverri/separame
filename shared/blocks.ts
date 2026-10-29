/**
 * Blocked periods («No estaré disponible»). One request becomes one `Block`,
 * or — with `repeatUntil` («Varios días» with hours) — one block per day with
 * the same hours, so every reader (availability, stats, the agenda) keeps
 * seeing plain intervals. Pure: shared by the API and the panel's mock.
 */
import { addDays, bogotaDate, bogotaTime, diffDays, toInstant, type ISODate, type ISOInstant } from './time';

/** What the pro sees when they leave the reason empty (clients only see the hours as taken). */
export const BLOCK_DEFAULT_LABEL = 'No disponible';
/** Longest run of daily blocks in one request. */
export const MAX_DAILY_BLOCK_DAYS = 62;

export interface BlockInput {
  label?: string;
  start: ISOInstant;
  end: ISOInstant;
  /** Same hours every day up to this Bogotá date (inclusive). */
  repeatUntil?: ISODate;
}

/** The last instant of a period, for "which Bogotá day does it end on" (an end at 00:00 belongs to the day before). */
const lastDay = (end: ISOInstant): ISODate => bogotaDate(new Date(new Date(end).getTime() - 1).toISOString());

/** Inside one Bogotá day: the only shape that can repeat daily. */
export const isSingleDay = (start: ISOInstant, end: ISOInstant): boolean => bogotaDate(start) === lastDay(end);

/** Days a repeating block covers (1 when it doesn't repeat). */
export function blockDays(input: BlockInput): number {
  return input.repeatUntil ? diffDays(bogotaDate(input.start), input.repeatUntil) + 1 : 1;
}

export function expandBlock(input: BlockInput): { label: string; start: ISOInstant; end: ISOInstant }[] {
  const label = input.label?.trim() || BLOCK_DEFAULT_LABEL;
  const start = new Date(input.start).toISOString();
  const end = new Date(input.end).toISOString();
  if (!input.repeatUntil) return [{ label, start, end }];
  const first = bogotaDate(start);
  const startTime = bogotaTime(start);
  const endsAtMidnight = bogotaTime(end) === '00:00';
  const endTime = endsAtMidnight ? '00:00' : bogotaTime(end);
  return Array.from({ length: blockDays(input) }, (_, i) => {
    const day = addDays(first, i);
    return { label, start: toInstant(day, startTime), end: toInstant(endsAtMidnight ? addDays(day, 1) : day, endTime) };
  });
}
