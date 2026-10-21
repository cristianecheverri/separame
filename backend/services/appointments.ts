import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type {
  BookingSummary, CreateBookingResponse, ManagedAppointmentResponse,
} from '../../shared/api';
import { CLIENT_CHANGE_CUTOFF_MIN } from '../../shared/api';
import { isSlotBookable, lockUnits } from '../../shared/availability';
import { clientKeyOf } from '../../shared/clients';
import { initials, priceDisplayOf } from '../../shared/format';
import { GSI2, LSI1 } from '../../shared/infra';
import { addDays, addMinutes, bogotaDate, toInstant, type ISODate, type ISOInstant } from '../../shared/time';
import type { Actor, Appointment, AppointmentOutcome, ClientContact, ProProfile, Service } from '../../shared/types';
import {
  cancellationCodes, ddb, failedConditionIndex, getItem, isConditionalFailure, MAX_TRANSACT_ITEMS, queryAll, table, transactWrite,
  type Item, type TransactItem,
} from '../lib/dynamo';
import { ApiError } from '../lib/http';
import { newId } from '../lib/ids';
import { apptKey, apptStartSk, bookingIdempotencyKey, lockKey, proPk, remindPk, remindSk } from '../lib/keys';
import { log } from '../lib/logger';
import { linkSecret, manageTokenFor, verifyManageToken } from '../lib/tokens';
import { loadContext } from './availability';

/**
 * Appointments (`PRO#<id> / APPT#<apptId>`) and the double-booking guard.
 *
 * Every create/move writes, in ONE DynamoDB transaction, the appointment and
 * one `LOCK#<proId>#<bogotaDate> / <HH:mm>` item per 5-minute unit of
 * [start, end + buffer) with `attribute_not_exists(PK)`. Two overlapping
 * bookings always share a unit, so the second transaction is canceled and
 * surfaces as 409 `slot_taken`. Cancel deletes the locks and the reminder
 * attributes in the same transaction. Emails are NOT sent here: the DynamoDB
 * stream (stream-appointments) reacts to the item changes.
 */

const DAY_MS = 86_400_000;
const REMINDER_LEAD_MS = DAY_MS;

/** Internal attributes kept on the item next to the public `Appointment` fields. */
export interface AppointmentItem extends Appointment {
  /** Buffer used when the locks were written (rules may change later). */
  lockBufferMin: number;
  /** Who made the last change (stream-appointments decides whom to notify). */
  lastChangedBy?: Actor;
}

/**
 * Revision: 0 on create, +1 in every calendar change (move, cancel) — the
 * iCalendar SEQUENCE of the feed and invitations. Attendance confirmation and
 * outcome are not calendar changes and don't bump it. Missing = 0.
 */
export const revisionOf = (appt: Pick<Partial<AppointmentItem>, 'revision'>): number => appt.revision ?? 0;

/** Old items predate some fields: fill the defaults so every reader sees a full Appointment. */
export function normalizeAppointment(item: Item): AppointmentItem {
  const a = item as Partial<AppointmentItem> & Item;
  return {
    ...(a as AppointmentItem),
    clientConfirmation: a.clientConfirmation ?? 'pending',
    revision: a.revision ?? 0,
    clientKey: a.clientKey ?? clientKeyOf(a.client ?? { email: '', phone: '' }),
  };
}

export function toAppointment(item: Item): Appointment {
  const a = normalizeAppointment(item);
  return {
    id: a.id, proId: a.proId, serviceId: a.serviceId, serviceName: a.serviceName, durationMin: a.durationMin,
    priceCop: a.priceCop ?? null, ...(a.priceDisplay ? { priceDisplay: a.priceDisplay } : {}),
    start: a.start, end: a.end, status: a.status, client: a.client,
    createdBy: a.createdBy, createdAt: a.createdAt, updatedAt: a.updatedAt,
    ...(a.cancelledBy ? { cancelledBy: a.cancelledBy } : {}),
    ...(a.cancelReason ? { cancelReason: a.cancelReason } : {}),
    ...(a.reminderSentAt ? { reminderSentAt: a.reminderSentAt } : {}),
    clientConfirmation: a.clientConfirmation,
    ...(a.confirmedAt ? { confirmedAt: a.confirmedAt } : {}),
    ...(a.outcome ? { outcome: a.outcome } : {}),
    ...(a.outcomeAt ? { outcomeAt: a.outcomeAt } : {}),
    revision: a.revision,
    clientKey: a.clientKey,
  };
}

/**
 * GSI2 attributes for the pending 24 h reminder, or null when start − 24 h
 * already passed or the client left no email (nothing to send it to).
 */
export function reminderAttrs(
  proId: string, apptId: string, start: ISOInstant, now: Date, client: Pick<ClientContact, 'email'>,
): Record<string, string> | null {
  if (!client.email) return null;
  const remindAtMs = new Date(start).getTime() - REMINDER_LEAD_MS;
  if (remindAtMs <= now.getTime()) return null;
  const remindAt = new Date(remindAtMs).toISOString();
  return { [GSI2.pk]: remindPk(remindAt), [GSI2.sk]: remindSk(remindAt, proId, apptId) };
}

export function bookingSummary(appt: Appointment, pro: ProProfile): BookingSummary {
  return {
    appointmentId: appt.id,
    status: appt.status,
    clientConfirmation: appt.clientConfirmation ?? 'pending',
    start: appt.start,
    end: appt.end,
    serviceId: appt.serviceId,
    serviceName: appt.serviceName,
    durationMin: appt.durationMin,
    priceCop: appt.priceCop,
    priceDisplay: priceDisplayOf(appt),
    client: { name: appt.client.name, email: appt.client.email },
    pro: {
      slug: pro.slug, name: pro.name, title: pro.title, city: pro.city, neighborhood: pro.neighborhood,
      address: pro.address, phone: pro.phone, initials: initials(pro.name),
    },
  };
}

// ── Locks ──────────────────────────────────────────────────────────────────

/** Locks expire (TTL) 7 days after the slot + buffer ends: a past slot can never be booked again. */
const LOCK_TTL_GRACE_MS = 7 * DAY_MS;
export const lockTtlFor = (start: ISOInstant, durationMin: number, bufferMin: number): number =>
  Math.floor((new Date(start).getTime() + (durationMin + bufferMin) * 60_000 + LOCK_TTL_GRACE_MS) / 1000);

const lockPut = (proId: string, apptId: string, unit: ISOInstant, ttl: number): TransactItem => ({
  Put: {
    TableName: table(),
    Item: { ...lockKey(proId, unit), apptId, proId, at: unit, ttl },
    ConditionExpression: 'attribute_not_exists(PK)',
  },
});

/** Deletes a lock only if it is ours (or already gone), never someone else's. */
const lockDelete = (proId: string, apptId: string, unit: ISOInstant): TransactItem => ({
  Delete: {
    TableName: table(),
    Key: lockKey(proId, unit),
    ConditionExpression: 'attribute_not_exists(PK) OR apptId = :a',
    ExpressionAttributeValues: { ':a': apptId },
  },
});

const unitId = (unit: ISOInstant) => new Date(unit).toISOString();

/** Lock units to acquire / release when moving from `before` to `after` (shared units stay untouched). */
export function lockDiff(before: ISOInstant[], after: ISOInstant[]): { acquire: ISOInstant[]; release: ISOInstant[] } {
  const b = new Set(before.map(unitId));
  const a = new Set(after.map(unitId));
  return { acquire: [...a].filter((u) => !b.has(u)), release: [...b].filter((u) => !a.has(u)) };
}

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Maps a canceled transaction: a failed condition on one of the `mainCount`
 * leading operations (the appointment itself) → `conflict`; on a lock (or a
 * concurrent transaction touching the same lock) → `slot_taken`.
 */
function mapLockError(err: unknown, mainCount: number): unknown {
  const codes = cancellationCodes(err);
  if (!codes.length) return err;
  const index = failedConditionIndex(err);
  if (index >= 0 && index < mainCount) return new ApiError('conflict', 'La cita cambió mientras tanto. Recarga e intenta de nuevo.');
  if (index >= 0 || codes.includes('TransactionConflict')) return new ApiError('slot_taken');
  return err;
}

/**
 * Writes `main` (the appointment put/update) together with lock changes in one
 * transaction. Very long services can exceed DynamoDB's 100-operation limit;
 * then the locks are acquired first in chunks (rolled back on failure), the
 * appointment is written, and the released locks are deleted last.
 */
export async function writeWithLocks(input: {
  proId: string; apptId: string; main: TransactItem[]; acquire: ISOInstant[]; release: ISOInstant[];
  /** `ttl` of the acquired locks (see `lockTtlFor`). */
  lockTtl: number;
}): Promise<void> {
  const { proId, apptId, main, lockTtl } = input;
  const acquireOps = input.acquire.map((u) => lockPut(proId, apptId, u, lockTtl));
  const releaseOps = input.release.map((u) => lockDelete(proId, apptId, u));
  const all = [...main, ...acquireOps, ...releaseOps];

  if (all.length <= MAX_TRANSACT_ITEMS) {
    try {
      await transactWrite(all);
    } catch (err) {
      throw mapLockError(err, main.length);
    }
    return;
  }

  const acquired: ISOInstant[] = [];
  try {
    for (const chunk of chunks(input.acquire, MAX_TRANSACT_ITEMS)) {
      try {
        await transactWrite(chunk.map((u) => lockPut(proId, apptId, u, lockTtl)));
      } catch (err) {
        throw mapLockError(err, 0);
      }
      acquired.push(...chunk);
    }
    try {
      await transactWrite(main);
    } catch (err) {
      throw mapLockError(err, main.length);
    }
  } catch (err) {
    await releaseLocks(proId, apptId, acquired).catch((e) => log.error('lock rollback failed', { proId, apptId, err: e }));
    throw err;
  }
  await releaseLocks(proId, apptId, input.release);
}

async function releaseLocks(proId: string, apptId: string, units: ISOInstant[]): Promise<void> {
  for (const chunk of chunks(units, MAX_TRANSACT_ITEMS)) {
    await transactWrite(chunk.map((u) => lockDelete(proId, apptId, u)));
  }
}

// ── Core operations ────────────────────────────────────────────────────────

export async function getAppointmentItem(proId: string, apptId: string, consistent = true): Promise<AppointmentItem | undefined> {
  const item = await getItem(apptKey(proId, apptId), consistent);
  return item ? normalizeAppointment(item) : undefined;
}

export async function requireAppointmentItem(proId: string, apptId: string): Promise<AppointmentItem> {
  const item = await getAppointmentItem(proId, apptId, true);
  if (!item) throw new ApiError('not_found', 'No encontramos esa cita.');
  return item;
}

const normalize = (instant: ISOInstant) => new Date(instant).toISOString();

export interface CreateAppointmentInput {
  proId: string;
  service: Service;
  start: ISOInstant;
  client: ClientContact;
  createdBy: Actor;
  now: Date;
  /** Pro bookings skip `minNoticeMin` (same slot rules otherwise). */
  ignoreMinNotice?: boolean;
  /** Client-generated UUID of a public booking attempt (see `CreateBookingRequest.idempotencyKey`). */
  idempotencyKey?: string;
}

/** Idempotency markers only need to outlive the client's retries. */
const IDEMPOTENCY_TTL_MS = DAY_MS;

interface IdempotencyMarker {
  apptId: string;
  start: ISOInstant;
  serviceId: string;
}

/**
 * The appointment an earlier attempt with the same idempotency key created, or
 * undefined when there was none. A key reused for a different slot or service
 * is a client bug: refuse it rather than hand back the wrong appointment.
 */
async function replayedAppointment(proId: string, key: string, start: ISOInstant, serviceId: string): Promise<AppointmentItem | undefined> {
  const marker = await getItem<IdempotencyMarker>(bookingIdempotencyKey(proId, key), true);
  if (!marker) return undefined;
  const appt = await getAppointmentItem(proId, marker.apptId, true);
  if (!appt || marker.start !== start || marker.serviceId !== serviceId || appt.status !== 'confirmed') {
    throw new ApiError('conflict', 'Esta reserva ya se intentó con otros datos. Recarga la página e inténtalo de nuevo.');
  }
  log.info('booking replayed', { proId, appointmentId: appt.id });
  return appt;
}

const idempotencyPut = (proId: string, key: string, marker: IdempotencyMarker, now: Date): TransactItem => ({
  Put: {
    TableName: table(),
    Item: { ...bookingIdempotencyKey(proId, key), ...marker, ttl: Math.floor((now.getTime() + IDEMPOTENCY_TTL_MS) / 1000) },
    ConditionExpression: 'attribute_not_exists(PK)',
  },
});

/**
 * Validates the slot against fresh (consistent) data and writes appointment + locks atomically.
 * With an idempotency key, a retry of a booking that already went through returns that same
 * appointment (the marker is written in the same transaction, so it exists iff the appointment does).
 */
export async function createAppointment(input: CreateAppointmentInput): Promise<AppointmentItem> {
  const { proId, service, now, idempotencyKey } = input;
  const start = normalize(input.start);
  if (idempotencyKey) {
    const replayed = await replayedAppointment(proId, idempotencyKey, start, service.id);
    if (replayed) return replayed;
  }
  const ctx = await loadContext({
    proId, durationMin: service.durationMin, from: bogotaDate(start), days: 1, now,
    ignoreMinNotice: input.ignoreMinNotice, consistent: true,
  });
  if (!isSlotBookable(start, ctx)) throw new ApiError('slot_taken');

  const at = now.toISOString();
  const id = newId(now);
  const appt: AppointmentItem = {
    id, proId, serviceId: service.id, serviceName: service.name, durationMin: service.durationMin, priceCop: service.priceCop,
    priceDisplay: priceDisplayOf(service),
    start, end: addMinutes(start, service.durationMin), status: 'confirmed', client: input.client,
    createdBy: input.createdBy, createdAt: at, updatedAt: at, lockBufferMin: ctx.rules.bufferMin, lastChangedBy: input.createdBy,
    revision: 0,
    clientConfirmation: 'pending',
    clientKey: clientKeyOf(input.client),
  };
  const item = {
    ...apptKey(proId, id),
    ...appt,
    [LSI1.sk]: apptStartSk(start),
    ...(reminderAttrs(proId, id, start, now, input.client) ?? {}),
  };
  const main: TransactItem[] = [{ Put: { TableName: table(), Item: item, ConditionExpression: 'attribute_not_exists(PK)' } }];
  if (idempotencyKey) main.push(idempotencyPut(proId, idempotencyKey, { apptId: id, start, serviceId: service.id }, now));
  try {
    await writeWithLocks({
      proId,
      apptId: id,
      main,
      acquire: lockUnits(start, service.durationMin, ctx.rules.bufferMin),
      release: [],
      lockTtl: lockTtlFor(start, service.durationMin, ctx.rules.bufferMin),
    });
  } catch (err) {
    // Two copies of the same attempt raced: the loser fails on the marker or the locks.
    const replayed = idempotencyKey ? await replayedAppointment(proId, idempotencyKey, start, service.id) : undefined;
    if (replayed) return replayed;
    throw err;
  }
  log.info('appointment created', { proId, appointmentId: id, createdBy: input.createdBy });
  return appt;
}

export interface MoveAppointmentInput {
  appt: AppointmentItem;
  start: ISOInstant;
  actor: Actor;
  now: Date;
  ignoreMinNotice?: boolean;
}

/** Reschedule: slot check (ignoring itself), then locks diff + item update in one transaction. */
export async function moveAppointment(input: MoveAppointmentInput): Promise<AppointmentItem> {
  const { appt, now } = input;
  if (appt.status !== 'confirmed') throw new ApiError('conflict', 'Esta cita ya fue cancelada.');
  const start = normalize(input.start);
  if (start === appt.start) return appt;

  const ctx = await loadContext({
    proId: appt.proId, durationMin: appt.durationMin, from: bogotaDate(start), days: 1, now,
    ignoreMinNotice: input.ignoreMinNotice, excludeAppointmentId: appt.id, consistent: true,
  });
  if (!isSlotBookable(start, ctx)) throw new ApiError('slot_taken');

  const end = addMinutes(start, appt.durationMin);
  const at = now.toISOString();
  const reminder = reminderAttrs(appt.proId, appt.id, start, now, appt.client);
  const { acquire, release } = lockDiff(
    lockUnits(appt.start, appt.durationMin, appt.lockBufferMin ?? ctx.rules.bufferMin),
    lockUnits(start, appt.durationMin, ctx.rules.bufferMin),
  );

  const values: Record<string, unknown> = {
    ':start': start, ':end': end, ':lsi': apptStartSk(start), ':u': at, ':by': input.actor,
    ':buf': ctx.rules.bufferMin, ':confirmed': 'confirmed', ':old': appt.start, ':zero': 0, ':one': 1,
  };
  let update = 'SET #start = :start, #end = :end, #lsi = :lsi, updatedAt = :u, lastChangedBy = :by, lockBufferMin = :buf, revision = if_not_exists(revision, :zero) + :one';
  const names: Record<string, string> = { '#start': 'start', '#end': 'end', '#lsi': LSI1.sk, '#st': 'status', '#g2pk': GSI2.pk, '#g2sk': GSI2.sk };
  if (reminder) {
    update += ', #g2pk = :g2pk, #g2sk = :g2sk REMOVE reminderSentAt';
    values[':g2pk'] = reminder[GSI2.pk];
    values[':g2sk'] = reminder[GSI2.sk];
  } else {
    update += ' REMOVE #g2pk, #g2sk';
  }

  await writeWithLocks({
    proId: appt.proId,
    apptId: appt.id,
    main: [{
      Update: {
        TableName: table(),
        Key: apptKey(appt.proId, appt.id),
        UpdateExpression: update,
        ConditionExpression: '#st = :confirmed AND #start = :old',
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      },
    }],
    acquire,
    release,
    lockTtl: lockTtlFor(start, appt.durationMin, ctx.rules.bufferMin),
  });
  log.info('appointment moved', { proId: appt.proId, appointmentId: appt.id, actor: input.actor });
  return {
    ...appt, start, end, updatedAt: at, lastChangedBy: input.actor, lockBufferMin: ctx.rules.bufferMin, revision: revisionOf(appt) + 1,
    // A new pending reminder replaces the old "sent" mark.
    reminderSentAt: reminder ? undefined : appt.reminderSentAt,
  };
}

/** Cancel: status + locks + pending reminder removed in one transaction. Idempotent. */
export async function cancelAppointment(input: { appt: AppointmentItem; actor: Actor; reason?: string; now: Date }): Promise<AppointmentItem> {
  const { appt, now } = input;
  if (appt.status === 'cancelled') return appt;
  const at = now.toISOString();
  const reason = input.reason?.trim() || undefined;
  const values: Record<string, unknown> = { ':c': 'cancelled', ':by': input.actor, ':u': at, ':confirmed': 'confirmed', ':zero': 0, ':one': 1 };
  let update = 'SET #st = :c, cancelledBy = :by, updatedAt = :u, lastChangedBy = :by, revision = if_not_exists(revision, :zero) + :one';
  if (reason) {
    update += ', cancelReason = :r';
    values[':r'] = reason;
  }
  update += ' REMOVE #g2pk, #g2sk';

  await writeWithLocks({
    proId: appt.proId,
    apptId: appt.id,
    main: [{
      Update: {
        TableName: table(),
        Key: apptKey(appt.proId, appt.id),
        UpdateExpression: update,
        ConditionExpression: '#st = :confirmed',
        ExpressionAttributeNames: { '#st': 'status', '#g2pk': GSI2.pk, '#g2sk': GSI2.sk },
        ExpressionAttributeValues: values,
      },
    }],
    acquire: [],
    release: lockUnits(appt.start, appt.durationMin, appt.lockBufferMin ?? 0),
    lockTtl: 0,
  });
  log.info('appointment cancelled', { proId: appt.proId, appointmentId: appt.id, actor: input.actor });
  return {
    ...appt, status: 'cancelled', cancelledBy: input.actor, ...(reason ? { cancelReason: reason } : {}),
    updatedAt: at, lastChangedBy: input.actor, revision: revisionOf(appt) + 1,
  };
}

/**
 * "Sí, voy": the client confirms attendance (manage link / reminder). Idempotent;
 * only for confirmed appointments that haven't started. Not a calendar change
 * (no revision bump); the pro hears about it through web push.
 */
export async function confirmAttendance(appt: AppointmentItem, now: Date): Promise<AppointmentItem> {
  if (appt.status !== 'confirmed' || now.getTime() >= new Date(appt.start).getTime()) {
    throw new ApiError('too_late', 'Esta cita ya no se puede confirmar.');
  }
  if (appt.clientConfirmation === 'confirmed') return appt;
  const at = now.toISOString();
  try {
    await ddb.send(new UpdateCommand({
      TableName: table(),
      Key: apptKey(appt.proId, appt.id),
      UpdateExpression: 'SET clientConfirmation = :c, confirmedAt = :at, updatedAt = :at',
      ConditionExpression: '#st = :confirmed AND #start = :start',
      ExpressionAttributeNames: { '#st': 'status', '#start': 'start' },
      ExpressionAttributeValues: { ':c': 'confirmed', ':at': at, ':confirmed': 'confirmed', ':start': appt.start },
    }));
  } catch (err) {
    if (isConditionalFailure(err)) throw new ApiError('conflict', 'La cita cambió mientras tanto. Recarga e intenta de nuevo.');
    throw err;
  }
  log.info('attendance confirmed', { proId: appt.proId, appointmentId: appt.id });
  return { ...appt, clientConfirmation: 'confirmed', confirmedAt: at, updatedAt: at };
}

/** The pro marks attended / no-show (or clears it) once the appointment started. Record keeping: no revision bump. */
export async function setOutcome(appt: AppointmentItem, outcome: AppointmentOutcome | null, now: Date): Promise<AppointmentItem> {
  if (appt.status !== 'confirmed') throw new ApiError('too_late', 'Esta cita fue cancelada.');
  if (now.getTime() < new Date(appt.start).getTime()) {
    throw new ApiError('too_late', 'Puedes marcar la asistencia cuando llegue la hora de la cita.');
  }
  const at = now.toISOString();
  const update = outcome
    ? { UpdateExpression: 'SET outcome = :o, outcomeAt = :at, updatedAt = :at', ExpressionAttributeValues: { ':o': outcome, ':at': at, ':confirmed': 'confirmed' } }
    : { UpdateExpression: 'SET updatedAt = :at REMOVE outcome, outcomeAt', ExpressionAttributeValues: { ':at': at, ':confirmed': 'confirmed' } };
  try {
    await ddb.send(new UpdateCommand({
      TableName: table(),
      Key: apptKey(appt.proId, appt.id),
      ConditionExpression: '#st = :confirmed',
      ExpressionAttributeNames: { '#st': 'status' },
      ...update,
    }));
  } catch (err) {
    if (isConditionalFailure(err)) throw new ApiError('conflict', 'La cita cambió mientras tanto. Recarga e intenta de nuevo.');
    throw err;
  }
  const { outcome: _o, outcomeAt: _oa, ...rest } = appt;
  return { ...rest, ...(outcome ? { outcome, outcomeAt: at } : {}), updatedAt: at };
}

/** A pro's appointments with start in the Bogotá days [from, to] (LSI1 range). */
export async function listAppointments(proId: string, from: ISODate, to: ISODate): Promise<Appointment[]> {
  const startMin = toInstant(from, '00:00');
  const endExclusive = toInstant(addDays(to, 1), '00:00');
  const items = await queryAll({
    IndexName: LSI1.name,
    KeyConditionExpression: 'PK = :pk AND #sk BETWEEN :from AND :to',
    ExpressionAttributeNames: { '#sk': LSI1.sk },
    ExpressionAttributeValues: { ':pk': proPk(proId), ':from': apptStartSk(startMin), ':to': apptStartSk(endExclusive) },
    // LSIs can fetch non-projected attributes from the table: works whatever the index projection is.
    Select: 'ALL_ATTRIBUTES',
  });
  return items.filter((a) => a.start < endExclusive).map(toAppointment);
}

/** Every appointment of a pro whose start is in [from, to) (normalized items; LSI1). */
export async function appointmentItemsBetween(proId: string, from: ISOInstant, to: ISOInstant, max = 20_000): Promise<AppointmentItem[]> {
  const items = await queryAll({
    IndexName: LSI1.name,
    KeyConditionExpression: 'PK = :pk AND #sk BETWEEN :from AND :to',
    ExpressionAttributeNames: { '#sk': LSI1.sk },
    ExpressionAttributeValues: { ':pk': proPk(proId), ':from': apptStartSk(from), ':to': apptStartSk(to) },
    Select: 'ALL_ATTRIBUTES',
  }, max);
  return items.filter((a) => a.start < to).map(normalizeAppointment);
}

/** Count of confirmed upcoming appointments (admin detail). */
export async function countUpcoming(proId: string, now: Date = new Date()): Promise<number> {
  const items = await queryAll({
    IndexName: LSI1.name,
    KeyConditionExpression: 'PK = :pk AND #sk BETWEEN :from AND :to',
    FilterExpression: '#st = :c',
    ExpressionAttributeNames: { '#sk': LSI1.sk, '#st': 'status' },
    ExpressionAttributeValues: { ':pk': proPk(proId), ':from': apptStartSk(now.toISOString()), ':to': `${apptStartSk('')}~`, ':c': 'confirmed' },
    ProjectionExpression: 'id',
  });
  return items.length;
}

// ── Client manage link ─────────────────────────────────────────────────────

const INVALID_LINK = 'Este enlace no es válido o ya venció.';

/** Resolves a manage token to its appointment, or 404 (bad signature, unknown, or expired). */
export async function resolveManageToken(token: string, now: Date): Promise<AppointmentItem> {
  const result = verifyManageToken(token, await linkSecret(), now);
  if (!result.ok) throw new ApiError('not_found', INVALID_LINK);
  const appt = await getAppointmentItem(result.payload.p, result.payload.a, true);
  if (!appt) throw new ApiError('not_found', INVALID_LINK);
  // Valid while the token's own expiry OR (after a reschedule) the current end + 1 day is ahead.
  const currentExpiry = new Date(appt.end).getTime() + DAY_MS;
  if (result.expired && now.getTime() > currentExpiry) throw new ApiError('not_found', INVALID_LINK);
  return appt;
}

export function changeDeadline(appt: Pick<Appointment, 'start'>): ISOInstant {
  return addMinutes(appt.start, -CLIENT_CHANGE_CUTOFF_MIN);
}

export function canClientChange(appt: Pick<Appointment, 'start' | 'status'>, now: Date): boolean {
  return appt.status === 'confirmed' && now.getTime() < new Date(changeDeadline(appt)).getTime();
}

export function managedResponse(appt: Appointment, pro: ProProfile, now: Date): ManagedAppointmentResponse {
  return { booking: bookingSummary(appt, pro), canChange: canClientChange(appt, now), changeDeadline: changeDeadline(appt) };
}

export async function createBookingResponse(appt: Appointment, pro: ProProfile): Promise<CreateBookingResponse> {
  return { booking: bookingSummary(appt, pro), manageToken: await manageTokenFor(pro.id, appt.id, appt.end) };
}

/** Jobs: marks the reminder as sent and drops it from GSI2 — only if still pending (idempotent). */
export async function markReminderSent(proId: string, apptId: string, now: Date): Promise<boolean> {
  try {
    await ddb.send(new UpdateCommand({
      TableName: table(),
      Key: apptKey(proId, apptId),
      UpdateExpression: 'SET reminderSentAt = :now REMOVE #g2pk, #g2sk',
      ConditionExpression: 'attribute_exists(#g2pk)',
      ExpressionAttributeNames: { '#g2pk': GSI2.pk, '#g2sk': GSI2.sk },
      ExpressionAttributeValues: { ':now': now.toISOString() },
    }));
    return true;
  } catch (err) {
    if (isConditionalFailure(err)) return false;
    throw err;
  }
}
