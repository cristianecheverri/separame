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
