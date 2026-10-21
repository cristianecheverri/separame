/**
 * Dev-only fixtures mirroring the mockups (Dra. Laura Pérez, "today" =
 * Tuesday 20 Oct 2026 late afternoon, Sundays closed, 2 Nov holiday).
 * Never reaches production: only imported behind `import.meta.env.DEV`.
 */
import type { PublicProfile } from '@shared/api';
import { DEFAULT_SCHEDULE, type Interval } from '@shared/availability';
import { addDays, toInstant } from '@shared/time';
import type { BookingRules } from '@shared/types';

export const MOCK_NOW = new Date('2026-10-20T21:30:00.000Z'); // 4:30 p. m. in Bogotá
export const MOCK_TODAY = '2026-10-20';

export const MOCK_PROFILE: PublicProfile = {
  slug: 'dra-laura-perez',
  name: 'Dra. Laura Pérez',
  title: 'Odontóloga',
  city: 'Medellín',
  address: 'Cra. 43A #1-50, consultorio 302',
  neighborhood: 'El Poblado',
  phone: '6044441234',
  initials: 'LP',
  services: [
    { id: 'valoracion', name: 'Valoración', durationMin: 30, priceCop: 60000, description: 'Primera vez' },
    { id: 'limpieza', name: 'Limpieza dental', durationMin: 45, priceCop: 120000, description: 'Incluye profilaxis' },
    { id: 'control', name: 'Control', durationMin: 15, priceCop: null, priceDisplay: 'agreed', description: 'En tratamiento' },
    { id: 'urgencia', name: 'Urgencia', durationMin: 30, priceCop: null, priceDisplay: 'hidden', description: 'Dolor o molestia' },
  ],
};

export const MOCK_SCHEDULE = DEFAULT_SCHEDULE;

export const MOCK_RULES: BookingRules = {
  bufferMin: 0,
  minNoticeMin: 120,
  maxDaysAhead: 60,
  slotStepMin: 30,
  closedOnHolidays: true,
};

/** The same taken hours every day, so the grids read exactly like the mockup. */
const TAKEN = ['09:00', '11:00', '15:30', '17:00'];

export function mockBusy(days = 31): Interval[] {
  const busy: Interval[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(MOCK_TODAY, i);
    for (const time of TAKEN) {
      const start = toInstant(date, time);
      busy.push({ start, end: new Date(new Date(start).getTime() + 30 * 60_000).toISOString() });
    }
  }
  // Friday 23 is fully booked: a real "Lleno" day that leads to the waitlist.
  const fullDay = addDays(MOCK_TODAY, 3);
  busy.push({ start: toInstant(fullDay, '07:00'), end: toInstant(fullDay, '19:00') });
  return busy;
}
