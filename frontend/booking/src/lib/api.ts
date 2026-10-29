/**
 * Public API client for the booking site. `ApiClient` is an interface so the
 * dev-only mock (src/mock) can stand in for the HTTP implementation.
 */
import {
  apiPaths,
  type ApiErrorBody,
  type AvailabilityQuery,
  type AvailabilityResponse,
  type BookingMutationResponse,
  type CancelBookingRequest,
  type CreateBookingRequest,
  type CreateBookingResponse,
  type ErrorCode,
  type GetPublicProResponse,
  type HoldSlotRequest,
  type HoldSlotResponse,
  type JoinTeamWaitlistRequest,
  type JoinWaitlistRequest,
  type JoinWaitlistResponse,
  type LeaveWaitlistResponse,
  type ManagedAppointmentResponse,
  type RescheduleBookingRequest,
} from '@shared/api';

export type ApiErrorCode = ErrorCode | 'network';

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status = 0,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClient {
  getPro(slug: string): Promise<GetPublicProResponse>;
  getAvailability(slug: string, query: AvailabilityQuery): Promise<AvailabilityResponse>;
  createBooking(slug: string, body: CreateBookingRequest): Promise<CreateBookingResponse>;
  /** Holds the picked hour a few minutes for this visitor (`slot_taken` when it is no longer free). */
  holdSlot(slug: string, body: HoldSlotRequest): Promise<HoldSlotResponse>;
  getAppointment(token: string): Promise<ManagedAppointmentResponse>;
  cancelAppointment(token: string, body: CancelBookingRequest): Promise<BookingMutationResponse>;
  rescheduleAppointment(token: string, body: RescheduleBookingRequest): Promise<BookingMutationResponse>;
  /** "Sí, voy" — idempotent, allowed until the start. */
  confirmAppointment(token: string): Promise<BookingMutationResponse>;
  joinWaitlist(slug: string, body: JoinWaitlistRequest): Promise<JoinWaitlistResponse>;
  /** Team page «Cualquiera disponible»: one request for every member offering the service. */
  joinTeamWaitlist(teamSlug: string, body: JoinTeamWaitlistRequest): Promise<JoinWaitlistResponse>;
  leaveWaitlist(token: string): Promise<LeaveWaitlistResponse>;
  /** Where the confirmation screen's "Descargar archivo .ics" link points (a download, not a fetch). */
  icsUrl(token: string): string;
}

const TIMEOUT_MS = 15_000;

export function createHttpApi(baseUrl: string): ApiClient {
  async function request<T>(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(baseUrl + path, {
        method,
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new ApiError('network', 'Sin conexión');
    } finally {
      clearTimeout(timer);
    }
    const data = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      const error = (data as ApiErrorBody | null)?.error;
      throw new ApiError(error?.code ?? 'internal', error?.message ?? 'Error', response.status, error?.fields);
    }
    return data as T;
  }

  return {
    getPro: (slug) => request(apiPaths.publicPro(slug)),
    getAvailability: (slug, query) => request(apiPaths.publicAvailability(slug, query)),
    createBooking: (slug, body) => request(apiPaths.publicBookings(slug), 'POST', body),
    holdSlot: (slug, body) => request(apiPaths.publicHolds(slug), 'POST', body),
    getAppointment: (token) => request(apiPaths.publicAppointment(token)),
    cancelAppointment: (token, body) => request(apiPaths.publicCancel(token), 'POST', body),
    rescheduleAppointment: (token, body) => request(apiPaths.publicReschedule(token), 'POST', body),
    confirmAppointment: (token) => request(apiPaths.publicConfirm(token), 'POST', {}),
    joinWaitlist: (slug, body) => request(apiPaths.publicWaitlist(slug), 'POST', body),
    joinTeamWaitlist: (teamSlug, body) => request(apiPaths.publicTeamWaitlist(teamSlug), 'POST', body),
    leaveWaitlist: (token) => request(apiPaths.publicLeaveWaitlist(token), 'POST', {}),
    icsUrl: (token) => baseUrl + apiPaths.publicAppointmentIcs(token),
  };
}

/** User-facing Spanish message for errors that don't have a dedicated screen. */
export function errorMessage(error: unknown): string {
  const code = error instanceof ApiError ? error.code : 'internal';
  switch (code) {
    case 'network':
      return 'No pudimos conectarnos. Revisa tu internet e inténtalo de nuevo.';
    case 'rate_limited':
      return 'Hiciste varios intentos seguidos. Espera un momento e inténtalo de nuevo.';
    case 'captcha_failed':
      return 'No pudimos verificar que eres una persona. Inténtalo de nuevo.';
    default:
      return 'Algo salió mal de nuestro lado. Inténtalo de nuevo en un momento.';
  }
}
