/**
 * In-memory API for local development and visual QA (`?mock=1`).
 *
 * Query switches:
 *   state=unavailable   subscription expired (active: false)
 *   state=notfound      unknown slug
 *   state=empty         no free slots in the window
 *   fail=<code>         first booking/reschedule attempt fails with that code
 *                       (slot_taken, agenda_unavailable, validation, captcha_failed, network)
 *   delay=<ms>          artificial latency (default 350)
 * Manage tokens: late (cutoff passed), cancelled, invalid (404); any other token is the demo appointment.
 */
import type {
  AvailabilityResponse, BookingSummary, CreateBookingRequest, ManagedAppointmentResponse, PublicProfile,
} from '@shared/api';
import { CLIENT_CHANGE_CUTOFF_MIN } from '@shared/api';
import { computeAvailability, type Interval } from '@shared/availability';
import { addMinutes } from '@shared/time';
import { ApiError, type ApiClient } from '../lib/api';
import { MOCK_NOW, MOCK_PROFILE, MOCK_RULES, MOCK_SCHEDULE, MOCK_TODAY, mockBusy } from './fixtures';

interface StoredAppointment {
  booking: BookingSummary;
  canChange: boolean;
}

function summary(profile: PublicProfile, serviceId: string, start: string, client: { name: string; email: string }, id: string): BookingSummary {
  const service = profile.services.find((s) => s.id === serviceId) ?? profile.services[0];
  return {
    appointmentId: id,
    status: 'confirmed',
    start,
    end: addMinutes(start, service.durationMin),
    serviceId: service.id,
    serviceName: service.name,
    durationMin: service.durationMin,
    priceCop: service.priceCop,
    client,
    pro: {
      slug: profile.slug, name: profile.name, title: profile.title,
      address: profile.address, city: profile.city, neighborhood: profile.neighborhood,
      phone: profile.phone, initials: profile.initials,
    },
  };
}

export function createMockApi(params: URLSearchParams): ApiClient {
  const state = params.get('state');
  let failure = params.get('fail');
  const delayMs = Number(params.get('delay') ?? 350);
  const busy: Interval[] = mockBusy();
  const mariana = { name: 'Mariana Gómez', email: 'mariana@correo.com' };
  const appointments = new Map<string, StoredAppointment>([
    ['demo', { booking: summary(MOCK_PROFILE, 'valoracion', '2026-10-22T15:00:00.000Z', mariana, 'appt-demo'), canChange: true }],
    ['late', { booking: summary(MOCK_PROFILE, 'valoracion', '2026-10-20T22:30:00.000Z', mariana, 'appt-late'), canChange: false }],
    ['cancelled', {
      booking: { ...summary(MOCK_PROFILE, 'valoracion', '2026-10-22T15:00:00.000Z', mariana, 'appt-cancelled'), status: 'cancelled' },
      canChange: false,
    }],
  ]);

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
      return { profile: { ...MOCK_PROFILE, slug: slug || MOCK_PROFILE.slug }, active };
    },
    async getAvailability(_slug, query): Promise<AvailabilityResponse> {
      await wait();
      const service = MOCK_PROFILE.services.find((s) => s.id === query.serviceId) ?? MOCK_PROFILE.services[0];
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
    async createBooking(slug, body: CreateBookingRequest) {
      await wait();
      if (!active) throw new ApiError('agenda_unavailable', 'Agenda no disponible', 409);
      if (failure === 'slot_taken') busy.push({ start: body.start, end: addMinutes(body.start, 30) });
      takeFailure();
      const id = `appt-${appointments.size + 1}`;
      const booking = summary({ ...MOCK_PROFILE, slug }, body.serviceId, body.start, { name: body.client.name, email: body.client.email }, id);
      const token = `mock-${id}`;
      appointments.set(token, { booking, canChange: true });
      busy.push({ start: booking.start, end: booking.end });
      return { booking, manageToken: token };
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
    async rescheduleAppointment(token, body) {
      await wait();
      const appt = find(token);
      if (!appt.canChange) throw new ApiError('too_late', 'Muy tarde', 422);
      if (failure === 'slot_taken') busy.push({ start: body.start, end: addMinutes(body.start, 30) });
      takeFailure();
      appt.booking = { ...appt.booking, start: body.start, end: addMinutes(body.start, appt.booking.durationMin) };
      return { booking: appt.booking };
    },
  };
}
