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

/** JSON with object keys sorted: the API returns days alphabetically and ranges as {end,start}. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v);
}

/** Same weekly hours, whatever the key order or range order of either side. */
export const sameSchedule = (a: WeeklySchedule, b: WeeklySchedule): boolean =>
  stableJson(toSchedule(toDraft(a))) === stableJson(toSchedule(toDraft(b)));

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

const FIRST_STEP_MIN = 5 * 60;
const LAST_STEP_MIN = 23 * 60;
const STEP_MIN = 15;

/** Times offered in the pickers: every 15 minutes, 5:00 a. m. … 11:00 p. m. */
export const TIME_STEPS: string[] = Array.from({ length: (LAST_STEP_MIN - FIRST_STEP_MIN) / STEP_MIN + 1 }, (_, i) => hhmm(FIRST_STEP_MIN + i * STEP_MIN));

/** TIME_STEPS plus `current` when it isn't one of them (a saved 6:10 or 11:30 p. m. stays selectable). */
export function timeStepsWith(current: string): string[] {
  return TIME_STEPS.includes(current) ? TIME_STEPS : [...TIME_STEPS, current].sort((a, b) => minutesOf(a) - minutesOf(b));
}
