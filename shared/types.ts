/**
 * Domain types shared by the backend, the CDK app and both frontends.
 * Pure TypeScript (no zod) so the booking bundle can import them for free.
 */
import type { HHmm, ISODate, ISOInstant, Weekday } from './time';

export type { HHmm, ISODate, ISOInstant, Weekday } from './time';

export type Stage = 'dev' | 'prod';

// ── Professional ───────────────────────────────────────────────────────────

export interface ProProfile {
  id: string;
  slug: string;
  /** Display name as the client sees it, e.g. "Dra. Laura Pérez". */
  name: string;
  /** Profession / specialty, e.g. "Odontóloga". */
  title: string;
  city: string;
  /** Neighborhood shown next to the city in the booking header, e.g. "El Poblado" (optional). */
  neighborhood: string;
  /** Street address shown on the booking page and in emails (optional for online pros). */
  address: string;
  /** Contact phone shown on the "agenda no disponible" page (optional). */
  phone: string | null;
  /** Login email (Cognito); also the Reply-To of client emails. A team member carries the owner's. */
  email: string;
  /** Team plan: set only on team members (no user of their own; managed by this owner). */
  ownerId?: string;
  /** Logo or photo shown on the booking page instead of the initials (site path under /media/). */
  logo?: string;
  createdAt: ISOInstant;
  updatedAt: ISOInstant;
}

/**
 * How a service's price shows on the public page and in emails:
 * `fixed` = the reference value (`priceCop` > 0), `free` = "Sin costo",
 * `agreed` = "Precio a convenir", `hidden` = no price at all.
 * Missing on items saved before the option existed: derived from `priceCop`
 * (> 0 → `fixed`, otherwise `free`) by `priceDisplayOf` in shared/format.ts.
 */
export type PriceDisplay = 'fixed' | 'free' | 'agreed' | 'hidden';

export interface Service {
  id: string;
  name: string;
  /** Multiple of 5 minutes. */
  durationMin: number;
  /** Reference price in COP (only with `priceDisplay: 'fixed'`; otherwise `null`). Never charged online. */
  priceCop: number | null;
  /** Optional for backward compatibility (see PriceDisplay); the API always fills it. */
  priceDisplay?: PriceDisplay;
  description: string;
  /** Hidden services don't show on the public page but the pro can still book them. */
  visible: boolean;
  order: number;
}

export interface TimeRange {
  start: HHmm;
  end: HHmm;
}

export type WeeklySchedule = Record<Weekday, TimeRange[]>;

export interface BookingRules {
  /** Minimum gap between appointments. */
  bufferMin: number;
  /** Nobody can book closer than this to now. */
  minNoticeMin: number;
  /** How far ahead the calendar is open. */
  maxDaysAhead: number;
  /** Distance between offered start times (30 → 8:00, 8:30, 9:00…). */
  slotStepMin: number;
  /** Close automatically on Colombian public holidays. */
  closedOnHolidays: boolean;
}

/** A blocked period (vacation, congress…). Instants, so it can span partial days. */
export interface Block {
  id: string;
  label: string;
  start: ISOInstant;
  end: ISOInstant;
}

export interface AvailabilitySettings {
  schedule: WeeklySchedule;
  rules: BookingRules;
  blocks: Block[];
}

// ── Appointments ───────────────────────────────────────────────────────────

export type AppointmentStatus = 'confirmed' | 'cancelled';
/** The client's answer to "¿Confirmas tu asistencia?" (reminder email / manage page). */
export type ClientConfirmation = 'pending' | 'confirmed';
/** What actually happened, marked by the pro after the start time. */
export type AppointmentOutcome = 'attended' | 'no_show';
export type Actor = 'client' | 'pro' | 'admin' | 'system';

export interface ClientContact {
  name: string;
  /**
   * Optional on public bookings and pro-created appointments ('' = no emails to the client:
   * no confirmation, reminder or attendance request). Required on the waitlist.
   */
  email: string;
  /** National number without +57, digits only. Required on public bookings and the waitlist; may be '' on pro-created appointments. */
  phone: string;
}

export interface Appointment {
  id: string;
  proId: string;
  serviceId: string;
  /** Snapshot at booking time — later service edits don't rewrite history. */
  serviceName: string;
  durationMin: number;
  priceCop: number | null;
  /** Snapshot of the service's price display (missing on old items: derived from priceCop). */
  priceDisplay?: PriceDisplay;
  start: ISOInstant;
  end: ISOInstant;
  status: AppointmentStatus;
  client: ClientContact;
  createdBy: Actor;
  createdAt: ISOInstant;
  updatedAt: ISOInstant;
  cancelledBy?: Actor;
  cancelReason?: string;
  /** When the 24 h reminder went out (absent = pending or not applicable). */
  reminderSentAt?: ISOInstant;
  /** Booked by a waitlist client after the «Se liberó un cupo» email for that day (a recovered slot). */
  fromWaitlist?: boolean;
  /** Attendance confirmation by the client (missing on old items = 'pending'). */
  clientConfirmation: ClientConfirmation;
  confirmedAt?: ISOInstant;
  /** Marked by the pro once the appointment started; absent = not marked. */
  outcome?: AppointmentOutcome;
  outcomeAt?: ISOInstant;
  /** Monotonic revision (0 on create, +1 on every CALENDAR change: move, cancel): calendar SEQUENCE. Confirm/outcome don't bump it. */
  revision: number;
  /**
   * Key of the client record (see ClientRecord) this appointment belongs to;
   * '' (NO_CLIENT_KEY) when the pro created it with a name only — no record, no client history link.
   */
  clientKey: string;
}

// ── Clients (lightweight history per professional) ─────────────────────────

/**
 * One record per client of a professional, keyed by `clientKey` (hash of the
 * phone, or of the normalized email when there's no phone). Aggregates are
 * maintained from appointment events. Notes are free text for logistics only —
 * the UI warns not to store health data (datos sensibles, Ley 1581).
 */
export interface ClientRecord {
  key: string;
  name: string;
  email: string;
  phone: string;
  firstSeenAt: ISOInstant;
  lastAppointmentAt: ISOInstant | null;
  nextAppointmentAt: ISOInstant | null;
  totals: { appointments: number; attended: number; noShows: number; cancelled: number };
  notes: string;
  updatedAt: ISOInstant;
}

// ── Waitlist ───────────────────────────────────────────────────────────────

export type WaitlistStatus = 'waiting' | 'booked' | 'expired' | 'removed';

/** A client waiting for a slot on specific days; offered freed slots first-come. */
export interface WaitlistEntry {
  id: string;
  proId: string;
  serviceId: string;
  serviceName: string;
  /** Bogotá dates the client can come (1–7). */
  dates: ISODate[];
  client: ClientContact;
  status: WaitlistStatus;
  createdAt: ISOInstant;
  notifiedCount: number;
  lastNotifiedAt: ISOInstant | null;
}

// ── Stats ──────────────────────────────────────────────────────────────────

export interface ProStats {
  from: ISODate;
  to: ISODate;
  /** Confirmed (non-cancelled) appointments in the range. */
  appointments: number;
  cancelled: number;
  attended: number;
  noShows: number;
  /** Past confirmed appointments the pro hasn't marked yet. */
  unmarked: number;
  /** Booked minutes / bookable minutes (schedule − blocks − holidays), 0–1. */
  occupancy: number;
  newClients: number;
  returningClients: number;
  /** Sum of reference prices of non-cancelled appointments (estimate, never charged). */
  estimatedRevenueCop: number;
  byService: { serviceId: string; serviceName: string; appointments: number; revenueCop: number }[];
  /** 0 = Monday … 6 = Sunday. */
  byWeekday: { weekday: number; appointments: number }[];
  bySource: { client: number; pro: number };
  /** Share of past appointments that ended as no-show, 0–1. */
  noShowRate: number;
  /** «Lo que Sepárame hizo por ti». */
  value: {
    /** Confirmed appointments the clients booked themselves from the public link. */
    online: number;
    /** online / confirmed appointments, 0–1. */
    onlineShare: number;
    /** Estimate: online × MINUTES_SAVED_PER_ONLINE_BOOKING (shared/stats.ts). */
    savedMinutes: number;
    /** 24 h reminders that went out for appointments of the range. */
    remindersSent: number;
    /** Of the confirmed appointments with a reminder, the share whose client answered «Sí, voy», 0–1. */
    confirmationRate: number;
    /** Booked by a waitlist client after the «Se liberó un cupo» email (`Appointment.fromWaitlist`). */
    recovered: number;
  };
  /** Cancelled less than 24 h before the start. */
  cancelledLate: number;
  /** Confirmed appointments by Bogotá start hour (0–23), only hours that have some, ascending. */
  byHour: { hour: number; appointments: number }[];
  /** Average days between an online booking and its appointment (one decimal); null without online bookings. */
  avgLeadDays: number | null;
  /** Share of online bookings for the same or the next day, 0–1. */
  shortLeadShare: number;
}

// ── Subscriptions, prices, payments ────────────────────────────────────────

export type SubscriptionState = 'trial' | 'active' | 'grace' | 'expired';

export interface SubscriptionStatus {
  state: SubscriptionState;
  trialEndsAt: ISOInstant;
  paidUntil: ISOInstant | null;
  /** max(trialEndsAt, paidUntil) — when the paid/trial period ends. */
  accessUntil: ISOInstant;
  /** accessUntil + grace days — when bookings actually stop. */
  graceUntil: ISOInstant;
  /** Whole days until accessUntil (0 when past). */
  daysLeft: number;
  /** Public page accepts new bookings. */
  canAcceptBookings: boolean;
  /** Panel is read-only (expired). */
  readOnly: boolean;
  priceVersionId: string;
}

export interface PricePackage {
  months: number;
  amountCop: number;
}

export type PriceVersionStatus = 'active' | 'draft' | 'inactive';

/** Immutable once used: changing a price = creating a new version. */
export interface PriceVersion {
  id: string;
  /** Stable machine code, e.g. "fundador-v1". */
  code: string;
  /** Display name, e.g. "Fundador". */
  name: string;
  currency: 'COP';
  /** Headline monthly price for "desde $5.000/mes". `null` while a draft has no price yet. */
  monthlyCop: number | null;
  packages: PricePackage[];
  /**
   * Team plan: monthly value of each additional professional (frozen with the version, like the
   * packages). `null` = this version has no team pricing yet (missing in versions created before teams).
   */
  extraProfessionalCop: number | null;
  status: PriceVersionStatus;
  /** Offered to new sign-ups (exactly one active default). */
  isDefault: boolean;
  createdAt: ISOInstant;
}

/**
 * No payment gateway integrated yet (Wompi was dropped; Nequi's own gateway
 * is being evaluated). Professionals pay by Nequi or bank transfer, tell us
 * with "Ya pagué" (a `pending` payment notice), and an admin approves it —
 * which extends `paidUntil` — or rejects it. Admins can also record payments.
 *
 * Multi-gateway ready: each future gateway is an adapter behind one interface
 * (create checkout, verify webhook signature, parse event) with its own
 * Lambda and webhook route `/webhooks/<provider>`; its payments use
 * `source: 'gateway'` + `gateway` details. Subscriptions, admin and panel
 * don't change when a gateway is added.
 */
export type PaymentMethod = 'transfer' | 'nequi' | 'cash' | 'courtesy' | 'card' | 'pse';
export type PaymentStatus = 'approved' | 'pending' | 'rejected';
/**
 * Who created the record: an admin, the professional's "Ya pagué" notice, a gateway webhook (future),
 * or the referral program ("Mes gratis por referido": method `courtesy`, amount 0, one month, `referral` set).
 */
export type PaymentSource = 'admin' | 'pro_notice' | 'gateway' | 'referral';
/** Gateways we may integrate; none is live yet. */
export type PaymentProvider = 'nequi' | 'wompi' | 'mercadopago';

export interface Payment {
  id: string;
  proId: string;
  method: PaymentMethod;
  status: PaymentStatus;
  source: PaymentSource;
  /** `null` for courtesy. */
  amountCop: number | null;
  months: number | null;
  /** When the money was received (as reported or recorded). */
  paidAt: ISOInstant;
  /** paidUntil after applying this payment (approved only). */
  until: ISOInstant | null;
  /** Transfer/Nequi reference or a note. */
  reference: string;
  priceVersionId: string;
  /** Admin who recorded it (source `admin`) — audit trail. */
  recordedBy?: { sub: string; email: string };
  /** Set only for `source: 'gateway'` (future). Idempotency key = provider + transactionId. */
  gateway?: { provider: PaymentProvider; transactionId: string; rawStatus: string };
  /** Admin who approved/rejected a notice, and when. */
  reviewedBy?: { sub: string; email: string };
  reviewedAt?: ISOInstant;
  rejectReason?: string;
  /** Set only for `source: 'referral'`: whose first payment earned this free month. */
  referral?: PaymentReferral;
  createdAt: ISOInstant;
}

export interface PaymentReferral {
  referredProId: string;
  /** Snapshot of the referred professional's display name. */
  referredName: string;
  /** accessUntil right before the free month was added ("tu plan pasó del … al …"). */
  previousUntil: ISOInstant;
}

// ── Referrals ──────────────────────────────────────────────────────────────

/**
 * A professional who signed up with someone's referral link, as the referrer sees it:
 * `trial` = registered, still in the free trial; `no_payment` = the trial ended without a qualifying payment;
 * `rewarded` = paid ≥ 1 month and the free month was added; `saved` = paid while the referrer was expired:
 * the month waits for the referrer's next approved payment.
 */
export type ReferralState = 'trial' | 'no_payment' | 'rewarded' | 'saved';

export interface Referral {
  referredProId: string;
  name: string;
  title: string;
  registeredAt: ISOInstant;
  trialEndsAt: ISOInstant;
  state: ReferralState;
  /** Months of the qualifying payment (null until it pays). */
  paidMonths: number | null;
  paidAt: ISOInstant | null;
}

/** How to pay us, shown on the plan screen. Stored as JSON in SSM (`SSM_PARAMS.billingInstructions`). */
export interface PaymentInstructions {
  /** e.g. [{ kind: 'nequi', label: 'Nequi', detail: '300 123 4567' }, { kind: 'transfer', label: 'Bancolombia ahorros', detail: '123-456789-01' }] */
  methods: { kind: 'nequi' | 'transfer'; label: string; detail: string }[];
  holderName: string;
  /** Extra line, e.g. "Envía el comprobante y activamos tu plan el mismo día." */
  note: string;
}

export interface PriceMigration {
  id: string;
  fromPriceVersionId: string;
  toPriceVersionId: string;
  target: { kind: 'group'; group: string } | { kind: 'pros'; proIds: string[] } | { kind: 'version' };
  effectiveDate: ISODate;
  noticeSentAt: ISOInstant | null;
  status: 'scheduled' | 'applied' | 'cancelled';
  affectedCount: number;
  createdAt: ISOInstant;
  createdBy: { sub: string; email: string };
}

// ── Team plan (docs/team-plan.md) ────────────────────────────────────────────

export type TeamRequestStatus = 'pending' | 'approved' | 'rejected';

/** The owner's request for the team plan (one at a time; a new one replaces a reviewed one). */
export interface TeamRequest {
  status: TeamRequestStatus;
  /** Consultorio / studio name. */
  name: string;
  /** How many professionals in total, counting the owner. */
  professionals: number;
  message: string;
  /** Additional professionals the admin approved. */
  seatsApproved: number | null;
  rejectReason: string | null;
  createdAt: ISOInstant;
  reviewedAt: ISOInstant | null;
}

/** A professional of the team (the owner is the first one). */
export interface TeamMember {
  proId: string;
  name: string;
  title: string;
  slug: string;
  isOwner: boolean;
  logo?: string;
}

export interface Team {
  name: string;
  slug: string;
  /** Approved additional professionals (the owner is not a seat). */
  seats: number;
  /** Owner first, then the members in the order they were added. */
  members: TeamMember[];
  /** The consultorio's logo on its page (site path under /media/). */
  logo?: string;
  createdAt: ISOInstant;
}
