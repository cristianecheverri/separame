/** Pure helpers for the day pills and slot grids. */
import type { DayAvailability } from '@shared/availability';
import { capitalize, formatMonthYear, MONTH_NAMES } from '@shared/format';
import { bogotaTime } from '@shared/time';

export const DAYS_PER_WEEK = 7;

export function isDayBookable(day: DayAvailability): boolean {
  return day.closed === null && day.slots.length > 0;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** "Octubre 2026", or "Octubre – Noviembre 2026" when the view spans two months. */
export function monthLabel(dates: string[]): string {
  if (dates.length === 0) return '';
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (first.slice(0, 7) === last.slice(0, 7)) return formatMonthYear(first);
  if (first.slice(0, 4) !== last.slice(0, 4)) return `${formatMonthYear(first)} – ${formatMonthYear(last)}`;
  const month = (date: string) => capitalize(MONTH_NAMES[Number(date.slice(5, 7)) - 1]);
  return `${month(first)} – ${month(last)} ${first.slice(0, 4)}`;
}

/** Morning = before 12:00 Bogotá; noon and later go to the afternoon grid. */
export function splitSlots(slots: string[]): { morning: string[]; afternoon: string[] } {
  const morning: string[] = [];
  const afternoon: string[] = [];
  for (const slot of slots) (bogotaTime(slot) < '12:00' ? morning : afternoon).push(slot);
  return { morning, afternoon };
}

/** Index of the 7-day row that holds `date` (0 when it isn't in the window). */
export function weekOf(days: DayAvailability[], date: string | null): number {
  const index = date ? days.findIndex((d) => d.date === date) : -1;
  return index >= 0 ? Math.floor(index / DAYS_PER_WEEK) : 0;
}

/**
 * Day shown in "Día y hora": the client's open pick stays (even a full day,
 * which leads to the waitlist); otherwise the wanted date (deep link) when it
 * has free hours, else the first day with free hours, so the hours show at once.
 */
export function resolveDay(days: DayAvailability[], current: string | null, wanted: string | null = null): string | null {
  if (current && days.some((d) => d.date === current && d.closed === null)) return current;
  const pick = (wanted ? days.find((d) => d.date === wanted && isDayBookable(d)) : undefined) ?? days.find(isDayBookable);
  return pick?.date ?? null;
}
