/**
 * zod schemas for every request body/query. The backend validates ALL input
 * with these; the panel (React) may reuse them for forms. The booking bundle
 * must NOT import this file (keeps zod out of the < 50 KB budget).
 * Messages are user-facing Spanish.
 */
// Namespace import: lets the bundler drop zod's locale files (≈ 450 KB → 85 KB per Lambda).
import * as z from 'zod';
import { CONTACT_MESSAGES, normalizePhone } from './contact';
import { slugProblem } from './slug';
import { WEEKDAYS, minutesOf } from './time';

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const hhmmSchema = z
  .string()
  .regex(HHMM_RE, 'Hora inválida')
  .refine((t) => minutesOf(t) % 5 === 0, 'La hora debe ir en múltiplos de 5 minutos');

export const isoDateSchema = z.string().regex(ISO_DATE_RE, 'Fecha inválida');
export const isoInstantSchema = z.iso.datetime({ offset: true, message: 'Fecha y hora inválidas' });

const name = (label: string, max = 80) =>
  z.string().trim().min(2, `${label} es muy corto`).max(max, `${label} es muy largo`);

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email(CONTACT_MESSAGES.email)).pipe(z.string().max(254));

/** Colombian numbers: 10 digits (mobile 3xx, landline 60x). Same normalization as the booking page (contact.ts). */
export const phoneSchema = z
  .string()
  .transform(normalizePhone)
  .pipe(z.string().regex(/^\d{10}$/, CONTACT_MESSAGES.phone));

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .superRefine((slug, ctx) => {
    const problem = slugProblem(slug);
    const messages = {
      too_short: 'El enlace debe tener al menos 3 caracteres',
      too_long: 'El enlace puede tener máximo 40 caracteres',
      invalid: 'Usa solo letras minúsculas, números y guiones',
      reserved: 'Ese enlace está reservado, prueba otro',
    } as const;
    if (problem) ctx.addIssue({ code: 'custom', message: messages[problem] });
  });

export const clientContactSchema = z.object({
  name: name('El nombre'),
  email: emailSchema,
  phone: phoneSchema,
});

// ── Public ─────────────────────────────────────────────────────────────────

export const availabilityQuerySchema = z.object({
  serviceId: z.string().min(1).max(64),
  from: isoDateSchema.optional(),
  days: z.coerce.number().int().min(1).max(31).optional(),
});

export const createBookingSchema = z.object({
  serviceId: z.string().min(1).max(64),
  start: isoInstantSchema,
  client: clientContactSchema,
  consent: z.literal(true, { message: 'Debes autorizar el tratamiento de tus datos' }),
  turnstileToken: z.string().min(1).max(4096),
});

export const cancelBookingSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});

export const rescheduleBookingSchema = z.object({
  start: isoInstantSchema,
});

// ── Professional ───────────────────────────────────────────────────────────

export const onboardingSchema = z.object({
  name: name('El nombre'),
  title: name('La profesión', 60),
  city: name('La ciudad', 60),
  neighborhood: z.string().trim().max(60).default(''),
  address: z.string().trim().max(160).default(''),
  phone: phoneSchema.nullable().default(null),
  slug: slugSchema,
});

export const updateProfileSchema = onboardingSchema;

export const slugCheckQuerySchema = z.object({ slug: z.string().max(80) });

export const upsertServiceSchema = z.object({
  name: name('El nombre del servicio', 60),
  durationMin: z.number().int().min(5).max(480).refine((m) => m % 5 === 0, 'La duración va en múltiplos de 5 minutos'),
  priceCop: z.number().int().min(0).max(100_000_000).nullable(),
  description: z.string().trim().max(200).default(''),
  visible: z.boolean().default(true),
});

const timeRangeSchema = z
  .object({ start: hhmmSchema, end: hhmmSchema })
  .refine((r) => minutesOf(r.start) < minutesOf(r.end), 'La hora final debe ser después de la inicial');

const dayRangesSchema = z
  .array(timeRangeSchema)
  .max(6)
  .refine((ranges) => {
    const sorted = [...ranges].sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
    return sorted.every((r, i) => i === 0 || minutesOf(r.start) >= minutesOf(sorted[i - 1].end));
  }, 'Las franjas de un mismo día no se pueden cruzar');

export const weeklyScheduleSchema = z.object(
  Object.fromEntries(WEEKDAYS.map((d) => [d, dayRangesSchema])) as Record<(typeof WEEKDAYS)[number], typeof dayRangesSchema>,
);

export const bookingRulesSchema = z.object({
  bufferMin: z.number().int().min(0).max(120).refine((m) => m % 5 === 0, 'Múltiplos de 5 minutos'),
  minNoticeMin: z.number().int().min(0).max(7 * 24 * 60),
  maxDaysAhead: z.number().int().min(1).max(365),
  slotStepMin: z.union([5, 10, 15, 20, 30, 45, 60].map((n) => z.literal(n)) as [z.ZodLiteral<number>, ...z.ZodLiteral<number>[]]),
  closedOnHolidays: z.boolean(),
});

export const putAvailabilitySchema = z.object({
  schedule: weeklyScheduleSchema,
  rules: bookingRulesSchema,
});

export const createBlockSchema = z
  .object({
    label: name('El nombre', 60),
    start: isoInstantSchema,
    end: isoInstantSchema,
  })
  .refine((b) => new Date(b.start) < new Date(b.end), 'El final debe ser después del inicio');

export const listAppointmentsQuerySchema = z
  .object({ from: isoDateSchema, to: isoDateSchema })
  .refine((q) => q.from <= q.to, 'Rango inválido');

export const createAppointmentSchema = z.object({
  serviceId: z.string().min(1).max(64),
  start: isoInstantSchema,
  client: z.object({
    name: name('El nombre'),
    email: z.union([z.literal(''), emailSchema]).default(''),
    phone: phoneSchema,
  }),
});

export const moveAppointmentSchema = z.object({ start: isoInstantSchema });

export const cancelAppointmentSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});

export const updateCalendarSyncSchema = z.object({
  invitesEnabled: z.boolean(),
});

export const paymentNoticeSchema = z.object({
  months: z.number().int().min(1).max(36),
  method: z.enum(['nequi', 'transfer']),
  reference: z.string().trim().max(200).default(''),
});

export const paymentInstructionsSchema = z.object({
  methods: z
    .array(z.object({ kind: z.enum(['nequi', 'transfer']), label: z.string().min(1).max(60), detail: z.string().min(1).max(80) }))
    .min(1)
    .max(4),
  holderName: z.string().min(1).max(80),
  note: z.string().max(200).default(''),
});

// ── Admin ──────────────────────────────────────────────────────────────────

export const listSubscriptionsQuerySchema = z.object({
  state: z.enum(['trial', 'active', 'grace', 'expired']).optional(),
  q: z.string().trim().max(80).optional(),
});

export const manualPaymentSchema = z
  .object({
    noticeId: z.string().min(1).max(80).optional(),
    method: z.enum(['transfer', 'nequi', 'cash', 'courtesy']),
    amountCop: z.number().int().min(0).max(100_000_000).nullable(),
    paidAt: isoDateSchema,
    period: z.union([
      z.object({ months: z.number().int().min(1).max(36) }),
      z.object({ until: isoDateSchema }),
    ]),
    reference: z.string().trim().max(200).default(''),
    notify: z.boolean(),
  })
  .refine((p) => p.method === 'courtesy' || (p.amountCop !== null && p.amountCop > 0), {
    message: 'Escribe el monto recibido',
    path: ['amountCop'],
  });

const pricePackageSchema = z.object({
  months: z.number().int().min(1).max(36),
  amountCop: z.number().int().min(1).max(100_000_000),
});

export const createPriceSchema = z
  .object({
    code: z.string().regex(/^[a-z0-9-]{3,40}$/, 'Código: minúsculas, números y guiones'),
    name: name('El nombre', 40),
    monthlyCop: z.number().int().min(1).max(100_000_000).nullable(),
    packages: z.array(pricePackageSchema).max(6),
    status: z.enum(['active', 'draft']),
    isDefault: z.boolean(),
  })
  .refine((p) => p.status === 'draft' || (p.monthlyCop !== null && p.packages.length > 0), {
    message: 'Una versión activa necesita precio mensual y al menos un paquete',
    path: ['packages'],
  });

export const rejectNoticeSchema = z.object({
  reason: z.string().trim().min(3, 'Escribe el motivo').max(300),
});

export const updatePriceSchema = z.object({
  status: z.enum(['active', 'draft', 'inactive']).optional(),
  isDefault: z.boolean().optional(),
});

export const createMigrationSchema = z.object({
  fromPriceVersionId: z.string().min(1),
  toPriceVersionId: z.string().min(1),
  target: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('group'), group: z.string().trim().min(1).max(60) }),
    z.object({ kind: z.literal('pros'), proIds: z.array(z.string().min(1)).min(1).max(500) }),
    z.object({ kind: z.literal('version') }),
  ]),
  effectiveDate: isoDateSchema,
});
