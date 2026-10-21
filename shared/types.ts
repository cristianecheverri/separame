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
  /** Login email (Cognito); also the Reply-To of client emails. */
  email: string;
  createdAt: ISOInstant;
  updatedAt: ISOInstant;
}

export interface Service {
  id: string;
  name: string;
  /** Multiple of 5 minutes. */
  durationMin: number;
  /** Reference price in COP; `null` = "Sin costo". Never charged online. */
  priceCop: number | null;
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
  email: string;
  /** National number without +57, digits only. */
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
  /** Attendance confirmation by the client (missing on old items = 'pending'). */
  clientConfirmation: ClientConfirmation;
  confirmedAt?: ISOInstant;
  /** Marked by the pro once the appointment started; absent = not marked. */
  outcome?: AppointmentOutcome;
  outcomeAt?: ISOInstant;
  /** Monotonic revision (0 on create, +1 on every CALENDAR change: move, cancel): calendar SEQUENCE. Confirm/outcome don't bump it. */
  revision: number;
  /** Key of the client record (see ClientRecord) this appointment belongs to. */
  clientKey: string;
}

// ── Clients (lightweight history per professional) ─────────────────────────

/**
 * One record per client of a professional, keyed by `clientKey` (hash of the
 * normalized email, or of the phone when there's no email). Aggregates are
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
/** Who created the record: an admin, the professional's "Ya pagué" notice, or a gateway webhook (future). */
export type PaymentSource = 'admin' | 'pro_notice' | 'gateway';
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
  createdAt: ISOInstant;
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
