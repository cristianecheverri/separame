/**
 * In-memory API for local development and visual QA (`?mock=1`).
 *
 * Team plan: /consultorio-sonrie is the team page (embedded data from
 * fixtures); /dr-julian-ortiz and /dra-sara-gomez are its members' pages
 * («Parte de Consultorio Sonríe»), each with its own services and busy hours.
 *
 * Query switches:
 *   state=unavailable   subscription expired (active: false)
 *   state=notfound      unknown slug
 *   state=empty         no free slots in the window (waitlist card)
 *   services=1          profile with a single service (3-step flow)
 *   fail=<code>         first booking/reschedule attempt fails with that code
 *                       (slot_taken, agenda_unavailable, validation, captcha_failed, network);
 *                       fail=lost creates the booking but loses the response (network
 *                       error) — the retry gets the same appointment (idempotency key)
 *   hold=taken          the first hold (tapping an hour) finds it taken
 *   hold=next           the re-check on "Siguiente" finds it taken
 *   delay=<ms>          artificial latency (default 350)
 * Manage tokens: late (cutoff passed), cancelled, confirmed (attendance already
 * confirmed), invalid (404); any other token is the demo appointment.
 * Waitlist leave (/w/<token>): `invalid` → 404, anything else succeeds.
 */
import type {
  AvailabilityResponse, BookingSummary, CreateBookingRequest, HoldSlotRequest, ManagedAppointmentResponse, PublicProfile,
} from '@shared/api';
import { CLIENT_CHANGE_CUTOFF_MIN, HOLD_MINUTES } from '@shared/api';
import { computeAvailability, type Interval } from '@shared/availability';
import { addMinutes, bogotaDate, bogotaTime, toInstant } from '@shared/time';
import { ApiError, type ApiClient } from '../lib/api';
import { eventFromBooking, icsDataUrl } from '../lib/calendar';
import { SITE_PATHS } from '@shared/infra';
import { MOCK_NOW, MOCK_PROFILE, MOCK_RULES, MOCK_SCHEDULE, MOCK_TODAY, mockBusy, mockProfileFor } from './fixtures';

interface StoredAppointment {
  booking: BookingSummary;
  canChange: boolean;
}

function summary(profile: PublicProfile, serviceId: string, start: string, client: { name: string; email: string }, id: string): BookingSummary {
  const service = profile.services.find((s) => s.id === serviceId) ?? profile.services[0];
  return {
    appointmentId: id,
    status: 'confirmed',
    clientConfirmation: 'pending',
    start,
    end: addMinutes(start, service.durationMin),
    serviceId: service.id,
    serviceName: service.name,
    durationMin: service.durationMin,
    priceCop: service.priceCop,
    priceDisplay: service.priceDisplay,
    client,
    pro: {
      slug: profile.slug, name: profile.name, title: profile.title,
      address: profile.address, city: profile.city, neighborhood: profile.neighborhood,
      phone: profile.phone, initials: profile.initials,
    },
  };
}

/**
 * The manage page compares against the real clock, so mock appointments must
 * stay in the future: the mockup's Thu 22 Oct 10:00 a. m. while that's ahead,
 * otherwise tomorrow at the same time.
 */
function upcoming(fixed: string): string {
  const now = Date.now();
  if (new Date(fixed).getTime() > now) return fixed;
  const tomorrow = new Date(now + 24 * 3600_000);
  return toInstant(bogotaDate(tomorrow), bogotaTime(fixed));
}

/** Within the 2-hour change cutoff (real clock), on a half hour. */
function soon(): string {
  const half = 30 * 60_000;
  return new Date(Math.ceil((Date.now() + 60 * 60_000) / half) * half).toISOString();
}

export function createMockApi(params: URLSearchParams): ApiClient {
  const state = params.get('state');
  let failure = params.get('fail');
  /** Hold attempts left before one fails with slot_taken (hold=taken → the first, hold=next → the second). */
  let holdsUntilTaken = params.get('hold') === 'taken' ? 0 : params.get('hold') === 'next' ? 1 : -1;
  const delayMs = Number(params.get('delay') ?? 350);
  const singleService = params.get('services') === '1';
  const profileFor = (slug: string): PublicProfile => {
    const profile = mockProfileFor(slug);
    return singleService && profile.slug === MOCK_PROFILE.slug ? { ...profile, services: profile.services.slice(0, 1) } : profile;
  };
  const busyBySlug = new Map<string, Interval[]>();
  const busyFor = (slug: string): Interval[] => {
    const key = mockProfileFor(slug).slug;
    const busy = busyBySlug.get(key) ?? mockBusy(31, key);
    busyBySlug.set(key, busy);
    return busy;
  };
  const mariana = { name: 'Mariana Gómez', email: 'mariana@correo.com' };
  const appointments = new Map<string, StoredAppointment>([
    ['demo', { booking: summary(MOCK_PROFILE, 'valoracion', upcoming('2026-10-22T15:00:00.000Z'), mariana, 'appt-demo'), canChange: true }],
    ['late', { booking: summary(MOCK_PROFILE, 'valoracion', soon(), mariana, 'appt-late'), canChange: false }],
    ['confirmed', {
      booking: { ...summary(MOCK_PROFILE, 'valoracion', upcoming('2026-10-22T15:00:00.000Z'), mariana, 'appt-confirmed'), clientConfirmation: 'confirmed' },
      canChange: true,
    }],
    ['cancelled', {
      booking: { ...summary(MOCK_PROFILE, 'valoracion', upcoming('2026-10-22T15:00:00.000Z'), mariana, 'appt-cancelled'), status: 'cancelled' },
      canChange: false,
    }],
  ]);

  const byIdempotencyKey = new Map<string, { booking: BookingSummary; manageToken: string }>();
  const wait = () => new Promise((resolve) => setTimeout(resolve, delayMs));
  const takeFailure = (): void => {
    if (!failure) return;
    const code = failure;
    failure = null;
    if (code === 'network') throw new ApiError('network', 'Sin conexión');
    if (code === 'validation') {
      throw new ApiError('validation', 'Datos inválidos', 400, { 'client.email': 'Correo inválido' });
    }
    throw new ApiError(code as ApiError['code'], code, 409);
  };
  const active = state !== 'unavailable';
  const find = (token: string): StoredAppointment => {
    if (token === 'invalid') throw new ApiError('not_found', 'No existe', 404);
    const appt = appointments.get(token) ?? appointments.get('demo');
    if (!appt) throw new ApiError('not_found', 'No existe', 404);
    if (!appointments.has(token)) appointments.set(token, appt);
    return appt;
  };

  return {
    async getPro(slug) {
      await wait();
      if (state === 'notfound') throw new ApiError('not_found', 'No existe', 404);
      return { profile: profileFor(slug), active };
    },
    async getAvailability(slug, query): Promise<AvailabilityResponse> {
      await wait();
      const { services } = mockProfileFor(slug);
      const service = services.find((s) => s.id === query.serviceId) ?? services[0];
      const busy = busyFor(slug);
      const from = query.from ?? MOCK_TODAY;
      if (!active) return { active, serviceId: service.id, from, days: [] };
      const days = computeAvailability(from, query.days ?? 14, {
        schedule: MOCK_SCHEDULE, rules: MOCK_RULES, blocks: [], busy, durationMin: service.durationMin, now: MOCK_NOW,
      });
      return {
        active, serviceId: service.id, from,
        days: state === 'empty' ? days.map((d) => ({ ...d, slots: [] })) : days,
      };
    },
    async holdSlot(slug, body: HoldSlotRequest) {
      await wait();
      if (!active) throw new ApiError('agenda_unavailable', 'Agenda no disponible', 409);
      if (holdsUntilTaken-- === 0) {
        busyFor(slug).push({ start: body.start, end: addMinutes(body.start, 30) });
        throw new ApiError('slot_taken', 'Alguien acaba de separar esa hora. Elige otra.', 409);
      }
      return { expiresAt: new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString() };
    },
    async releaseHold() {
      await wait();
    },
    async createBooking(slug, body: CreateBookingRequest) {
      await wait();
      if (!active) throw new ApiError('agenda_unavailable', 'Agenda no disponible', 409);
      const replayed = body.idempotencyKey ? byIdempotencyKey.get(body.idempotencyKey) : undefined;
      if (replayed) return replayed;
      const busy = busyFor(slug);
      if (failure === 'slot_taken') busy.push({ start: body.start, end: addMinutes(body.start, 30) });
      if (failure !== 'lost') takeFailure();
      const id = `appt-${appointments.size + 1}`;
      const booking = summary(mockProfileFor(slug), body.serviceId, body.start, { name: body.client.name, email: body.client.email }, id);
      const token = `mock-${id}`;
      appointments.set(token, { booking, canChange: true });
      busy.push({ start: booking.start, end: booking.end });
      const result = { booking, manageToken: token };
      if (body.idempotencyKey) byIdempotencyKey.set(body.idempotencyKey, result);
      if (failure === 'lost') {
        failure = null;
        throw new ApiError('network', 'Sin conexión');
      }
      return result;
    },
    icsUrl(token) {
      return icsDataUrl(eventFromBooking(find(token).booking, `${location.origin}${SITE_PATHS.manage}${encodeURIComponent(token)}`));
    },
    async getAppointment(token): Promise<ManagedAppointmentResponse> {
      await wait();
      const appt = find(token);
      return {
        booking: appt.booking,
        canChange: appt.canChange && appt.booking.status === 'confirmed',
        changeDeadline: addMinutes(appt.booking.start, -CLIENT_CHANGE_CUTOFF_MIN),
      };
    },
    async cancelAppointment(token) {
      await wait();
      const appt = find(token);
      if (!appt.canChange) throw new ApiError('too_late', 'Muy tarde', 422);
      appt.booking = { ...appt.booking, status: 'cancelled' };
      appt.canChange = false;
      return { booking: appt.booking };
    },
    async confirmAppointment(token) {
      await wait();
      const appt = find(token);
      if (appt.booking.status === 'cancelled') throw new ApiError('conflict', 'Cancelada', 409);
      if (new Date(appt.booking.start).getTime() <= Date.now()) throw new ApiError('too_late', 'Muy tarde', 422);
      appt.booking = { ...appt.booking, clientConfirmation: 'confirmed' };
      return { booking: appt.booking };
    },
    async joinWaitlist(slug, body) {
      await wait();
      if (!active) throw new ApiError('agenda_unavailable', 'Agenda no disponible', 409);
      takeFailure();
      const { services } = mockProfileFor(slug);
      const service = services.find((s) => s.id === body.serviceId) ?? services[0];
      return { entry: { id: `wait-${Date.now()}`, dates: body.dates, serviceName: service.name } };
    },
    async joinTeamWaitlist(_teamSlug, body) {
      await wait();
      if (!active) throw new ApiError('agenda_unavailable', 'Agenda no disponible', 409);
      takeFailure();
      const [first] = body.offerings;
      const service = mockProfileFor(first.slug).services.find((s) => s.id === first.serviceId);
      return { entry: { id: `wait-${Date.now()}`, dates: body.dates, serviceName: service?.name ?? '' } };
    },
    async leaveWaitlist(token) {
      await wait();
      if (token === 'invalid') throw new ApiError('not_found', 'No existe', 404);
      return { pro: { slug: MOCK_PROFILE.slug, name: MOCK_PROFILE.name } };
    },
    async rescheduleAppointment(token, body) {
      await wait();
      const appt = find(token);
      if (!appt.canChange) throw new ApiError('too_late', 'Muy tarde', 422);
      if (failure === 'slot_taken') busyFor(appt.booking.pro.slug).push({ start: body.start, end: addMinutes(body.start, 30) });
      takeFailure();
      appt.booking = { ...appt.booking, start: body.start, end: addMinutes(body.start, appt.booking.durationMin) };
      return { booking: appt.booking };
    },
  };
}
