/**
 * «No estaré disponible» (proposal block-hours-sheet-phone): what the sheet's
 * choices mean as a `CreateBlockRequest`, its button label, the hour shortcuts
 * and the appointments the range would cover. Pure, so it is unit-tested.
 */
import type { CreateBlockRequest } from '@shared/api';
import { formatTime } from '@shared/format';
import { addDays, bogotaDate, bogotaTime, minutesOf, toInstant, weekdayOf, type HHmm, type ISODate } from '@shared/time';
import type { Appointment, WeeklySchedule } from '@shared/types';
import { formatDayShortMonth } from '../../lib/format';

export type BlockWhen = 'today' | 'tomorrow' | 'other' | 'range';

export interface BlockDraft {
  when: BlockWhen;
  /** «Otro día». */
  date: ISODate;
  /** «Varios días». */
  from: ISODate;
  to: ISODate;
  allDay: boolean;
  startTime: HHmm;
  endTime: HHmm;
  reason: string;
}

export const WHEN_OPTIONS: { key: BlockWhen; label: string }[] = [
  { key: 'today', label: 'Hoy' },
  { key: 'tomorrow', label: 'Mañana' },
  { key: 'other', label: 'Otro día' },
  { key: 'range', label: 'Varios días' },
];

const STEP_MIN = 30;
const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (minutes: number): HHmm => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/** The next half hour from `now` (Bogotá), capped at 23:30. */
export function nextHalfHour(now: Date): HHmm {
  const m = minutesOf(bogotaTime(now));
  return hhmm(Math.min(23 * 60 + 30, Math.ceil((m + 1) / STEP_MIN) * STEP_MIN));
}

/** The single day the draft is about (the first one for «Varios días»). */
export function firstDay(draft: BlockDraft, today: ISODate): ISODate {
  if (draft.when === 'today') return today;
  if (draft.when === 'tomorrow') return addDays(today, 1);
  return draft.when === 'other' ? draft.date : draft.from;
}

/** Opening the sheet: from the agenda's free gap (that day and those hours), or fresh (today, from the next half hour). */
export function initialDraft(today: ISODate, now: Date, prefill?: { date: ISODate; startTime: HHmm; endTime: HHmm }): BlockDraft {
  if (prefill) {
    const when: BlockWhen = prefill.date === today ? 'today' : prefill.date === addDays(today, 1) ? 'tomorrow' : 'other';
    return { when, date: prefill.date, from: prefill.date, to: prefill.date, allDay: false, startTime: prefill.startTime, endTime: prefill.endTime, reason: '' };
  }
  const start = nextHalfHour(now);
  const end = hhmm(Math.min(24 * 60 - STEP_MIN, minutesOf(start) + 2 * 60));
  return { when: 'today', date: today, from: today, to: addDays(today, 4), allDay: false, startTime: start, endTime: end, reason: '' };
}

export interface HourPreset {
  key: 'morning' | 'afternoon' | 'fromNow';
  label: string;
  startTime: HHmm;
  endTime: HHmm;
}

/**
 * «Toda la mañana» / «Toda la tarde» follow the day's weekly hours (first and last
 * range, before / from noon), «Desde ahora» only today. Hours the pro doesn't
 * work fall back to 8–12 and 2–6.
 */
export function hourPresets(day: ISODate, schedule: WeeklySchedule | undefined, today: ISODate, now: Date, range = false): HourPreset[] {
  const ranges = schedule?.[weekdayOf(day)] ?? [];
  const morning = ranges.filter((r) => r.start < '12:00');
  const afternoon = ranges.filter((r) => r.end > '12:00' && r.start >= '12:00');
  const presets: HourPreset[] = [
    { key: 'morning', label: 'Toda la mañana', startTime: morning[0]?.start ?? '08:00', endTime: morning.at(-1)?.end ?? '12:00' },
    { key: 'afternoon', label: 'Toda la tarde', startTime: afternoon[0]?.start ?? '14:00', endTime: afternoon.at(-1)?.end ?? '18:00' },
  ];
  // «Desde ahora» means today only: over several days it would block from that hour every day.
  if (day === today && !range) {
    const start = nextHalfHour(now);
    const end = ranges.at(-1)?.end ?? '18:00';
    if (start < end) presets.push({ key: 'fromNow', label: 'Desde ahora', startTime: start, endTime: end });
  }
  return presets;
}

/** The request the draft sends; null when the hours or the days don't make sense yet. */
export function blockRequest(draft: BlockDraft, today: ISODate): CreateBlockRequest | null {
  const label = draft.reason.trim() || undefined;
  const range = draft.when === 'range';
  const first = firstDay(draft, today);
  const last = range ? draft.to : first;
  if (last < first) return null;
  if (draft.allDay) return { label, start: toInstant(first, '00:00'), end: toInstant(addDays(last, 1), '00:00') };
  if (draft.endTime <= draft.startTime) return null;
  return {
    label,
    start: toInstant(first, draft.startTime),
    end: toInstant(first, draft.endTime),
    ...(range && last > first ? { repeatUntil: last } : {}),
  };
}

/** "2:30 – 6:00 p. m." (one «p. m.» when both share it) or "11:00 a. m. – 1:00 p. m.". */
export function hoursRange(start: HHmm, end: HHmm): string {
  const a = formatTime(start);
  const b = formatTime(end);
  const meridiem = / [ap]\. m\.$/;
  const sameHalf = a.match(meridiem)?.[0] === b.match(meridiem)?.[0];
  return `${sameHalf ? a.replace(meridiem, '') : a} – ${b}`;
}
/** "vie 23 oct." */
const shortDay = (date: ISODate) => formatDayShortMonth(date).toLowerCase();
/** "Del 20 al 23 oct." (same month) or "Del 30 oct. al 2 nov.". */
function span(from: ISODate, to: ISODate): string {
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  return `Del ${sameMonth ? Number(from.slice(8)) : shortDay(from).replace(/^\S+ /, '')} al ${shortDay(to).replace(/^\S+ /, '')}`;
}

/**
 * What the button will block, shown right above it (the button itself says «Bloquear»):
 * «Hoy · 2:00 – 4:00 p. m.», «Mañana · todo el día», «Vie 23 oct. · todo el día»,
 * «Del 29 oct. al 2 nov. · 2:30 – 6:00 p. m.».
 */
export function blockSummary(draft: BlockDraft, today: ISODate): string {
  const first = firstDay(draft, today);
  const when =
    draft.when === 'range' ? span(draft.from, draft.to)
      : draft.when === 'today' ? 'Hoy'
        : draft.when === 'tomorrow' ? 'Mañana'
          : formatDayShortMonth(first);
  return `${when} · ${draft.allDay ? 'todo el día' : hoursRange(draft.startTime, draft.endTime)}`;
}

/** Confirmed appointments the blocked periods would cover (they stay; the sheet only warns). */
export function coveredAppointments(request: CreateBlockRequest, appointments: Appointment[]): Appointment[] {
  const firstDate = bogotaDate(request.start);
  const days = request.repeatUntil ? Math.round((Date.parse(toInstant(request.repeatUntil, '00:00')) - Date.parse(toInstant(firstDate, '00:00'))) / 86_400_000) + 1 : 1;
  const length = Date.parse(request.end) - Date.parse(request.start);
  const periods = Array.from({ length: days }, (_, i) => {
    const start = Date.parse(toInstant(addDays(firstDate, i), bogotaTime(request.start)));
    return [start, start + length] as const;
  });
  return appointments
    .filter((a) => a.status === 'confirmed')
    .filter((a) => periods.some(([s, e]) => Date.parse(a.start) < e && Date.parse(a.end) > s))
    .sort((a, b) => a.start.localeCompare(b.start));
}
