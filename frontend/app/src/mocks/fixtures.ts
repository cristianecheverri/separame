/**
 * Mock data mirroring the mockups (line A): Dra. Laura Pérez on a free trial
 * with 5 days left, today = Tue 20 Oct 2026, the admin rows (Estudio Lúa in
 * grace…) and the price versions (Fundador / Mensual / Estándar draft).
 */
import type { AdminSubscriptionRow } from '@shared/api';
import type { PaymentInstructions } from '@shared/types';
import { DEFAULT_RULES } from '@shared/availability';
import { addDays, toInstant, type ISODate } from '@shared/time';
import type { Appointment, Block, Payment, PriceMigration, PriceVersion, ProProfile, Service, WaitlistEntry, WeeklySchedule } from '@shared/types';

export const MOCK_NOW = '2026-10-20T14:25:00.000Z'; // 9:25 a. m. in Bogotá
export const TODAY: ISODate = '2026-10-20';
export const ADMIN = { sub: 'admin-sub', email: 'cristian@separame.app' };

export type MockState = 'trial' | 'active' | 'grace' | 'expired' | 'onboarding';

export const lauraProfile: ProProfile = {
  id: 'pro-laura',
  slug: 'dra-laura-perez',
  name: 'Dra. Laura Pérez',
  title: 'Odontóloga',
  city: 'Medellín',
  neighborhood: 'El Poblado',
  address: 'Calle 10 # 43D-25, consultorio 504',
  phone: '3004567890',
  email: 'laura@consultoriolaura.co',
  createdAt: '2026-10-18T15:00:00.000Z',
  updatedAt: '2026-10-18T15:00:00.000Z',
};

export const services: Service[] = [
  { id: 'svc-valoracion', name: 'Valoración', durationMin: 30, priceCop: 60000, description: 'Primera vez', visible: true, order: 0 },
  { id: 'svc-limpieza', name: 'Limpieza dental', durationMin: 45, priceCop: 120000, description: 'Incluye profilaxis', visible: true, order: 1 },
  { id: 'svc-control', name: 'Control', durationMin: 15, priceCop: null, priceDisplay: 'agreed', description: 'Pacientes en tratamiento', visible: true, order: 2 },
  { id: 'svc-blanqueamiento', name: 'Blanqueamiento', durationMin: 60, priceCop: 450000, description: 'Aclara hasta tres tonos', visible: false, order: 3 },
];

const WEEKDAY = [
  { start: '08:00', end: '12:00' },
  { start: '14:00', end: '18:00' },
];

export const schedule: WeeklySchedule = {
  mon: WEEKDAY,
  tue: WEEKDAY,
  wed: WEEKDAY,
  thu: WEEKDAY,
  fri: [
    { start: '08:00', end: '12:00' },
    { start: '14:00', end: '17:00' },
  ],
  sat: [{ start: '08:00', end: '12:00' }],
  sun: [],
};

export const rules = { ...DEFAULT_RULES };

export const blocks: Block[] = [
  { id: 'blk-vacaciones', label: 'Vacaciones', start: toInstant('2026-12-21', '00:00'), end: toInstant('2027-01-05', '00:00') },
  { id: 'blk-congreso', label: 'Congreso de odontología', start: toInstant('2026-11-13', '00:00'), end: toInstant('2026-11-14', '00:00') },
];

const svc = (id: string) => services.find((s) => s.id === id)!;

let seq = 0;
function appt(
  date: ISODate,
  time: string,
  client: string,
  serviceId: string,
  extra: Partial<Appointment> = {},
): Appointment {
  const s = svc(serviceId);
  const start = toInstant(date, time);
  const end = new Date(new Date(start).getTime() + s.durationMin * 60_000).toISOString();
  const slug = client.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, '.');
  seq++;
  return {
    id: `apt-${seq}`,
    proId: lauraProfile.id,
    serviceId,
    serviceName: s.name,
    durationMin: s.durationMin,
    priceCop: s.priceCop,
    start,
    end,
    status: 'confirmed',
    client: { name: client, email: `${slug}@correo.co`, phone: `300${String(1000000 + seq * 7919).slice(0, 7)}` },
    createdBy: 'client',
    createdAt: '2026-10-14T16:00:00.000Z',
    updatedAt: '2026-10-14T16:00:00.000Z',
    clientConfirmation: seq % 3 === 0 ? 'pending' : 'confirmed',
    revision: 0,
    clientKey: `c-${slug}`,
    ...extra,
  };
}

const CLIENTS = [
  'Ana María Salazar', 'Pedro Londoño', 'Lucía Restrepo', 'Andrés Cardona', 'Paula Jaramillo', 'Miguel Ángel Toro',
  'Camila Zapata', 'Santiago Vélez', 'Isabela Montoya', 'Jorge Iván Arango', 'Manuela Ochoa', 'Sebastián Duque',
  'Laura Valencia', 'Esteban Gil', 'Juliana Henao', 'Mateo Correa',
];
const SVC_CYCLE = ['svc-valoracion', 'svc-control', 'svc-limpieza', 'svc-control', 'svc-valoracion'];
const TIMES = ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'];

/** Online bookings require the phone; the email is optional, so many clients have none. */
const withoutEmail = (a: Appointment): Appointment => ({ ...a, client: { ...a.client, email: '' } });

function fill(date: ISODate, count: number, offset: number): Appointment[] {
  return Array.from({ length: count }, (_, i) => {
    const a = appt(date, TIMES[i], CLIENTS[(offset + i) % CLIENTS.length], SVC_CYCLE[(offset + i) % SVC_CYCLE.length]);
    return (offset + i) % 6 === 5 ? withoutEmail(a) : a;
  });
}

export function trialAppointments(): Appointment[] {
  seq = 0;
  return [
    appt(TODAY, '08:00', 'Mariana Gómez', 'svc-valoracion', { clientConfirmation: 'confirmed', outcome: 'attended', outcomeAt: '2026-10-20T13:35:00.000Z' }),
    withoutEmail(appt(TODAY, '08:30', 'Juan Esteban Ruiz', 'svc-control', { createdBy: 'pro', clientConfirmation: 'pending' })),
    appt(TODAY, '10:00', 'Sofía Castaño', 'svc-limpieza', { createdAt: '2026-10-20T12:10:00.000Z', updatedAt: '2026-10-20T12:10:00.000Z', clientConfirmation: 'pending' }),
    appt(TODAY, '11:00', 'Carlos Mejía', 'svc-valoracion', { clientConfirmation: 'confirmed' }),
    appt(TODAY, '14:00', 'Valentina Osorio', 'svc-control', { status: 'cancelled', cancelledBy: 'client', updatedAt: '2026-10-19T22:00:00.000Z' }),
    appt(TODAY, '15:00', 'Daniela Herrera', 'svc-limpieza', { clientConfirmation: 'confirmed' }),
    withoutEmail(appt(TODAY, '16:00', 'Tomás Rendón', 'svc-control', { createdBy: 'pro', clientConfirmation: 'pending' })),
    ...fill(addDays(TODAY, 1), 5, 0),
    ...fill(addDays(TODAY, 2), 7, 5),
    ...fill(addDays(TODAY, 3), 3, 12),
    ...fill(addDays(TODAY, 4), 2, 3),
    ...fill(addDays(TODAY, 6), 4, 8),
    ...fill(addDays(TODAY, 8), 3, 1),
    ...fill(addDays(TODAY, -1), 4, 6),
    ...fill(addDays(TODAY, -4), 3, 10),
    ...fill(addDays(TODAY, -6), 2, 2),
    ...history(),
    // Booked by the pro with a name only (email and phone are optional in the panel): no client record.
    appt(addDays(TODAY, 1), '17:00', 'Rosa Elena Pérez', 'svc-control', { createdBy: 'pro', client: { name: 'Rosa Elena Pérez', email: '', phone: '' }, clientKey: '' }),
  ].map((a) => {
    if (a.start >= MOCK_NOW || a.status !== 'confirmed') return a;
    const withReminder = { ...a, reminderSentAt: addMinutesIso(a.start, -24 * 60) };
    // Older past appointments are marked (one in eight a no-show); the last week stays partly unmarked.
    const old = a.start < toInstant(addDays(TODAY, -3), '00:00');
    if (a.outcome || a.start.startsWith('2026-10-20') || (!old && a.id.length % 2 === 0)) return withReminder;
    return { ...withReminder, outcome: Number(a.id.slice(4)) % 8 === 0 ? ('no_show' as const) : ('attended' as const), outcomeAt: a.end };
  });
}

/** ~4 months of past appointments so stats, clients and history have substance. */
function history(): Appointment[] {
  const out: Appointment[] = [];
  for (let d = -125; d <= -7; d++) {
    const date = addDays(TODAY, d);
    const wd = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (wd === 0) continue;
    const count = wd === 6 ? 2 : 2 + ((d * 7 + wd) % 4 === 0 ? 2 : (d + wd) % 3);
    out.push(...fill(date, Math.min(count, 5), Math.abs(d * 3 + wd)));
  }
  return out.map((a, i) => (i % 17 === 0 ? { ...a, status: 'cancelled', cancelledBy: 'client' } : i % 5 === 0 ? { ...a, createdBy: 'pro' } : a));
}

export function expiredAppointments(): Appointment[] {
  seq = 100;
  const sent = { reminderSentAt: '2026-10-19T14:00:00.000Z' };
  return [
    appt(TODAY, '09:00', 'Mariana Gómez', 'svc-valoracion', sent),
    appt(TODAY, '11:00', 'Carlos Mejía', 'svc-control', sent),
    appt(TODAY, '15:00', 'Daniela Herrera', 'svc-limpieza', sent),
    ...fill(addDays(TODAY, 1), 2, 4),
    ...fill(addDays(TODAY, -1), 3, 9),
  ];
}

function addMinutesIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

export const subscriptionInputs: Record<Exclude<MockState, 'onboarding'>, { trialEndsAt: string; paidUntil: string | null }> = {
  trial: { trialEndsAt: '2026-10-25T14:00:00.000Z', paidUntil: null },
  active: { trialEndsAt: '2026-07-21T14:00:00.000Z', paidUntil: '2027-01-14T14:00:00.000Z' },
  grace: { trialEndsAt: '2026-07-21T14:00:00.000Z', paidUntil: '2026-10-18T14:00:00.000Z' },
  expired: { trialEndsAt: '2026-07-15T14:00:00.000Z', paidUntil: '2026-10-16T04:00:00.000Z' },
};

export const prices: (PriceVersion & { subscriptions: number })[] = [
  {
    id: 'price-fundador', code: 'fundador-v1', name: 'Fundador', currency: 'COP', monthlyCop: 5000,
    packages: [{ months: 3, amountCop: 15000 }, { months: 6, amountCop: 30000 }, { months: 12, amountCop: 50000 }],
    status: 'active', isDefault: true, createdAt: '2026-10-01T15:00:00.000Z', subscriptions: 38,
  },
  {
    id: 'price-mensual', code: 'mensual-v1', name: 'Mensual', currency: 'COP', monthlyCop: 5900,
    packages: [{ months: 1, amountCop: 5900 }],
    status: 'active', isDefault: false, createdAt: '2026-10-01T15:00:00.000Z', subscriptions: 4,
  },
  {
    id: 'price-estandar', code: 'estandar-v1', name: 'Estándar', currency: 'COP', monthlyCop: null,
    packages: [], status: 'draft', isDefault: false, createdAt: '2026-10-18T15:00:00.000Z', subscriptions: 0,
  },
];

export const migrations: PriceMigration[] = [
  {
    id: 'mig-tutorias', fromPriceVersionId: 'price-mensual', toPriceVersionId: 'price-estandar',
    target: { kind: 'group', group: 'Tutorías' }, effectiveDate: '2026-12-01', noticeSentAt: '2026-10-31T15:00:00.000Z',
    status: 'scheduled', affectedCount: 3, createdAt: '2026-10-18T15:00:00.000Z', createdBy: ADMIN,
  },
];

export const adminStats = { trial: 12, active: 41, grace: 3, expired: 7, pendingNotices: 1, revenueMonthCop: 615000 };

type Row = AdminSubscriptionRow;

const fundador = { id: 'price-fundador', name: 'Fundador' };
const grace = (until: string) => new Date(new Date(until).getTime() + 3 * 86_400_000).toISOString();

export const adminRows: Row[] = [
  { proId: 'pro-laura', name: 'Dra. Laura Pérez', slug: 'dra-laura-perez', title: 'Odontología', email: lauraProfile.email, state: 'trial', accessUntil: '2026-10-25T14:00:00.000Z', graceUntil: grace('2026-10-25T14:00:00.000Z'), price: fundador, lastPayment: null, pendingNotice: false },
  { proId: 'pro-andres', name: 'Andrés Restrepo', slug: 'andres-restrepo-abogado', title: '', email: 'andres@restrepoabogados.co', state: 'active', accessUntil: '2027-01-14T14:00:00.000Z', graceUntil: grace('2027-01-14T14:00:00.000Z'), price: fundador, lastPayment: { method: 'nequi', amountCop: 15000, paidAt: '2026-10-14T15:00:00.000Z', status: 'approved' }, pendingNotice: false },
  { proId: 'pro-lua', name: 'Estudio Lúa', slug: 'estudio-lua', title: 'Estética', email: 'hola@estudiolua.co', state: 'grace', accessUntil: '2026-10-18T14:00:00.000Z', graceUntil: grace('2026-10-18T14:00:00.000Z'), price: fundador, lastPayment: { method: 'transfer', amountCop: 15000, paidAt: '2026-07-18T15:00:00.000Z', status: 'approved' }, pendingNotice: true },
  { proId: 'pro-camilo', name: 'Camilo Arango', slug: 'camilo-entrena', title: '', email: 'camilo@entrena.co', state: 'active', accessUntil: '2027-04-03T14:00:00.000Z', graceUntil: grace('2027-04-03T14:00:00.000Z'), price: fundador, lastPayment: { method: 'transfer', amountCop: 30000, paidAt: '2026-10-03T15:00:00.000Z', status: 'approved' }, pendingNotice: false },
  { proId: 'pro-natalia', name: 'Natalia Vélez', slug: 'psic-natalia-velez', title: '', email: 'natalia@psicologia.co', state: 'expired', accessUntil: '2026-10-02T14:00:00.000Z', graceUntil: grace('2026-10-02T14:00:00.000Z'), price: fundador, lastPayment: { method: 'nequi', amountCop: 15000, paidAt: '2026-07-02T15:00:00.000Z', status: 'approved' }, pendingNotice: false },
  { proId: 'pro-felipe', name: 'Felipe Mora', slug: 'profe-felipe', title: 'Tutorías', email: 'felipe@tutorias.co', state: 'active', accessUntil: '2026-11-30T14:00:00.000Z', graceUntil: grace('2026-11-30T14:00:00.000Z'), price: { id: 'price-mensual', name: 'Mensual' }, lastPayment: { method: 'transfer', amountCop: 5900, paidAt: '2026-09-30T15:00:00.000Z', status: 'approved' }, pendingNotice: false },
];

export const luaPayments: Payment[] = [
  {
    id: 'pay-lua-3', proId: 'pro-lua', method: 'nequi', status: 'pending', source: 'pro_notice', amountCop: 15000, months: 3,
    paidAt: '2026-10-20T13:40:00.000Z', until: null, reference: 'M48213', priceVersionId: 'price-fundador', createdAt: '2026-10-20T13:40:00.000Z',
  },
  {
    id: 'pay-lua-2', proId: 'pro-lua', method: 'transfer', status: 'rejected', source: 'pro_notice', amountCop: 15000, months: 3,
    paidAt: '2026-10-18T15:00:00.000Z', until: null, reference: '', priceVersionId: 'price-fundador', createdAt: '2026-10-18T15:00:00.000Z',
    reviewedBy: { sub: 'admin-sub', email: 'cristian@separame.app' }, reviewedAt: '2026-10-18T20:00:00.000Z', rejectReason: 'No encontramos la transferencia',
  },
  {
    id: 'pay-lua-1', proId: 'pro-lua', method: 'transfer', status: 'approved', source: 'admin', amountCop: 15000, months: 3, paidAt: '2026-07-18T15:00:00.000Z',
    until: '2026-10-18T14:00:00.000Z', reference: 'SEP-LUA-0001', priceVersionId: 'price-fundador', recordedBy: { sub: 'admin-sub', email: 'cristian@separame.app' },
    createdAt: '2026-07-18T15:00:00.000Z',
  },
];

export const luaProfile: ProProfile = {
  id: 'pro-lua', slug: 'estudio-lua', name: 'Estudio Lúa', title: 'Estética', city: 'Medellín', neighborhood: 'Laureles', address: 'Carrera 35 # 8A-12',
  phone: '3105550199', email: 'hola@estudiolua.co', createdAt: '2026-07-11T15:00:00.000Z', updatedAt: '2026-07-11T15:00:00.000Z',
};

export const expiredPayments: Payment[] = [
  {
    id: 'pay-laura-1', proId: 'pro-laura', method: 'nequi', status: 'approved', source: 'pro_notice', amountCop: 15000, months: 3, paidAt: '2026-07-15T15:00:00.000Z',
    until: '2026-10-16T04:00:00.000Z', reference: 'M10233', priceVersionId: 'price-fundador', createdAt: '2026-07-15T15:00:00.000Z',
    reviewedBy: { sub: 'admin-sub', email: 'cristian@separame.app' }, reviewedAt: '2026-07-15T18:00:00.000Z',
  },
];

export type BillingMockState = 'none' | 'pending' | 'rejected';

export function billingNotices(state: BillingMockState): Payment[] {
  if (state === 'pending') {
    return [{
      id: 'pay-notice-1', proId: 'pro-laura', method: 'nequi', status: 'pending', source: 'pro_notice', amountCop: 50000, months: 12,
      paidAt: '2026-10-20T13:00:00.000Z', until: null, reference: 'M77120', priceVersionId: 'price-fundador', createdAt: '2026-10-20T13:00:00.000Z',
    }];
  }
  if (state === 'rejected') {
    return [{
      id: 'pay-notice-0', proId: 'pro-laura', method: 'transfer', status: 'rejected', source: 'pro_notice', amountCop: 15000, months: 3,
      paidAt: '2026-10-19T15:00:00.000Z', until: null, reference: '', priceVersionId: 'price-fundador', createdAt: '2026-10-19T15:00:00.000Z',
      reviewedBy: { sub: 'admin-sub', email: 'cristian@separame.app' }, reviewedAt: '2026-10-19T21:00:00.000Z', rejectReason: 'El valor recibido no coincide con el plan',
    }];
  }
  return [];
}

export const instructions: PaymentInstructions = {
  methods: [
    { kind: 'nequi', label: 'Nequi', detail: '300 000 0000' },
    { kind: 'transfer', label: 'Bancolombia ahorros', detail: '123-456789-01' },
  ],
  holderName: 'Sepárame',
  note: 'Envía el valor exacto del plan. Activamos tu plan el mismo día hábil.',
};

/** "Tu calendario" links for a feed token (same shapes the API returns). */
export function calendarSyncFor(token: string, invitesEnabled: boolean) {
  const feedUrl = `https://api.dev.separame.app/public/calendar/${token}.ics`;
  const webcalUrl = feedUrl.replace(/^https:/, 'webcal:');
  return {
    feedUrl,
    webcalUrl,
    googleUrl: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`,
    outlookUrl: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl)}&name=${encodeURIComponent('Sepárame')}`,
    invitesEnabled,
    createdAt: '2026-10-18T15:00:00.000Z',
  };
}

export const CALENDAR_TOKEN = 'demoToken7f3a9c1e5b2d4086';

export function waitlistEntries(): WaitlistEntry[] {
  const base = { proId: lauraProfile.id, status: 'waiting' as const, notifiedCount: 0, lastNotifiedAt: null };
  return [
    { ...base, id: 'wl-1', serviceId: 'svc-limpieza', serviceName: 'Limpieza dental', dates: ['2026-10-22', '2026-10-23'], client: { name: 'Paula Restrepo', email: 'paula.restrepo@correo.co', phone: '3007788990' }, createdAt: '2026-10-19T14:00:00.000Z' },
    { ...base, id: 'wl-2', serviceId: 'svc-valoracion', serviceName: 'Valoración', dates: ['2026-10-21'], client: { name: 'Esteban Gil', email: 'esteban.gil@correo.co', phone: '3014455667' }, createdAt: '2026-10-19T20:30:00.000Z', notifiedCount: 1, lastNotifiedAt: '2026-10-20T13:00:00.000Z' },
    { ...base, id: 'wl-3', serviceId: 'svc-control', serviceName: 'Control', dates: ['2026-10-26', '2026-10-27', '2026-10-28'], client: { name: 'Lina Marcela Ruiz', email: '', phone: '3102233445' }, createdAt: '2026-10-20T11:15:00.000Z' },
    { ...base, id: 'wl-4', serviceId: 'svc-valoracion', serviceName: 'Valoración', dates: ['2026-10-23'], client: { name: 'Andrés Cardona', email: 'andres.cardona@correo.co', phone: '3156677889' }, createdAt: '2026-10-20T12:40:00.000Z' },
    { ...base, id: 'wl-5', serviceId: 'svc-limpieza', serviceName: 'Limpieza dental', dates: ['2026-10-20'], status: 'booked', client: { name: 'Camila Zapata', email: 'camila.zapata@correo.co', phone: '3120001122' }, createdAt: '2026-10-18T12:40:00.000Z' },
  ];
}

export const PUSH_VAPID_KEY = 'BMockVapidPublicKey_onlyForMockMode_not-real-0123456789abcdefghijklmnopqrstuvwxyzABCDEFG';
