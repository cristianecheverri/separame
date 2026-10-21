/** Editable model of the weekly schedule (closed days remember their ranges). */
import { DEFAULT_SCHEDULE } from '@shared/availability';
import { weeklyScheduleSchema } from '@shared/schemas';
import { hhmm, minutesOf, WEEKDAYS, type Weekday } from '@shared/time';
import type { TimeRange, WeeklySchedule } from '@shared/types';

export interface DayDraft {
  open: boolean;
  ranges: TimeRange[];
}

export type ScheduleDraft = Record<Weekday, DayDraft>;

export const DAY_LABELS: Record<Weekday, string> = {
  mon: 'Lunes', tue: 'Martes', wed: 'Miércoles', thu: 'Jueves', fri: 'Viernes', sat: 'Sábado', sun: 'Domingo',
};

const FALLBACK: TimeRange[] = DEFAULT_SCHEDULE.mon;

export function toDraft(schedule: WeeklySchedule): ScheduleDraft {
  return Object.fromEntries(
    WEEKDAYS.map((d) => [d, { open: schedule[d].length > 0, ranges: schedule[d].length ? sortRanges(schedule[d]) : FALLBACK }]),
  ) as ScheduleDraft;
}

export function toSchedule(draft: ScheduleDraft): WeeklySchedule {
  return Object.fromEntries(WEEKDAYS.map((d) => [d, draft[d].open ? sortRanges(draft[d].ranges) : []])) as WeeklySchedule;
}

export function sortRanges(ranges: TimeRange[]): TimeRange[] {
  return [...ranges].sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
}

/** Spanish error per day, from the shared schema. */
export function scheduleErrors(draft: ScheduleDraft): Partial<Record<Weekday, string>> {
  const result = weeklyScheduleSchema.safeParse(toSchedule(draft));
  if (result.success) return {};
  const errors: Partial<Record<Weekday, string>> = {};
  for (const issue of result.error.issues) {
    const day = issue.path[0] as Weekday;
    errors[day] ??= issue.message;
  }
  return errors;
}

/** A sensible next range after the last one (or the morning default). */
export function nextRange(ranges: TimeRange[]): TimeRange | null {
  if (ranges.length === 0) return { start: '08:00', end: '12:00' };
  const last = Math.max(...ranges.map((r) => minutesOf(r.end)));
  const start = last + 60;
  if (start + 30 > 23 * 60 + 55) return null;
  return { start: hhmm(start), end: hhmm(Math.min(start + 120, 23 * 60 + 55)) };
}

/** Every 5-minute step of the day: 00:00 … 23:55. */
export const TIME_STEPS: string[] = Array.from({ length: (24 * 60) / 5 }, (_, i) => hhmm(i * 5));
