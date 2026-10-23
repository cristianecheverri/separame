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
  Appointment, AppointmentOutcome, AvailabilitySettings, Block, ClientConfirmation, ClientContact, ClientRecord, ISODate,
  ISOInstant, Payment, PaymentInstructions, PaymentMethod, PriceDisplay, PriceMigration, ProStats, WaitlistEntry, PricePackage, PriceVersion, PriceVersionStatus, ProProfile, Referral, Service, SubscriptionState,
  SubscriptionStatus, BookingRules, WeeklySchedule, Team, TeamMember, TeamRequest,
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
  /** Missing in pages generated before the option existed (derive with `priceDisplayOf`). */
  priceDisplay?: PriceDisplay;
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
  /** Team plan: the consultorio this professional belongs to («Parte de …»). */
  team?: { name: string; slug: string };
}

/** Team plan: embedded in the static /<teamSlug> page (first step «¿Con quién?»). */
export interface PublicTeam {
  slug: string;
  name: string;
  /** The owner's place: the consultorio's city and address. */
  city: string;
  neighborhood: string;
  address: string;
  phone: string | null;
  initials: string;
  /** Owner first; each one is a regular professional with their own /<slug> endpoints. */
  members: PublicProfile[];
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
  /**
   * Random UUID the page generates once per booking attempt (kept with the
   * draft). A retry with the same key — e.g. after the response was lost —
   * gets the appointment it already created instead of `slot_taken`.
   */
  idempotencyKey?: string;
}

export interface BookingSummary {
  appointmentId: string;
  status: Appointment['status'];
  /** Attendance confirmation ("Sí, voy"). */
  clientConfirmation: ClientConfirmation;
  start: ISOInstant;
  end: ISOInstant;
  serviceId: string;
  serviceName: string;
  durationMin: number;
  priceCop: number | null;
  priceDisplay?: PriceDisplay;
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

// GET /public/appointments/{token}/ics — the client's calendar file as a `text/calendar`
// attachment (Content-Disposition), linked from the confirmation screen.

/** POST /public/appointments/{token}/confirm — idempotent; allowed until the start. Returns BookingMutationResponse. */
export const CONFIRM_ACTION_PARAM = 'action=confirm';

// ── Waitlist ───────────────────────────────────────────────────────────────

export const WAITLIST_MAX_DATES = 7;

export interface JoinWaitlistRequest {
  serviceId: string;
  /** 1–WAITLIST_MAX_DATES Bogotá dates within the booking window. */
  dates: ISODate[];
  client: ClientContact;
  consent: true;
  turnstileToken: string;
}

export interface JoinWaitlistResponse {
  entry: Pick<WaitlistEntry, 'id' | 'dates' | 'serviceName'>;
}

export interface WaitlistResponse {
  entries: WaitlistEntry[];
}

/** POST /public/waitlist/{token}/leave — idempotent; 404 = invalid/expired link. */
export interface LeaveWaitlistResponse {
  pro: { slug: string; name: string };
}

// ── Public prices (landing) ────────────────────────────────────────────────

/** One package of the active default price version, ready to display. */
export interface PublicPricePackage {
  months: number;
  amountCop: number;
  /** Monthly equivalent, rounded to the peso ($50.000 / 12 → 4167). */
  monthlyCop: number;
  /** Months saved against the version's headline monthly price (0 when none). */
  freeMonths: number;
  /** The cheapest per-month multi-month package, when it really is cheaper ("El más conveniente"). */
  best: boolean;
}

/** GET /public/prices — no auth, no input; built by `toPublicPrices` (shared/landing.ts). */
export interface PublicPricesResponse {
  priceVersionId: string;
  /** Display name of the version, e.g. "Fundador". */
  name: string;
  /** Founder pricing ("Precio fundador"): kept while the professional keeps renewing. */
  founder: boolean;
  currency: 'COP';
  /** Headline "desde $5.000 al mes". */
  fromMonthlyCop: number;
  /** Free trial length for new professionals (TRIAL_DAYS). */
  trialDays: number;
  /** Multi-month packages by length, a 1-month package (if any) last. */
  packages: PublicPricePackage[];
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
  /** Team plan: present once the admin approved it (members feed the professional selector). */
  team: TeamView | null;
  /** The latest team request (pending, approved or rejected), or null if they never asked. */
  teamRequest: TeamRequest | null;
}

/**
 * Team plan: the panel acts on a team member by sending this header with the member's proId
 * on /me routes that support it (appointments, services, availability, clients, stats, waitlist).
 */
export const ACTING_PRO_HEADER = 'x-separame-pro';

export interface TeamMemberView extends TeamMember {
  publicUrl: string;
}

export interface TeamView extends Omit<Team, 'members'> {
  publicUrl: string;
  members: TeamMemberView[];
}

export interface TeamResponse {
  team: TeamView | null;
  request: TeamRequest | null;
}

export interface CreateTeamRequestBody {
  name: string;
  professionals: number;
  message: string;
}

export interface UpdateTeamBody {
  name: string;
  slug: string;
}

export interface UpsertTeamMemberBody {
  name: string;
  title: string;
  slug: string;
}

export interface UpdateProfileRequest {
  name: string;
  title: string;
  city: string;
  neighborhood: string;
  address: string;
  phone: string | null;
  slug: string;
}

export interface OnboardingRequest extends UpdateProfileRequest {
  /**
   * Referral code from /r/<code> (kept by the signup page in localStorage). Optional: when missing,
   * the code the pre sign-up trigger saved for this email (Cognito clientMetadata) is used. An
   * invalid code, your own email or an email that already had a trial never fails onboarding: it is ignored.
   */
  referralCode?: string;
}

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
  /** Required (> 0) with `priceDisplay: 'fixed'`; ignored (stored as null) otherwise. */
  priceCop: number | null;
  /** Optional for older clients: missing → `fixed` when priceCop > 0, else `free`. */
  priceDisplay?: PriceDisplay;
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

/** POST /me/appointments/{id}/outcome — only after the start; null clears it. */
export interface SetOutcomeRequest {
  outcome: AppointmentOutcome | null;
}

export interface AppointmentResponse {
  appointment: Appointment;
}

/** GET /me/slots?serviceId&from&days — same shape as the public availability. */
export type ProSlotsResponse = AvailabilityResponse;

// ── Clients ────────────────────────────────────────────────────────────────

export interface ClientsQuery {
  q?: string;
}

export interface ClientsResponse {
  /** Most recent activity first. */
  clients: ClientRecord[];
}

export interface ClientDetailResponse {
  client: ClientRecord;
  /** Newest first. */
  appointments: Appointment[];
}

export interface UpdateClientNotesRequest {
  notes: string;
}

// ── Stats ──────────────────────────────────────────────────────────────────

/** Max days per stats query. */
export const STATS_MAX_DAYS = 366;

export interface StatsQuery {
  from: ISODate;
  to: ISODate;
}

export interface StatsResponse {
  stats: ProStats;
  /** Same-length period right before, for "vs. periodo anterior". */
  previous: ProStats;
}

// ── Web push (pro's devices) ──────────────────────────────────────────────

/** Browser PushSubscription.toJSON(). */
export interface PushSubscriptionRequest {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** Shown in the device list ("iPhone · Safari"). */
  deviceLabel?: string;
}

export interface RemovePushSubscriptionRequest {
  endpoint: string;
}

/** POST /me/push-subscriptions and /remove return PushConfigResponse; /test returns this (409 when push isn't configured). */
export interface TestPushResponse {
  sent: number;
}

/**
 * GET /me/push-config — read at runtime (not baked into config.json) so a stage
 * without VAPID keys still deploys; push is simply disabled until they exist.
 */
export interface PushConfigResponse {
  /** VAPID public key (base64url) for PushManager.subscribe; null = push not configured. */
  vapidPublicKey: string | null;
  /** Devices of this pro already subscribed. */
  devices: { endpointHash: string; deviceLabel: string; createdAt: ISOInstant; lastSuccessAt: ISOInstant | null }[];
}

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
  /** Team plan: additional professionals paid on top of each package (0 without a team). */
  teamSeats: number;
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

// ── Referrals ──────────────────────────────────────────────────────────────

/** GET /public/referrals/{code} — who invited you ("Te invitó Dra. Laura Pérez"); 404 for unknown codes. */
export interface PublicReferralResponse {
  code: string;
  name: string;
  initials: string;
}

/** A professional's referral program summary (panel card, Suscripción section, admin detail). */
export interface ReferralSummary {
  code: string;
  /** https://separame.app/r/<code> */
  url: string;
  /** Free months earned in total (applied + saved). */
  monthsEarned: number;
  /** Months already added to the plan. */
  monthsApplied: number;
  /** Months saved while the plan was expired: added on the next approved payment. */
  monthsPending: number;
  /** Newest first. */
  referrals: Referral[];
}

/** GET /me/referrals — creates the code on first use for accounts that predate the program. */
export type ReferralsResponse = ReferralSummary;

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
  /** Team plan: approved additional professionals (0 without a team); package amounts include them. */
  teamSeats: number;
  /** Who invited this professional (null = signed up without a referral link). */
  referredBy: { proId: string; name: string; code: string } | null;
  /** Their own referral program; `code` is null until they first open it in the panel. */
  referrals: Omit<ReferralSummary, 'code' | 'url'> & { code: string | null; url: string | null };
}

export interface AdminTeamRequestRow {
  ownerId: string;
  ownerName: string;
  ownerTitle: string;
  request: TeamRequest;
  subscription: SubscriptionStatus;
  priceName: string;
}

export interface AdminTeamRow {
  ownerId: string;
  ownerName: string;
  name: string;
  slug: string;
  seats: number;
  /** Additional professionals created (≤ seats). */
  used: number;
  priceName: string;
  extraProfessionalCop: number | null;
  accessUntil: ISOInstant;
}

export interface AdminTeamsResponse {
  requests: AdminTeamRequestRow[];
  teams: AdminTeamRow[];
}

export interface ApproveTeamBody {
  seats: number;
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
  /** Team plan: monthly value per additional professional (null = none). Older clients omit it. */
  extraProfessionalCop?: number | null;
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
  publicConfirm: (token: string) => `/public/appointments/${enc(token)}/confirm`,
  /** The client's .ics file (a plain navigation/download, not a fetch). */
  publicAppointmentIcs: (token: string) => `/public/appointments/${enc(token)}/ics`,
  publicWaitlist: (slug: string) => `/public/pros/${enc(slug)}/waitlist`,
  publicLeaveWaitlist: (token: string) => `/public/waitlist/${enc(token)}/leave`,
  publicPrices: () => '/public/prices',
  publicReferral: (code: string) => `/public/referrals/${enc(code)}`,

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
  appointmentOutcome: (id: string) => `/me/appointments/${enc(id)}/outcome`,
  waitlist: () => '/me/waitlist',
  waitlistEntry: (id: string) => `/me/waitlist/${enc(id)}`,
  clients: (q?: ClientsQuery) => `/me/clients${q ? qs({ ...q }) : ''}`,
  client: (key: string) => `/me/clients/${enc(key)}`,
  clientNotes: (key: string) => `/me/clients/${enc(key)}/notes`,
  stats: (q: StatsQuery) => `/me/stats${qs({ ...q })}`,
  pushConfig: () => '/me/push-config',
  pushSubscriptions: () => '/me/push-subscriptions',
  removePushSubscription: () => '/me/push-subscriptions/remove',
  testPush: () => '/me/push-subscriptions/test',
  calendarSync: () => '/me/calendar-sync',
  calendarSyncRotate: () => '/me/calendar-sync/rotate',
  publicCalendarFeed: (token: string) => `/public/calendar/${enc(token)}.ics`,
  billing: () => '/me/billing',
  paymentNotices: () => '/me/billing/payment-notices',
  referrals: () => '/me/referrals',
  team: () => '/me/team',
  teamRequest: () => '/me/team-request',
  teamMembers: () => '/me/team/members',
  teamMember: (proId: string) => `/me/team/members/${enc(proId)}`,

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
  adminTeams: () => '/admin/teams',
  adminApproveTeam: (proId: string) => `/admin/team-requests/${enc(proId)}/approve`,
  adminRejectTeam: (proId: string) => `/admin/team-requests/${enc(proId)}/reject`,
};

/**
 * API base URL for the current site: separame.app → https://api.separame.app,
 * dev.separame.app → https://api.dev.separame.app. Local dev passes an override.
 */
export function apiBaseFor(hostname: string, override?: string): string {
  if (override) return override.replace(/\/$/, '');
  return `https://api.${hostname}`;
}
