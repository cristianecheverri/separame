/**
 * HTTP API contract: request/response shapes for every route in `routes.ts`,
 * plus URL builders so the frontends never hand-write paths. Pure types +
 * tiny helpers (no zod) — safe for the booking bundle.
 *
 * Errors always come back as `{ error: { code, message, fields? } }` with a
 * matching HTTP status (400/401/403/404/409/422/429/500).
 */
import type { DayAvailability } from './availability';
import type { Holiday } from './holidays';
import type { SlugProblem } from './slug';
import type {
  Appointment, AvailabilitySettings, Block, ClientContact, ISODate, ISOInstant, Payment, PaymentInstructions,
  PaymentMethod, PriceMigration, PricePackage, PriceVersion, PriceVersionStatus, ProProfile, Service, SubscriptionState,
  SubscriptionStatus, BookingRules, WeeklySchedule,
} from './types';

// ── Errors ─────────────────────────────────────────────────────────────────

export type ErrorCode =
  | 'validation'          // 400 — body/query failed the schema (see `fields`)
  | 'unauthorized'        // 401
  | 'forbidden'           // 403 — not admin / not the owner
  | 'not_found'           // 404
  | 'slot_taken'          // 409 — someone booked that slot first
  | 'slug_taken'          // 409
  | 'conflict'            // 409 — generic concurrent change
  | 'agenda_unavailable'  // 409 — subscription expired: no new bookings
  | 'read_only'           // 403 — expired subscription: panel is read-only
  | 'needs_onboarding'    // 409 — Cognito user without a professional profile yet
  | 'too_late'            // 422 — change window closed (< 2 h before the appointment)
  | 'captcha_failed'      // 422
  | 'rate_limited'        // 429
  | 'internal';           // 500

/** HTTP status for each error code (single source for the backend and tests). */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  validation: 400,
  unauthorized: 401,
  forbidden: 403,
  read_only: 403,
  not_found: 404,
  slot_taken: 409,
  slug_taken: 409,
  conflict: 409,
  agenda_unavailable: 409,
  needs_onboarding: 409,
  too_late: 422,
  captcha_failed: 422,
  rate_limited: 429,
  internal: 500,
};

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; fields?: Record<string, string> };
}

/** Client can still cancel/reschedule until this many minutes before the start. */
export const CLIENT_CHANGE_CUTOFF_MIN = 120;
/** Default availability window requested by the booking page. */
export const AVAILABILITY_DAYS = 14;

// ── Public ─────────────────────────────────────────────────────────────────

export interface PublicService {
  id: string;
  name: string;
  durationMin: number;
  priceCop: number | null;
  description: string;
}

/** Also embedded in the static /<slug> page as `window.__SEPARAME__.profile`. */
export interface PublicProfile {
  slug: string;
  name: string;
  title: string;
  city: string;
  neighborhood: string;
  address: string;
  phone: string | null;
  initials: string;
  services: PublicService[];
}

export interface GetPublicProResponse {
  profile: PublicProfile;
  /** false → show "Agenda no disponible temporalmente" (never "no ha pagado"). */
  active: boolean;
}

export interface AvailabilityQuery {
  serviceId: string;
  /** Bogotá date; defaults to today. */
  from?: ISODate;
  /** 1–31; defaults to AVAILABILITY_DAYS. */
  days?: number;
}

export interface AvailabilityResponse {
  active: boolean;
  serviceId: string;
  from: ISODate;
  /** Empty when `active` is false. */
  days: DayAvailability[];
}

export interface CreateBookingRequest {
  serviceId: string;
  start: ISOInstant;
  client: ClientContact;
  /** Ley 1581 authorization checkbox — must be true. */
  consent: true;
  turnstileToken: string;
}

export interface BookingSummary {
  appointmentId: string;
  status: Appointment['status'];
  start: ISOInstant;
  end: ISOInstant;
  serviceId: string;
  serviceName: string;
  durationMin: number;
  priceCop: number | null;
  client: { name: string; email: string };
  pro: {
    slug: string;
    name: string;
    title: string;
    city: string;
    neighborhood: string;
    address: string;
    /** For the "call the office" button when it's too late to change online. */
    phone: string | null;
    initials: string;
  };
}

export interface CreateBookingResponse {
  booking: BookingSummary;
  /** Signed token for /c/<token> (also emailed). */
  manageToken: string;
}

export interface ManagedAppointmentResponse {
  booking: BookingSummary;
  /** false once the cutoff passed or the appointment is cancelled/past. */
  canChange: boolean;
  changeDeadline: ISOInstant;
}

export interface CancelBookingRequest {
  reason?: string;
}

export interface RescheduleBookingRequest {
  start: ISOInstant;
}

export interface BookingMutationResponse {
  booking: BookingSummary;
}

// ── Professional ───────────────────────────────────────────────────────────

export interface MeResponse {
  email: string;
  isAdmin: boolean;
  /** null → the user must finish onboarding (create profile + slug). */
  profile: ProProfile | null;
  subscription: SubscriptionStatus | null;
  /** https://separame.app/<slug> */
  publicUrl: string | null;
}

export interface OnboardingRequest {
  name: string;
  title: string;
  city: string;
  neighborhood: string;
  address: string;
  phone: string | null;
  slug: string;
}

export type UpdateProfileRequest = OnboardingRequest;

export interface ProfileResponse {
  profile: ProProfile;
  subscription: SubscriptionStatus;
  publicUrl: string;
}

export interface SlugCheckResponse {
  slug: string;
  available: boolean;
  problem: SlugProblem | 'taken' | null;
  /** A free alternative when taken. */
  suggestion: string | null;
}

export interface ServicesResponse {
  services: Service[];
}

export interface UpsertServiceRequest {
  name: string;
  durationMin: number;
  priceCop: number | null;
  description: string;
  visible: boolean;
}

export interface ServiceResponse {
  service: Service;
}

export interface AvailabilitySettingsResponse {
  settings: AvailabilitySettings;
  upcomingHolidays: Holiday[];
}

export interface PutAvailabilityRequest {
  schedule: WeeklySchedule;
  rules: BookingRules;
}

export interface CreateBlockRequest {
  label: string;
  start: ISOInstant;
  end: ISOInstant;
}

export interface BlockResponse {
  block: Block;
}

export interface ListAppointmentsQuery {
  from: ISODate;
  to: ISODate;
}

export interface AppointmentsResponse {
  appointments: Appointment[];
}

export interface CreateAppointmentRequest {
  serviceId: string;
  start: ISOInstant;
  /** Email may be empty when the pro books for someone without one (then no emails go out). */
  client: ClientContact;
}

export interface MoveAppointmentRequest {
  start: ISOInstant;
}

export interface CancelAppointmentRequest {
  reason?: string;
}

export interface AppointmentResponse {
  appointment: Appointment;
}

/** GET /me/slots?serviceId&from&days — same shape as the public availability. */
export type ProSlotsResponse = AvailabilityResponse;

// ── Calendar sync (pro's own calendar) ────────────────────────────────────

/** The feed lists appointments from this many days ago… */
export const CALENDAR_FEED_PAST_DAYS = 30;
/** …up to this many days ahead (the booking window is ≤ 365 days). */
export const CALENDAR_FEED_FUTURE_DAYS = 365;

/**
 * Two complementary ways to get Sepárame appointments into the pro's calendar,
 * no OAuth: (1) a secret .ics subscription feed (all calendars; Google refreshes
 * it slowly, hours), and (2) calendar invitations attached to appointment emails
 * (near real time; same UID so moves/cancellations update the event).
 */
export interface CalendarSyncResponse {
  /** https://api.separame.app/public/calendar/<token>.ics — secret; rotate if leaked. */
  feedUrl: string;
  /** Same feed as webcal:// (Apple Calendar / iOS subscribe link). */
  webcalUrl: string;
  /** Google Calendar "add by URL" deep link. */
  googleUrl: string;
  /** Outlook.com "add from web" deep link. */
  outlookUrl: string;
  /** Send a calendar invitation (REQUEST/CANCEL) to the pro on every appointment change. */
  invitesEnabled: boolean;
  createdAt: ISOInstant;
}

export interface UpdateCalendarSyncRequest {
  invitesEnabled: boolean;
}

export interface BillingResponse {
  subscription: SubscriptionStatus;
  price: PriceVersion;
  /** Newest first; includes `pending` notices awaiting review. */
  payments: Payment[];
  /** How to pay (Nequi / transfer). `null` until the admin configures it. */
  instructions: PaymentInstructions | null;
}

/** "Ya pagué": the professional reports a Nequi/transfer payment for an admin to confirm. */
export interface PaymentNoticeRequest {
  months: number;
  method: 'nequi' | 'transfer';
  /** Transaction reference or a short note (optional). */
  reference: string;
}

export interface PaymentNoticeResponse {
  payment: Payment;
}

// ── Admin ──────────────────────────────────────────────────────────────────

export interface AdminStatsResponse {
  trial: number;
  active: number;
  grace: number;
  expired: number;
  /** "Ya pagué" notices waiting for review. */
  pendingNotices: number;
  /** Approved payments in the current Bogotá month. */
  revenueMonthCop: number;
}

export interface AdminSubscriptionRow {
  proId: string;
  name: string;
  slug: string;
  title: string;
  email: string;
  state: SubscriptionState;
  accessUntil: ISOInstant;
  graceUntil: ISOInstant;
  price: { id: string; name: string };
  lastPayment: Pick<Payment, 'method' | 'amountCop' | 'paidAt' | 'status'> | null;
  /** Has a "Ya pagué" notice waiting for review — shown first in the admin list. */
  pendingNotice: boolean;
}

export interface ListSubscriptionsQuery {
  state?: SubscriptionState;
  q?: string;
}

export interface ListSubscriptionsResponse {
  rows: AdminSubscriptionRow[];
}

export interface AdminProDetailResponse {
  profile: ProProfile;
  subscription: SubscriptionStatus;
  price: PriceVersion;
  payments: Payment[];
  upcomingAppointments: number;
  trialStartedAt: ISOInstant;
}

/** Methods an admin can record by hand (card/PSE only arrive through a future gateway). */
export type ManualPaymentMethod = Extract<PaymentMethod, 'transfer' | 'nequi' | 'cash' | 'courtesy'>;

export interface ManualPaymentRequest {
  /** Approving a professional's "Ya pagué" notice: its id (the notice becomes this approved payment). */
  noticeId?: string;
  method: ManualPaymentMethod;
  /** null for courtesy. */
  amountCop: number | null;
  paidAt: ISODate;
  period: { months: number } | { until: ISODate };
  reference: string;
  notify: boolean;
}

export interface ManualPaymentResponse {
  payment: Payment;
  subscription: SubscriptionStatus;
}

export interface RejectNoticeRequest {
  reason: string;
}

export interface PriceWithUsage extends PriceVersion {
  subscriptions: number;
}

export interface ListPricesResponse {
  prices: PriceWithUsage[];
}

export interface CreatePriceRequest {
  code: string;
  name: string;
  monthlyCop: number | null;
  packages: PricePackage[];
  status: Exclude<PriceVersionStatus, 'inactive'>;
  isDefault: boolean;
}

/** Amounts are immutable once a version has subscriptions; only status/default change. */
export interface UpdatePriceRequest {
  status?: PriceVersionStatus;
  isDefault?: boolean;
}

export interface PriceResponse {
  price: PriceVersion;
}

export interface CreateMigrationRequest {
  fromPriceVersionId: string;
  toPriceVersionId: string;
  target: PriceMigration['target'];
  effectiveDate: ISODate;
}

export interface MigrationsResponse {
  migrations: PriceMigration[];
}

export interface MigrationResponse {
  migration: PriceMigration;
}

// ── URL builders ───────────────────────────────────────────────────────────

const enc = encodeURIComponent;
const qs = (params: Record<string, string | number | undefined>) => {
  const s = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${enc(k)}=${enc(String(v))}`)
    .join('&');
  return s ? `?${s}` : '';
};

export const apiPaths = {
  publicPro: (slug: string) => `/public/pros/${enc(slug)}`,
  publicAvailability: (slug: string, q: AvailabilityQuery) => `/public/pros/${enc(slug)}/availability${qs({ ...q })}`,
  publicBookings: (slug: string) => `/public/pros/${enc(slug)}/bookings`,
  publicAppointment: (token: string) => `/public/appointments/${enc(token)}`,
  publicCancel: (token: string) => `/public/appointments/${enc(token)}/cancel`,
  publicReschedule: (token: string) => `/public/appointments/${enc(token)}/reschedule`,

  me: () => '/me',
  onboarding: () => '/me/onboarding',
  profile: () => '/me/profile',
  slugCheck: (slug: string) => `/me/slug-check${qs({ slug })}`,
  services: () => '/me/services',
  service: (id: string) => `/me/services/${enc(id)}`,
  availability: () => '/me/availability',
  blocks: () => '/me/blocks',
  block: (id: string) => `/me/blocks/${enc(id)}`,
  appointments: (q?: ListAppointmentsQuery) => `/me/appointments${q ? qs({ ...q }) : ''}`,
  appointment: (id: string) => `/me/appointments/${enc(id)}`,
  cancelAppointment: (id: string) => `/me/appointments/${enc(id)}/cancel`,
  slots: (q: AvailabilityQuery) => `/me/slots${qs({ ...q })}`,
  calendarSync: () => '/me/calendar-sync',
  calendarSyncRotate: () => '/me/calendar-sync/rotate',
  publicCalendarFeed: (token: string) => `/public/calendar/${enc(token)}.ics`,
  billing: () => '/me/billing',
  paymentNotices: () => '/me/billing/payment-notices',

  adminStats: () => '/admin/stats',
  adminSubscriptions: (q?: ListSubscriptionsQuery) => `/admin/subscriptions${q ? qs({ ...q }) : ''}`,
  adminPro: (proId: string) => `/admin/pros/${enc(proId)}`,
  adminManualPayment: (proId: string) => `/admin/pros/${enc(proId)}/manual-payments`,
  adminRejectNotice: (proId: string, paymentId: string) =>
    `/admin/pros/${enc(proId)}/payment-notices/${enc(paymentId)}/reject`,
  adminPrices: () => '/admin/prices',
  adminPrice: (id: string) => `/admin/prices/${enc(id)}`,
  adminMigrations: () => '/admin/price-migrations',
  adminCancelMigration: (id: string) => `/admin/price-migrations/${enc(id)}/cancel`,
};

/**
 * API base URL for the current site: separame.app → https://api.separame.app,
 * dev.separame.app → https://api.dev.separame.app. Local dev passes an override.
 */
export function apiBaseFor(hostname: string, override?: string): string {
  if (override) return override.replace(/\/$/, '');
  return `https://api.${hostname}`;
}
