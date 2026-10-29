import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import type { HoldSlotResponse } from '../../shared/api';
import { HOLD_MINUTES } from '../../shared/api';
import { isSlotBookable, lockUnits } from '../../shared/availability';
import { addMinutes, bogotaDate, type ISOInstant } from '../../shared/time';
import type { Service } from '../../shared/types';
import { cancellationCodes, ddb, getItem, isConditionalFailure, MAX_TRANSACT_ITEMS, table, transactWrite, type TransactItem } from '../lib/dynamo';
import { ApiError } from '../lib/http';
import { holdKey, lockKey } from '../lib/keys';
import { log } from '../lib/logger';
import { LOCK_FREE, lockDiff, lockFreeValues, withStaleTailRetry } from './appointments';
import { loadContext } from './availability';

/**
 * Holds: the booking page holds the hour a visitor picks for HOLD_MINUTES, so
 * nobody else can book it while they type their details (and holds it again
 * on every "Siguiente", which also re-checks it).
 *
 * One transaction writes the `HOLD#<holdId>` item (what availability reads:
 * the hour is busy for everyone else) and takes the hour's lock units — the
 * same `LOCK#` items appointments use, marked with `holdId` + `holdExpiresAt`
 * instead of `apptId` — so a hold and a booking (or two holds) can never
 * overlap. An expired hold frees its units by itself (see `LOCK_FREE`); the
 * booking with the same `holdId` takes them over. A new hold with the same id
 * replaces the old one and frees the units it no longer covers.
 */

export const HOLD_MS = HOLD_MINUTES * 60_000;
/** Holds are useless right after they expire; TTL is lazy anyway and every reader checks `expiresAt`. */
const HOLD_TTL_GRACE_S = 3600;

export interface HoldItem {
  holdId: string;
  proId: string;
  serviceId: string;
  start: ISOInstant;
  end: ISOInstant;
  durationMin: number;
  bufferMin: number;
  /** Epoch ms. */
  expiresAt: number;
}

const unitsOf = (hold: Pick<HoldItem, 'start' | 'durationMin' | 'bufferMin'>) => lockUnits(hold.start, hold.durationMin, hold.bufferMin);

/** Frees the units of a replaced hold that are still ours (best effort: they expire anyway). */
async function releaseUnits(proId: string, holdId: string, units: ISOInstant[]): Promise<void> {
  const results = await Promise.allSettled(units.map((unit) => ddb.send(new DeleteCommand({
    TableName: table(),
    Key: lockKey(proId, unit),
    ConditionExpression: 'holdId = :hold',
    ExpressionAttributeValues: { ':hold': holdId },
  }))));
  const failed = results.filter((r) => r.status === 'rejected' && !isConditionalFailure(r.reason));
  if (failed.length) log.warn('hold release failed', { proId, holdId, failed: failed.length });
}

/**
 * The visitor moved on to another professional (team page): their hold here
 * is freed at once instead of blocking the hour until it expires. Only the
 * holder knows the id; unknown or already-gone holds are a no-op.
 */
export async function releaseHold(proId: string, holdId: string): Promise<void> {
  const hold = await getItem<HoldItem>(holdKey(proId, holdId), true);
  if (!hold) return;
  await ddb.send(new DeleteCommand({ TableName: table(), Key: holdKey(proId, holdId) }));
  await releaseUnits(proId, holdId, unitsOf(hold));
  log.info('hold released', { proId, holdId });
}

export async function placeHold(input: {
  proId: string; service: Service; start: ISOInstant; holdId: string; now: Date;
}): Promise<HoldSlotResponse> {
  const { proId, service, holdId, now } = input;
  const start = new Date(input.start).toISOString();
  const [previous, ctx] = await Promise.all([
    getItem<HoldItem>(holdKey(proId, holdId), true),
    loadContext({ proId, durationMin: service.durationMin, from: bogotaDate(start), days: 1, now, excludeHoldId: holdId, consistent: true }),
  ]);
  if (!isSlotBookable(start, ctx)) throw new ApiError('slot_taken');

  const hold: HoldItem = {
    holdId, proId, serviceId: service.id, start, end: addMinutes(start, service.durationMin),
    durationMin: service.durationMin, bufferMin: ctx.rules.bufferMin, expiresAt: now.getTime() + HOLD_MS,
  };
  const units = unitsOf(hold);
  const { release } = lockDiff(previous ? unitsOf(previous) : [], units);
  // Very long services don't fit in one transaction: no hold (the booking itself still can't double-book).
  if (units.length + 1 > MAX_TRANSACT_ITEMS) {
    if (previous) await ddb.send(new DeleteCommand({ TableName: table(), Key: holdKey(proId, holdId) }));
    await releaseUnits(proId, holdId, release);
    return { expiresAt: null };
  }

  const ttl = Math.floor(hold.expiresAt / 1000) + HOLD_TTL_GRACE_S;
  const free = lockFreeValues(now, holdId);
  const ops: TransactItem[] = [
    { Put: { TableName: table(), Item: { ...holdKey(proId, holdId), ...hold, ttl } } },
    ...units.map((unit): TransactItem => ({
      Put: {
        TableName: table(),
        Item: { ...lockKey(proId, unit), holdId, proId, at: unit, holdExpiresAt: hold.expiresAt, ttl },
        ConditionExpression: LOCK_FREE,
        ExpressionAttributeValues: free,
      },
    })),
  ];
  await withStaleTailRetry(proId, units, hold.bufferMin, async () => {
    try {
      await transactWrite(ops);
    } catch (err) {
      // A unit is booked or held by someone else (or a concurrent transaction is taking it).
      if (cancellationCodes(err).length) throw new ApiError('slot_taken');
      throw err;
    }
  });
  await releaseUnits(proId, holdId, release);
  log.info('slot held', { proId, holdId, start });
  return { expiresAt: new Date(hold.expiresAt).toISOString() };
}
