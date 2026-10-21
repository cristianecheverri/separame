/**
 * In-memory implementation of the HTTP API for mock mode. Same paths, shapes
 * and error codes as the real backend; validates bodies with shared/schemas.
 */
import type { ZodType } from 'zod';
import type {
  AdminProDetailResponse, AdminSubscriptionRow, AppointmentsResponse, CreateAppointmentRequest, CreateBlockRequest,
  CreateMigrationRequest, CreatePriceRequest, ErrorCode, ManualPaymentRequest, MeResponse, OnboardingRequest,
  PaymentNoticeRequest, PushConfigResponse, PushSubscriptionRequest, PutAvailabilityRequest, RejectNoticeRequest, UpdatePriceRequest, UpsertServiceRequest,
} from '@shared/api';
import { computeAvailability, computeDay } from '@shared/availability';
import { upcomingHolidays } from '@shared/holidays';
import {
  createAppointmentSchema, createBlockSchema, createMigrationSchema, createPriceSchema, manualPaymentSchema,
  moveAppointmentSchema, onboardingSchema, pushSubscriptionSchema, removePushSubscriptionSchema, setOutcomeSchema, statsQuerySchema, updateCalendarSyncSchema, updateClientNotesSchema, paymentNoticeSchema, putAvailabilitySchema, rejectNoticeSchema, upsertServiceSchema,
} from '@shared/schemas';
import { slugProblem } from '@shared/slug';
import { computeSubscription, extendPaidUntil } from '@shared/subscription';
import { addDays, addMinutes, bogotaDate, toInstant, todayBogota } from '@shared/time';
import type { Appointment, Block, ClientRecord, Payment, PriceMigration, ProProfile, ProStats, Service, SubscriptionStatus, WaitlistEntry } from '@shared/types';
import { endpointHash } from '../lib/push';
import type { HttpMethod, TransportRequest, TransportResponse } from '../lib/api';
import { now } from '../lib/clock';
import * as fx from './fixtures';
import { adminReferrals, lauraReferrals, luaReferralPayments, PUBLIC_REFERRALS } from './referrals';
import { referralCodeBase, referralUrl } from '@shared/referrals';
import type { ReferralsResponse } from '@shared/api';

interface Db {
  isAdmin: boolean;
  email: string;
  profile: ProProfile | null;
  sub: { trialEndsAt: string; paidUntil: string | null; priceVersionId: string };
  services: Service[];
  schedule: typeof fx.schedule;
  rules: typeof fx.rules;
  blocks: Block[];
  appointments: Appointment[];
  payments: Payment[];
  prices: typeof fx.prices;
  migrations: PriceMigration[];
  rows: typeof fx.adminRows;
  details: Record<string, { profile: ProProfile; sub: { trialEndsAt: string; paidUntil: string | null }; payments: Payment[]; upcoming: number; trialStartedAt: string; priceId: string }>;
  takenSlugs: Set<string>;
  calendar: ReturnType<typeof fx.calendarSyncFor>;
  waitlist: WaitlistEntry[];
  clientNotes: Record<string, string>;
  push: PushConfigResponse;
}

const clone = <T,>(v: T): T => structuredClone(v);
let db: Db;
/** The signed-in pro's referral summary (mocks/referrals.ts); created on first read after onboarding. */
let referralsDb: ReferralsResponse | null = null;
const newestFirst = (list: Payment[]) => [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
let idSeq = 1000;
const newId = (prefix: string) => `${prefix}-${++idSeq}`;

export function resetMockDb(options: { state: fx.MockState; isAdmin: boolean; billing: fx.BillingMockState; push?: boolean }) {
  const state = options.state;
  const subInput = fx.subscriptionInputs[state === 'onboarding' ? 'trial' : state];
  const details: Db['details'] = {};
  for (const row of fx.adminRows) {
    const isLua = row.proId === 'pro-lua';
    details[row.proId] = {
      profile: isLua
        ? clone(fx.luaProfile)
        : { id: row.proId, slug: row.slug, name: row.name, title: row.title || 'Profesional', city: 'Medellín', neighborhood: '', address: '', phone: null, email: row.email, createdAt: '2026-07-01T15:00:00.000Z', updatedAt: '2026-07-01T15:00:00.000Z' },
      sub: { trialEndsAt: isLua ? '2026-07-18T15:00:00.000Z' : row.state === 'trial' ? row.accessUntil : '2026-07-08T15:00:00.000Z', paidUntil: row.state === 'trial' ? null : row.accessUntil },
      payments: isLua ? clone(fx.luaPayments) : [],
      upcoming: isLua ? 9 : 4,
      trialStartedAt: isLua ? '2026-07-11T15:00:00.000Z' : '2026-07-01T15:00:00.000Z',
      priceId: row.price.id,
    };
  }
  db = {
    isAdmin: options.isAdmin,
    email: fx.lauraProfile.email,
    profile: state === 'onboarding' ? null : clone(fx.lauraProfile),
    sub: { ...subInput, priceVersionId: 'price-fundador' },
    services: state === 'onboarding' ? [] : clone(fx.services),
    schedule: clone(fx.schedule),
    rules: clone(fx.rules),
    blocks: state === 'onboarding' ? [] : clone(fx.blocks),
    appointments: state === 'onboarding' ? [] : state === 'expired' ? fx.expiredAppointments() : fx.trialAppointments(),
    payments: state === 'expired' ? [...fx.billingNotices(options.billing), ...clone(fx.expiredPayments)] : fx.billingNotices(options.billing),
    prices: clone(fx.prices),
    migrations: clone(fx.migrations),
    rows: clone(fx.adminRows),
    details,
    takenSlugs: new Set(['laura-perez', 'dra-laura', 'estudio-lua', 'camilo-entrena']),
    calendar: fx.calendarSyncFor(fx.CALENDAR_TOKEN, true),
    waitlist: state === 'onboarding' ? [] : fx.waitlistEntries(),
    clientNotes: { 'c-mariana.gomez': 'Prefiere citas temprano. Llega en bicicleta, pide dónde dejarla.' },
    push: {
      vapidPublicKey: options.push === false ? null : fx.PUSH_VAPID_KEY,
      devices: [{ endpointHash: 'mac-chrome-demo', deviceLabel: 'Mac · Chrome', createdAt: '2026-10-18T15:00:00.000Z', lastSuccessAt: '2026-10-20T12:10:00.000Z' }],
    },
  };
  // Referral program (boards referral-*).
  const laura = lauraReferrals(state);
  referralsDb = state === 'onboarding' ? null : clone(laura.summary);
  db.payments = newestFirst([...db.payments, ...clone(laura.payments)]);
  if (db.details['pro-lua']) db.details['pro-lua'].payments = newestFirst([...db.details['pro-lua'].payments, ...clone(luaReferralPayments)]);
}

class HttpError extends Error {
  constructor(readonly status: number, readonly code: ErrorCode, message: string, readonly fields?: Record<string, string>) {
    super(message);
  }
}

function validate<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) fields[issue.path.join('.') || '_'] = issue.message;
  throw new HttpError(400, 'validation', result.error.issues[0]?.message ?? 'Datos inválidos', fields);
}

const subscription = (): SubscriptionStatus => computeSubscription(db.sub, now());
const priceOf = (id: string) => db.prices.find((p) => p.id === id)!;
const stripUsage = <T extends { subscriptions: number }>({ subscriptions: _s, ...rest }: T) => rest;

function requireProfile(): ProProfile {
  if (!db.profile) throw new HttpError(409, 'needs_onboarding', 'Completa tu perfil primero');
  return db.profile;
}

function requireWritable() {
  requireProfile();
  if (subscription().readOnly) throw new HttpError(403, 'read_only', 'Tu plan venció: el panel está en solo lectura');
}

function requireAdmin() {
  if (!db.isAdmin) throw new HttpError(403, 'forbidden', 'Solo para administradores');
}

const siteUrl = 'https://separame.app';

function me(): MeResponse {
  return {
    email: db.email,
    isAdmin: db.isAdmin,
    profile: db.profile,
    subscription: db.profile ? subscription() : null,
    publicUrl: db.profile ? `${siteUrl}/${db.profile.slug}` : null,
  };
}

function slugCheck(raw: string) {
  const slug = raw.trim().toLowerCase();
  const problem = slugProblem(slug);
  const own = db.profile?.slug === slug;
  const taken = !problem && !own && db.takenSlugs.has(slug);
  let suggestion: string | null = null;
  if (taken) {
    for (let i = 2; i < 50 && !suggestion; i++) if (!db.takenSlugs.has(`${slug}-${i}`)) suggestion = `${slug}-${i}`;
  }
  return { slug, available: !problem && !taken, problem: problem ?? (taken ? ('taken' as const) : null), suggestion };
}

function busyFor(excludeId?: string) {
  return db.appointments.filter((a) => a.status === 'confirmed' && a.id !== excludeId).map((a) => ({ start: a.start, end: a.end }));
}

function assertBookable(serviceId: string, start: string, excludeId?: string) {
  const service = db.services.find((s) => s.id === serviceId);
  if (!service) throw new HttpError(404, 'not_found', 'Servicio no encontrado');
  const day = computeDay(bogotaDate(start), {
    schedule: db.schedule, rules: { ...db.rules, minNoticeMin: 0 }, blocks: db.blocks, busy: busyFor(excludeId), durationMin: service.durationMin, now: now(),
  });
  if (!day.slots.includes(new Date(start).toISOString())) throw new HttpError(409, 'slot_taken', 'Ese horario ya no está disponible');
  return service;
}

function upsertService(body: UpsertServiceRequest, existing?: Service): Service {
  const data = validate(upsertServiceSchema, body);
  return { id: existing?.id ?? newId('svc'), order: existing?.order ?? db.services.length, ...data };
}

function proDetail(proId: string): AdminProDetailResponse {
  const d = db.details[proId];
  if (!d) throw new HttpError(404, 'not_found', 'Profesional no encontrado');
  return {
    profile: d.profile,
    subscription: computeSubscription({ ...d.sub, priceVersionId: d.priceId }, now()),
    price: stripUsage(priceOf(d.priceId)),
    payments: d.payments,
    upcomingAppointments: d.upcoming,
    trialStartedAt: d.trialStartedAt,
    ...adminReferrals(proId),
  };
}

function manualPayment(proId: string, body: ManualPaymentRequest) {
  const data = validate(manualPaymentSchema, body);
  const d = db.details[proId];
  if (!d) throw new HttpError(404, 'not_found', 'Profesional no encontrado');
  const notice = data.noticeId ? d.payments.find((p) => p.id === data.noticeId && p.status === 'pending') : undefined;
  if (data.noticeId && !notice) throw new HttpError(409, 'conflict', 'Ese aviso ya fue revisado');
  const until = 'months' in data.period ? extendPaidUntil(d.sub, data.period.months, now()) : toInstant(data.period.until, '23:59');
  const at = now().toISOString();
  const payment: Payment = {
    id: notice?.id ?? newId('pay'), proId, method: data.method, status: 'approved', source: notice ? 'pro_notice' : 'admin',
    amountCop: data.method === 'courtesy' ? null : data.amountCop, months: 'months' in data.period ? data.period.months : null,
    paidAt: toInstant(data.paidAt, '12:00'), until, reference: data.reference, priceVersionId: d.priceId,
    ...(notice ? { reviewedBy: fx.ADMIN, reviewedAt: at } : { recordedBy: fx.ADMIN }), createdAt: notice?.createdAt ?? at,
  };
  d.sub.paidUntil = until;
  d.payments = notice ? d.payments.map((p) => (p.id === notice.id ? payment : p)) : [payment, ...d.payments];
  const sub = computeSubscription({ ...d.sub, priceVersionId: d.priceId }, now());
  db.rows = db.rows.map((r) =>
    r.proId === proId
      ? { ...r, state: sub.state, accessUntil: sub.accessUntil, graceUntil: sub.graceUntil, pendingNotice: d.payments.some((p) => p.status === 'pending'), lastPayment: { method: payment.method, amountCop: payment.amountCop, paidAt: payment.paidAt, status: 'approved' } }
      : r,
  );
  return { payment, subscription: sub };
}

function rejectNotice(proId: string, paymentId: string, body: RejectNoticeRequest) {
  const data = validate(rejectNoticeSchema, body);
  const d = db.details[proId];
  const notice = d?.payments.find((p) => p.id === paymentId && p.status === 'pending');
  if (!d || !notice) throw new HttpError(404, 'not_found', 'Aviso no encontrado');
  const payment: Payment = { ...notice, status: 'rejected', rejectReason: data.reason, reviewedBy: fx.ADMIN, reviewedAt: now().toISOString() };
  d.payments = d.payments.map((p) => (p.id === paymentId ? payment : p));
  db.rows = db.rows.map((r) => (r.proId === proId ? { ...r, pendingNotice: false } : r));
  return { payment };
}

function paymentNotice(body: PaymentNoticeRequest) {
  requireProfile();
  const data = validate(paymentNoticeSchema, body);
  if (db.payments.some((p) => p.status === 'pending' && p.source === 'pro_notice')) throw new HttpError(409, 'conflict', 'Ya tienes un aviso en revisión');
  const pkg = priceOf(db.sub.priceVersionId).packages.find((p) => p.months === data.months);
  if (!pkg) throw new HttpError(400, 'validation', 'Ese paquete no existe');
  const at = now().toISOString();
  const payment: Payment = {
    id: newId('pay'), proId: db.profile!.id, method: data.method, status: 'pending', source: 'pro_notice', amountCop: pkg.amountCop,
    months: data.months, paidAt: at, until: null, reference: data.reference, priceVersionId: db.sub.priceVersionId, createdAt: at,
  };
  db.payments = [payment, ...db.payments];
  return { payment };
}

/** Like shared/clients.ts: email, else phone; '' (no client record) for a name-only appointment. */
function clientKeyOf(c: { email: string; phone: string }): string {
  const id = c.email ? c.email.split('@')[0] : c.phone;
  return id ? `c-${id.toLowerCase()}` : '';
}

const ms = (iso: string) => new Date(iso).getTime();

function clientRecords(): ClientRecord[] {
  const t = now().getTime();
  const map = new Map<string, ClientRecord>();
  for (const a of [...db.appointments].sort((x, y) => x.start.localeCompare(y.start))) {
    if (!a.clientKey || !a.client.name || a.client.name === 'Cliente eliminado') continue;
    const r = map.get(a.clientKey) ?? {
      key: a.clientKey, name: a.client.name, email: a.client.email, phone: a.client.phone, firstSeenAt: a.createdAt < a.start ? a.createdAt : a.start,
      lastAppointmentAt: null, nextAppointmentAt: null, totals: { appointments: 0, attended: 0, noShows: 0, cancelled: 0 },
      notes: db.clientNotes[a.clientKey] ?? '', updatedAt: a.updatedAt,
    };
    if (a.status === 'cancelled') r.totals.cancelled++;
    else {
      r.totals.appointments++;
      if (a.outcome === 'attended') r.totals.attended++;
      if (a.outcome === 'no_show') r.totals.noShows++;
      if (ms(a.start) < t) r.lastAppointmentAt = a.start;
      else if (!r.nextAppointmentAt) r.nextAppointmentAt = a.start;
    }
    if (a.updatedAt > r.updatedAt) r.updatedAt = a.updatedAt;
    map.set(a.clientKey, r);
  }
  const activity = (r: ClientRecord) => r.nextAppointmentAt ?? r.lastAppointmentAt ?? r.firstSeenAt;
  return [...map.values()].sort((a, b) => Math.abs(ms(activity(a)) - t) - Math.abs(ms(activity(b)) - t));
}

function computeStats(from: string, to: string): ProStats {
  const t = now().getTime();
  const inRange = db.appointments.filter((a) => {
    const d = bogotaDate(a.start);
    return d >= from && d <= to;
  });
  const active = inRange.filter((a) => a.status === 'confirmed');
  const past = active.filter((a) => ms(a.end) < t);
  const attended = past.filter((a) => a.outcome === 'attended').length;
  const noShows = past.filter((a) => a.outcome === 'no_show').length;
  const firstByClient = new Map<string, string>();
  for (const a of db.appointments) if (!firstByClient.has(a.clientKey) || a.start < firstByClient.get(a.clientKey)!) firstByClient.set(a.clientKey, a.start);
  const clients = new Set(active.filter((a) => a.clientKey && a.clientKey !== 'deleted').map((a) => a.clientKey));
  const newClients = [...clients].filter((k) => bogotaDate(firstByClient.get(k)!) >= from).length;
  const byService = new Map<string, { serviceId: string; serviceName: string; appointments: number; revenueCop: number }>();
  for (const a of active) {
    const row = byService.get(a.serviceId) ?? { serviceId: a.serviceId, serviceName: a.serviceName, appointments: 0, revenueCop: 0 };
    row.appointments++;
    row.revenueCop += a.priceCop ?? 0;
    byService.set(a.serviceId, row);
  }
  const days = Math.max(1, Math.round((ms(`${to}T12:00:00Z`) - ms(`${from}T12:00:00Z`)) / 86_400_000) + 1);
  const bookedMin = active.reduce((sum, a) => sum + a.durationMin, 0);
  const openMinPerWeek = Object.values(db.schedule).flat().reduce((sum, r) => sum + (Number(r.end.slice(0, 2)) * 60 + Number(r.end.slice(3)) - Number(r.start.slice(0, 2)) * 60 - Number(r.start.slice(3))), 0);
  return {
    from, to,
    appointments: active.length,
    cancelled: inRange.length - active.length,
    attended, noShows,
    unmarked: past.filter((a) => !a.outcome).length,
    occupancy: Math.min(1, bookedMin / Math.max(1, (openMinPerWeek * days) / 7)),
    newClients,
    returningClients: clients.size - newClients,
    estimatedRevenueCop: active.reduce((sum, a) => sum + (a.priceCop ?? 0), 0),
    byService: [...byService.values()],
    byWeekday: Array.from({ length: 7 }, (_, i) => ({ weekday: i, appointments: active.filter((a) => (new Date(ms(a.start) - 5 * 3_600_000).getUTCDay() + 6) % 7 === i).length })),
    bySource: { client: active.filter((a) => a.createdBy === 'client').length, pro: active.filter((a) => a.createdBy !== 'client').length },
    noShowRate: attended + noShows ? noShows / (attended + noShows) : 0,
  };
}

type Handler = (params: string[], body: unknown, query: URLSearchParams) => unknown | Promise<unknown>;
const routes: [HttpMethod, RegExp, Handler][] = [];
const on = (method: HttpMethod, pattern: string, handler: Handler) =>
  routes.push([method, new RegExp(`^${pattern.replace(/\{[^}]+\}/g, '([^/]+)')}$`), handler]);

on('GET', '/me', () => me());
on('POST', '/me/onboarding', (_p, body) => {
  if (db.profile) throw new HttpError(409, 'conflict', 'Ya tienes perfil');
  const data = validate(onboardingSchema, body as OnboardingRequest);
  const check = slugCheck(data.slug);
  if (!check.available) throw new HttpError(409, 'slug_taken', 'Ese enlace ya está ocupado');
  const at = now().toISOString();
  db.profile = { id: 'pro-new', ...data, email: db.email, createdAt: at, updatedAt: at };
  db.sub = { trialEndsAt: addMinutes(at, 7 * 24 * 60), paidUntil: null, priceVersionId: 'price-fundador' };
  return { profile: db.profile, subscription: subscription(), publicUrl: `${siteUrl}/${db.profile.slug}` };
});
on('PUT', '/me/profile', (_p, body) => {
  requireWritable();
  const data = validate(onboardingSchema, body);
  const check = slugCheck(data.slug);
  if (!check.available) throw new HttpError(409, 'slug_taken', 'Ese enlace ya está ocupado');
  db.profile = { ...db.profile!, ...data, updatedAt: now().toISOString() };
  return { profile: db.profile, subscription: subscription(), publicUrl: `${siteUrl}/${db.profile.slug}` };
});
on('GET', '/me/slug-check', (_p, _b, q) => slugCheck(q.get('slug') ?? ''));

on('GET', '/me/services', () => ({ services: [...db.services].sort((a, b) => a.order - b.order) }));
on('POST', '/me/services', (_p, body) => {
  requireWritable();
  const service = upsertService(body as UpsertServiceRequest);
  db.services.push(service);
  return { service };
});
on('PUT', '/me/services/{id}', ([id], body) => {
  requireWritable();
  const existing = db.services.find((s) => s.id === id);
  if (!existing) throw new HttpError(404, 'not_found', 'Servicio no encontrado');
  const service = upsertService(body as UpsertServiceRequest, existing);
  db.services = db.services.map((s) => (s.id === id ? service : s));
  return { service };
});
on('DELETE', '/me/services/{id}', ([id]) => {
  requireWritable();
  db.services = db.services.filter((s) => s.id !== id);
  return {};
});

on('GET', '/me/availability', () => ({
  settings: { schedule: db.schedule, rules: db.rules, blocks: [...db.blocks].sort((a, b) => a.start.localeCompare(b.start)) },
  upcomingHolidays: upcomingHolidays(todayBogota(now()), 4),
}));
on('PUT', '/me/availability', (_p, body) => {
  requireWritable();
  const data = validate(putAvailabilitySchema, body as PutAvailabilityRequest);
  db.schedule = data.schedule;
  db.rules = data.rules as typeof db.rules;
  return { settings: { schedule: db.schedule, rules: db.rules, blocks: db.blocks }, upcomingHolidays: upcomingHolidays(todayBogota(now()), 4) };
});
on('POST', '/me/blocks', (_p, body) => {
  requireWritable();
  const data = validate(createBlockSchema, body as CreateBlockRequest);
  const block: Block = { id: newId('blk'), ...data };
  db.blocks.push(block);
  return { block };
});
on('DELETE', '/me/blocks/{id}', ([id]) => {
  requireWritable();
  db.blocks = db.blocks.filter((b) => b.id !== id);
  return {};
});

on('GET', '/me/appointments', (_p, _b, q): AppointmentsResponse => {
  requireProfile();
  const from = q.get('from') ?? '';
  const to = q.get('to') ?? '';
  return {
    appointments: db.appointments
      .filter((a) => {
        const d = bogotaDate(a.start);
        return d >= from && d <= to;
      })
      .sort((a, b) => a.start.localeCompare(b.start)),
  };
});
on('POST', '/me/appointments', (_p, body) => {
  requireWritable();
  const data = validate(createAppointmentSchema, body as CreateAppointmentRequest);
  const service = assertBookable(data.serviceId, data.start);
  const at = now().toISOString();
  const appointment: Appointment = {
    id: newId('apt'), proId: db.profile!.id, serviceId: service.id, serviceName: service.name, durationMin: service.durationMin, priceCop: service.priceCop,
    start: new Date(data.start).toISOString(), end: addMinutes(data.start, service.durationMin), status: 'confirmed', client: data.client,
    createdBy: 'pro', createdAt: at, updatedAt: at, clientConfirmation: 'pending', revision: 0, clientKey: clientKeyOf(data.client),
  };
  db.appointments.push(appointment);
  return { appointment };
});
on('PATCH', '/me/appointments/{id}', ([id], body) => {
  requireWritable();
  const data = validate(moveAppointmentSchema, body);
  const current = db.appointments.find((a) => a.id === id);
  if (!current) throw new HttpError(404, 'not_found', 'Cita no encontrada');
  assertBookable(current.serviceId, data.start, id);
  const appointment = { ...current, start: new Date(data.start).toISOString(), end: addMinutes(data.start, current.durationMin), updatedAt: now().toISOString() };
  delete appointment.reminderSentAt;
  db.appointments = db.appointments.map((a) => (a.id === id ? appointment : a));
  return { appointment };
});
on('POST', '/me/appointments/{id}/cancel', ([id], body) => {
  requireWritable();
  const current = db.appointments.find((a) => a.id === id);
  if (!current) throw new HttpError(404, 'not_found', 'Cita no encontrada');
  const reason = (body as { reason?: string } | null)?.reason;
  const appointment: Appointment = { ...current, status: 'cancelled', cancelledBy: 'pro', cancelReason: reason, updatedAt: now().toISOString() };
  db.appointments = db.appointments.map((a) => (a.id === id ? appointment : a));
  return { appointment };
});
on('GET', '/me/slots', (_p, _b, q) => {
  requireProfile();
  const service = db.services.find((s) => s.id === q.get('serviceId'));
  if (!service) throw new HttpError(404, 'not_found', 'Servicio no encontrado');
  const from = q.get('from') || todayBogota(now());
  const days = Number(q.get('days') || 14);
  const sub = subscription();
  return {
    active: !sub.readOnly,
    serviceId: service.id,
    from,
    // Like the backend (pro-appointments): the pro books for clients, so minimum notice doesn't apply.
    days: computeAvailability(from, days, { schedule: db.schedule, rules: { ...db.rules, minNoticeMin: 0 }, blocks: db.blocks, busy: busyFor(), durationMin: service.durationMin, now: now() }),
  };
});

on('POST', '/me/appointments/{id}/outcome', ([id], body) => {
  requireWritable();
  const data = validate(setOutcomeSchema, body);
  const current = db.appointments.find((a) => a.id === id);
  if (!current) throw new HttpError(404, 'not_found', 'Cita no encontrada');
  if (current.status !== 'confirmed' || ms(current.start) > now().getTime()) throw new HttpError(409, 'conflict', 'Solo puedes marcar asistencia cuando la cita ya empezó');
  const appointment: Appointment = { ...current, outcome: data.outcome ?? undefined, outcomeAt: data.outcome ? now().toISOString() : undefined, revision: current.revision + 1 };
  db.appointments = db.appointments.map((a) => (a.id === id ? appointment : a));
  return { appointment };
});
on('GET', '/me/waitlist', () => (requireProfile(), { entries: db.waitlist }));
on('DELETE', '/me/waitlist/{id}', ([id]) => {
  requireProfile();
  db.waitlist = db.waitlist.map((e) => (e.id === id ? { ...e, status: 'removed' } : e));
  return {};
});
on('GET', '/me/clients', (_p, _b, q) => {
  requireProfile();
  const term = (q.get('q') ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const clients = clientRecords().filter((c) => !term || `${c.name} ${c.email} ${c.phone}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(term));
  return { clients };
});
on('GET', '/me/clients/{key}', ([key]) => {
  requireProfile();
  const client = clientRecords().find((c) => c.key === key);
  if (!client) throw new HttpError(404, 'not_found', 'Cliente no encontrado');
  return { client, appointments: db.appointments.filter((a) => a.clientKey === key).sort((a, b) => b.start.localeCompare(a.start)) };
});
on('PUT', '/me/clients/{key}/notes', ([key], body) => {
  requireWritable();
  const data = validate(updateClientNotesSchema, body);
  db.clientNotes[key] = data.notes;
  db.appointments = db.appointments.map((a) => (a.clientKey === key ? { ...a, updatedAt: now().toISOString() } : a));
  return { client: clientRecords().find((c) => c.key === key) };
});
on('DELETE', '/me/clients/{key}', ([key]) => {
  requireWritable();
  const t = now().getTime();
  if (db.appointments.some((a) => a.clientKey === key && a.status === 'confirmed' && ms(a.start) > t)) {
    throw new HttpError(409, 'conflict', 'Tiene citas próximas. Cancélalas antes de eliminar este cliente.');
  }
  db.appointments = db.appointments.map((a) => (a.clientKey === key ? { ...a, client: { name: 'Cliente eliminado', email: '', phone: '' }, clientKey: 'deleted' } : a));
  delete db.clientNotes[key];
  return {};
});
on('GET', '/me/stats', (_p, _b, q) => {
  requireProfile();
  const { from, to } = validate(statsQuerySchema, { from: q.get('from'), to: q.get('to') });
  const days = Math.round((ms(`${to}T12:00:00Z`) - ms(`${from}T12:00:00Z`)) / 86_400_000) + 1;
  const prevTo = addDays(from, -1);
  return { stats: computeStats(from, to), previous: computeStats(addDays(prevTo, -(days - 1)), prevTo) };
});
on('GET', '/me/push-config', () => (requireProfile(), db.push));
on('POST', '/me/push-subscriptions', async (_p, body) => {
  requireProfile();
  const data = validate(pushSubscriptionSchema, body as PushSubscriptionRequest);
  const hash = await endpointHash(data.endpoint);
  db.push = {
    ...db.push,
    devices: [...db.push.devices.filter((d) => d.endpointHash !== hash), { endpointHash: hash, deviceLabel: data.deviceLabel ?? 'Dispositivo', createdAt: now().toISOString(), lastSuccessAt: null }],
  };
  return {};
});
on('POST', '/me/push-subscriptions/remove', async (_p, body) => {
  requireProfile();
  const data = validate(removePushSubscriptionSchema, body);
  const hash = await endpointHash(data.endpoint);
  db.push = { ...db.push, devices: db.push.devices.filter((d) => d.endpointHash !== hash) };
  return {};
});
on('POST', '/me/push-subscriptions/test', () => (requireProfile(), {}));
on('GET', '/me/calendar-sync', () => (requireProfile(), db.calendar));
on('PUT', '/me/calendar-sync', (_p, body) => {
  requireProfile();
  const data = validate(updateCalendarSyncSchema, body);
  db.calendar = { ...db.calendar, invitesEnabled: data.invitesEnabled };
  return db.calendar;
});
on('POST', '/me/calendar-sync/rotate', () => {
  requireProfile();
  const token = `demoToken${Math.random().toString(16).slice(2, 18)}`;
  db.calendar = { ...fx.calendarSyncFor(token, db.calendar.invitesEnabled), createdAt: now().toISOString() };
  return db.calendar;
});

on('GET', '/me/billing', () => {
  requireProfile();
  return { subscription: subscription(), price: stripUsage(priceOf(db.sub.priceVersionId)), payments: db.payments, instructions: fx.instructions };
});
on('POST', '/me/billing/payment-notices', (_p, body) => paymentNotice(body as PaymentNoticeRequest));
on('GET', '/me/referrals', () => {
  const profile = requireProfile();
  if (!referralsDb) {
    const code = referralCodeBase(profile.slug);
    referralsDb = { code, url: referralUrl(siteUrl, code), monthsEarned: 0, monthsApplied: 0, monthsPending: 0, referrals: [] };
  }
  return referralsDb;
});
on('GET', '/public/referrals/{code}', ([code]) => {
  const referral = PUBLIC_REFERRALS[code.toLowerCase()];
  if (!referral) throw new HttpError(404, 'not_found', 'Este enlace de invitación no existe.');
  return referral;
});

// ── Admin ──
on('GET', '/admin/stats', () => (requireAdmin(), { ...fx.adminStats, pendingNotices: db.rows.filter((r) => r.pendingNotice).length }));
on('GET', '/admin/subscriptions', (_p, _b, q) => {
  requireAdmin();
  const state = q.get('state');
  const term = (q.get('q') ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const rows: AdminSubscriptionRow[] = db.rows.filter((r) => {
    if (state && r.state !== state) return false;
    if (!term) return true;
    return `${r.name} ${r.email} ${r.slug}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(term);
  });
  return { rows };
});
on('GET', '/admin/pros/{id}', ([id]) => (requireAdmin(), proDetail(id)));
on('POST', '/admin/pros/{id}/manual-payments', ([id], body) => (requireAdmin(), manualPayment(id, body as ManualPaymentRequest)));
on('POST', '/admin/pros/{id}/payment-notices/{pid}/reject', ([id, pid], body) => (requireAdmin(), rejectNotice(id, pid, body as RejectNoticeRequest)));
on('GET', '/admin/prices', () => (requireAdmin(), { prices: db.prices }));
on('POST', '/admin/prices', (_p, body) => {
  requireAdmin();
  const data = validate(createPriceSchema, body as CreatePriceRequest);
  if (db.prices.some((p) => p.code === data.code)) throw new HttpError(409, 'conflict', 'Ya existe una versión con ese código');
  const price = { id: newId('price'), currency: 'COP' as const, createdAt: now().toISOString(), subscriptions: 0, ...data };
  if (price.isDefault) db.prices = db.prices.map((p) => ({ ...p, isDefault: false }));
  db.prices.push(price);
  return { price: stripUsage(price) };
});
on('PATCH', '/admin/prices/{id}', ([id], body) => {
  requireAdmin();
  const patch = body as UpdatePriceRequest;
  const current = db.prices.find((p) => p.id === id);
  if (!current) throw new HttpError(404, 'not_found', 'Versión no encontrada');
  if (patch.status === 'active' && (current.monthlyCop === null || current.packages.length === 0)) {
    throw new HttpError(400, 'validation', 'Una versión activa necesita precio mensual y al menos un paquete');
  }
  if (patch.isDefault) db.prices = db.prices.map((p) => ({ ...p, isDefault: false }));
  const price = { ...current, ...patch };
  db.prices = db.prices.map((p) => (p.id === id ? price : p));
  return { price: stripUsage(price) };
});
on('GET', '/admin/price-migrations', () => (requireAdmin(), { migrations: db.migrations }));
on('POST', '/admin/price-migrations', (_p, body) => {
  requireAdmin();
  const data = validate(createMigrationSchema, body as CreateMigrationRequest);
  const from = priceOf(data.fromPriceVersionId);
  const affected = data.target.kind === 'pros' ? data.target.proIds.length : data.target.kind === 'version' ? from.subscriptions : 3;
  const migration: PriceMigration = {
    id: newId('mig'), ...data, noticeSentAt: now().toISOString(), status: 'scheduled', affectedCount: affected,
    createdAt: now().toISOString(), createdBy: fx.ADMIN,
  };
  db.migrations = [migration, ...db.migrations];
  return { migration };
});
on('POST', '/admin/price-migrations/{id}/cancel', ([id]) => {
  requireAdmin();
  const migration = db.migrations.find((m) => m.id === id);
  if (!migration) throw new HttpError(404, 'not_found', 'Migración no encontrada');
  const next = { ...migration, status: 'cancelled' as const };
  db.migrations = db.migrations.map((m) => (m.id === id ? next : m));
  return { migration: next };
});

export async function mockTransport(req: TransportRequest, delayMs: number): Promise<TransportResponse> {
  await new Promise((r) => setTimeout(r, delayMs));
  const url = new URL(req.path, 'https://mock.local');
  for (const [method, re, handler] of routes) {
    const match = method === req.method && re.exec(url.pathname);
    if (!match) continue;
    try {
      const body = await handler(match.slice(1).map(decodeURIComponent), clone(req.body ?? null), url.searchParams);
      return { status: 200, body: clone(body) };
    } catch (e) {
      if (e instanceof HttpError) return { status: e.status, body: { error: { code: e.code, message: e.message, fields: e.fields } } };
      console.error('[mock api]', e);
      return { status: 500, body: { error: { code: 'internal', message: 'Error interno del mock' } } };
    }
  }
  return { status: 404, body: { error: { code: 'not_found', message: `Sin ruta mock para ${req.method} ${url.pathname}` } } };
}

