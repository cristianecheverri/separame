import { DeleteCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { JoinWaitlistRequest, JoinWaitlistResponse, LeaveWaitlistResponse } from '../../shared/api';
import { computeDay } from '../../shared/availability';
import { clientKeyOf } from '../../shared/clients';
import { SITE_PATHS } from '../../shared/infra';
import { addDays, toInstant, todayBogota, type ISODate, type ISOInstant } from '../../shared/time';
import type { ProProfile, WaitlistEntry } from '../../shared/types';
import { ddb, isConditionalFailure, queryAll, stripKeys, table, type Item } from '../lib/dynamo';
import { env } from '../lib/env';
import { ApiError, validationError } from '../lib/http';
import { newId } from '../lib/ids';
import { proPk, WAIT_PREFIX, waitKey } from '../lib/keys';
import { log } from '../lib/logger';
import { linkSecret, signWaitlistToken, verifyWaitlistToken } from '../lib/tokens';
import { sendWaitlistJoined, sendWaitlistOffer } from '../mail/notifications';
import { sendOnce } from '../mail/sender';
import type { AppointmentItem } from './appointments';
import { getSettings, loadContext } from './availability';
import { getProfile } from './profiles';
import { getService } from './services';

/**
 * Waitlist (`PRO#<id> / WAIT#<entryId>`, TTL = last date + 1 day): a client
 * waits for a slot on 1–7 specific days. When an appointment is cancelled or
 * moved away from a day, the stream offers that day to up to 3 waiting
 * entries (FIFO) for which `computeDay` finds a slot now — at most once per
 * entry and day every 6 h, and once per (entry, day, freeing change) so
 * replays never re-email. A booking by the same client on one of the days
 * marks the entry `booked`.
 */

export const MAX_ACTIVE_PER_CLIENT = 3;
export const MAX_OFFERS_PER_EVENT = 3;
const OFFER_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const DAY_S = 86_400;

export interface WaitItem extends WaitlistEntry {
  clientKey: string;
  /** Bogotá date → last time that day was offered to this entry. */
  offeredAt: Record<ISODate, ISOInstant>;
  ttl: number;
}

export function toEntry(item: Item): WaitlistEntry {
  const w = stripKeys<WaitItem>(item);
  return {
    id: w.id, proId: w.proId, serviceId: w.serviceId, serviceName: w.serviceName, dates: w.dates, client: w.client,
    status: w.status, createdAt: w.createdAt, notifiedCount: w.notifiedCount ?? 0, lastNotifiedAt: w.lastNotifiedAt ?? null,
  };
}

/** Expiry (TTL and leave-token) = end of the last date + 1 day. */
export const entryExpiry = (dates: ISODate[]): number =>
  Math.floor(new Date(toInstant(addDays([...dates].sort().at(-1)!, 1), '00:00')).getTime() / 1000) + DAY_S;

export async function waitItems(proId: string, consistent = true): Promise<WaitItem[]> {
  return queryAll<WaitItem>({
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :p)',
    ExpressionAttributeValues: { ':pk': proPk(proId), ':p': WAIT_PREFIX },
    ConsistentRead: consistent,
  });
}

export const leaveUrl = (token: string) => `${env.siteUrl()}${SITE_PATHS.waitlistLeave}${token}`;

export async function leaveLinkFor(entry: Pick<WaitItem, 'proId' | 'id' | 'dates'>): Promise<string> {
  return leaveUrl(signWaitlistToken({ p: entry.proId, w: entry.id, e: entryExpiry(entry.dates) }, await linkSecret()));
}

/** Validated join (the handler did zod, rate limits, Turnstile and the subscription gate). */
export async function joinWaitlist(proId: string, input: JoinWaitlistRequest, serviceName: string, now: Date = new Date()): Promise<JoinWaitlistResponse> {
  const today = todayBogota(now);
  const settings = await getSettings(proId, true);
  const last = addDays(today, settings.rules.maxDaysAhead);
  const dates = [...new Set(input.dates)].sort();
  if (dates.some((d) => d < today)) throw validationError({ dates: 'Elige días de hoy en adelante' });
  if (dates.some((d) => d > last)) throw validationError({ dates: `Solo puedes elegir días hasta el ${last}` });

  const clientKey = clientKeyOf(input.client);
  const active = (await waitItems(proId)).filter((w) => w.status === 'waiting' && w.clientKey === clientKey && w.dates.some((d) => d >= today));
  if (active.length >= MAX_ACTIVE_PER_CLIENT) {
    throw new ApiError('conflict', `Ya estás en la lista de espera ${MAX_ACTIVE_PER_CLIENT} veces con esta agenda.`);
  }
  const entry: WaitItem = {
    id: newId(now), proId, serviceId: input.serviceId, serviceName, dates, client: input.client, status: 'waiting',
    createdAt: now.toISOString(), notifiedCount: 0, lastNotifiedAt: null, clientKey, offeredAt: {}, ttl: entryExpiry(dates),
  };
  await ddb.send(new PutCommand({ TableName: table(), Item: { ...waitKey(proId, entry.id), ...entry }, ConditionExpression: 'attribute_not_exists(PK)' }));
  log.info('waitlist joined', { proId, entryId: entry.id, dates: dates.length });
  return { entry: { id: entry.id, dates, serviceName } };
}

/**
 * Leave via the signed link. 404 for a bad or expired token; otherwise
 * idempotent (an entry already removed, booked or gone still answers 200).
 */
export async function leaveWaitlist(token: string, now: Date = new Date()): Promise<LeaveWaitlistResponse> {
  const verified = verifyWaitlistToken(token, await linkSecret(), now);
  if (!verified || verified.expired) throw new ApiError('not_found', 'Este enlace no es válido o ya venció.');
  const pro = await getProfile(verified.payload.p);
  if (!pro) throw new ApiError('not_found', 'Este enlace no es válido o ya venció.');
  try {
    await ddb.send(new UpdateCommand({
      TableName: table(),
      Key: waitKey(verified.payload.p, verified.payload.w),
      UpdateExpression: 'SET #st = :removed',
      ConditionExpression: '#st = :waiting',
      ExpressionAttributeNames: { '#st': 'status' },
      ExpressionAttributeValues: { ':removed': 'removed', ':waiting': 'waiting' },
    }));
  } catch (err) {
    if (!isConditionalFailure(err)) throw err;
  }
  return { pro: { slug: pro.slug, name: pro.name } };
}

/** Pro view: waiting entries with a date from today on, oldest first. */
export async function listWaitlist(proId: string, now: Date = new Date()): Promise<WaitlistEntry[]> {
  const today = todayBogota(now);
  return (await waitItems(proId))
    .filter((w) => w.status === 'waiting' && w.dates.some((d) => d >= today))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(toEntry);
}

export async function deleteWaitlistEntry(proId: string, entryId: string): Promise<void> {
  try {
    await ddb.send(new DeleteCommand({ TableName: table(), Key: waitKey(proId, entryId), ConditionExpression: 'attribute_exists(PK)' }));
  } catch (err) {
    if (isConditionalFailure(err)) throw new ApiError('not_found', 'Esa persona ya no está en la lista de espera.');
    throw err;
  }
}

/** Client deletion (Ley 1581): drop every entry of that client. */
export async function deleteWaitlistEntriesOf(proId: string, clientKey: string): Promise<void> {
  for (const w of (await waitItems(proId)).filter((x) => x.clientKey === clientKey)) {
    await ddb.send(new DeleteCommand({ TableName: table(), Key: waitKey(proId, w.id) }));
  }
}

// ── Stream ─────────────────────────────────────────────────────────────────

/** WAIT INSERT: "Te avisaremos si se libera un cupo" (once per entry). */
export async function onWaitlistJoined(entry: WaitItem, pro: ProProfile, now: Date = new Date()): Promise<void> {
  if (entry.status !== 'waiting' || !entry.client.email) return;
  await sendOnce(`wait-joined#${entry.id}`, async () => sendWaitlistJoined({ entry, pro, leaveUrl: await leaveLinkFor(entry) }), now);
}

/** A booking by a waiting client on one of their days marks the entry booked. */
export async function markBookedFor(appt: AppointmentItem, date: ISODate): Promise<number> {
  let marked = 0;
  for (const w of (await waitItems(appt.proId)).filter((x) => x.status === 'waiting' && x.clientKey === appt.clientKey && x.dates.includes(date))) {
    try {
      await ddb.send(new UpdateCommand({
        TableName: table(),
        Key: waitKey(appt.proId, w.id),
        UpdateExpression: 'SET #st = :booked',
        ConditionExpression: '#st = :waiting',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: { ':booked': 'booked', ':waiting': 'waiting' },
      }));
      marked++;
    } catch (err) {
      if (!isConditionalFailure(err)) throw err;
    }
  }
  return marked;
}

/**
 * Time was freed on `date` (cancel / move away): offer it to up to 3 waiting
 * entries (FIFO) that now have a slot for their service. `changeKey`
 * identifies the freeing change (`<apptId>#<revision>`) for idempotency.
 */
export async function offerFreedDate(pro: ProProfile, date: ISODate, changeKey: string, now: Date = new Date()): Promise<number> {
  const today = todayBogota(now);
  if (date < today) return 0;
  const candidates = (await waitItems(pro.id))
    .filter((w) => w.status === 'waiting' && w.dates.includes(date) && w.client.email)
    .filter((w) => !w.offeredAt?.[date] || now.getTime() - new Date(w.offeredAt[date]).getTime() >= OFFER_COOLDOWN_MS)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const slotsByDuration = new Map<number, string[]>();
  let offered = 0;
  for (const w of candidates) {
    if (offered >= MAX_OFFERS_PER_EVENT) break;
    const service = await getService(pro.id, w.serviceId, true);
    if (!service) continue;
    if (!slotsByDuration.has(service.durationMin)) {
      const ctx = await loadContext({ proId: pro.id, durationMin: service.durationMin, from: date, days: 1, now, consistent: true });
      slotsByDuration.set(service.durationMin, computeDay(date, ctx).slots);
    }
    const slots = slotsByDuration.get(service.durationMin)!;
    if (!slots.length) continue;

    const at = now.toISOString();
    const fresh = await sendOnce(`wait-offer#${w.id}#${date}#${changeKey}`, async () =>
      sendWaitlistOffer({ entry: w, pro, date, slots, leaveUrl: await leaveLinkFor(w) }), now, 2);
    if (!fresh) continue;
    offered++;
    await ddb.send(new UpdateCommand({
      TableName: table(),
      Key: waitKey(pro.id, w.id),
      UpdateExpression: 'SET offeredAt.#d = :at, lastNotifiedAt = :at, notifiedCount = if_not_exists(notifiedCount, :zero) + :one',
      ConditionExpression: 'attribute_exists(PK)',
      ExpressionAttributeNames: { '#d': date },
      ExpressionAttributeValues: { ':at': at, ':zero': 0, ':one': 1 },
    })).catch((err) => {
      if (!isConditionalFailure(err)) throw err;
    });
  }
  if (offered) log.info('waitlist offers sent', { proId: pro.id, date, offered });
  return offered;
}
