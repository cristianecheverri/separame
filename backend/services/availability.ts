import { DeleteCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { AvailabilityResponse, CreateBlockRequest, PutAvailabilityRequest } from '../../shared/api';
import { AVAILABILITY_DAYS } from '../../shared/api';
import {
  computeAvailability, DEFAULT_RULES, DEFAULT_SCHEDULE, type AvailabilityContext, type Interval,
} from '../../shared/availability';
import { expandBlock } from '../../shared/blocks';
import { LSI1 } from '../../shared/infra';
import { addDays, addMinutes, toInstant, todayBogota, type ISODate, type ISOInstant } from '../../shared/time';
import type { AvailabilitySettings, Block, BookingRules, Service, WeeklySchedule } from '../../shared/types';
import { ddb, getItem, isConditionalFailure, queryAll, stripKeys, table, transactWrite, type Item } from '../lib/dynamo';
import { ApiError } from '../lib/http';
import { newId } from '../lib/ids';
import { apptStartSk, BLOCK_PREFIX, blockKey, HOLD_PREFIX, proPk, settingsKey } from '../lib/keys';

/**
 * Availability inputs (weekly schedule + rules on `SETTINGS`, `BLOCK#` items,
 * the pro's confirmed appointments and the live `HOLD#` items) loaded for a window and handed to the
 * shared `computeDay` / `computeAvailability` — the single slot implementation
 * shared with the frontends. Every load used to validate a write is consistent.
 */

/** Longest possible appointment + buffer (schema: 480 min + 120 min). */
const MAX_SPAN_MIN = 480 + 120;

export interface SettingsItem {
  schedule: WeeklySchedule;
  rules: BookingRules;
}

export const toBlock = (item: Item): Block => {
  const { id, label, start, end } = stripKeys<Block>(item);
  return { id, label, start, end };
};

/**
 * SETTINGS written before 29-oct-2026 carry the old default 10-minute margin
 * that every account got at sign-up. Those items have no `rulesVersion` and
 * read as «Sin margen»; a margin saved from Disponibilidad since then
 * (`rulesVersion` = RULES_VERSION) is kept as chosen.
 */
export const RULES_VERSION = 2;
export const LEGACY_DEFAULT_BUFFER_MIN = 10;

export function effectiveRules(item: Partial<SettingsItem & { rulesVersion: number }> | undefined): BookingRules {
  const rules = { ...DEFAULT_RULES, ...(item?.rules ?? {}) };
  const legacy = item?.rules !== undefined && item.rulesVersion !== RULES_VERSION;
  return legacy && rules.bufferMin === LEGACY_DEFAULT_BUFFER_MIN ? { ...rules, bufferMin: 0 } : rules;
}

export async function getSettings(proId: string, consistent = false): Promise<SettingsItem> {
  const item = await getItem<SettingsItem & { rulesVersion?: number }>(settingsKey(proId), consistent);
  return { schedule: item?.schedule ?? DEFAULT_SCHEDULE, rules: effectiveRules(item) };
}

export async function putSettings(proId: string, input: PutAvailabilityRequest, now: Date = new Date()): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: table(),
    Item: { ...settingsKey(proId), proId, schedule: input.schedule, rules: input.rules, rulesVersion: RULES_VERSION, updatedAt: now.toISOString() },
  }));
}

export async function listBlocks(proId: string, consistent = false): Promise<Block[]> {
  const items = await queryAll({
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :p)',
    ExpressionAttributeValues: { ':pk': proPk(proId), ':p': BLOCK_PREFIX },
    ConsistentRead: consistent,
  });
  return items.map(toBlock).sort((a, b) => a.start.localeCompare(b.start));
}

export async function getAvailabilitySettings(proId: string): Promise<AvailabilitySettings> {
  const [settings, blocks] = await Promise.all([getSettings(proId, true), listBlocks(proId, true)]);
  return { ...settings, blocks };
}

/** A block that already ended never affects availability again: DynamoDB drops it 30 days later (bounded reads). */
export const BLOCK_RETENTION_DAYS = 30;
export const blockExpiry = (end: ISOInstant): number => Math.floor(Date.parse(end) / 1000) + BLOCK_RETENTION_DAYS * 86_400;

/** One block, or one per day with `repeatUntil` (≤ MAX_DAILY_BLOCK_DAYS, so one transaction). */
export async function addBlocks(proId: string, input: CreateBlockRequest, now: Date = new Date()): Promise<Block[]> {
  const blocks: Block[] = expandBlock(input).map((b) => ({ id: newId(now), ...b }));
  const item = (block: Block) => ({ ...blockKey(proId, block.id), ...block, proId, createdAt: now.toISOString(), ttl: blockExpiry(block.end) });
  if (blocks.length === 1) {
    await ddb.send(new PutCommand({ TableName: table(), Item: item(blocks[0]) }));
  } else {
    await transactWrite(blocks.map((block) => ({ Put: { TableName: table(), Item: item(block) } })));
  }
  return blocks;
}

export async function deleteBlock(proId: string, blockId: string): Promise<void> {
  try {
    await ddb.send(new DeleteCommand({ TableName: table(), Key: blockKey(proId, blockId), ConditionExpression: 'attribute_exists(PK)' }));
  } catch (err) {
    if (isConditionalFailure(err)) throw new ApiError('not_found', 'Ese bloqueo no existe.');
    throw err;
  }
}

/** Confirmed appointments overlapping [from, to), from LSI1 (start-ordered). */
export async function busyIntervals(
  proId: string, from: ISOInstant, to: ISOInstant, opts: { consistent?: boolean; excludeId?: string } = {},
): Promise<Interval[]> {
  const items = await queryAll({
    IndexName: LSI1.name,
    KeyConditionExpression: 'PK = :pk AND #sk BETWEEN :from AND :to',
    ExpressionAttributeNames: { '#sk': LSI1.sk, '#st': 'status', '#s': 'start', '#e': 'end' },
    ExpressionAttributeValues: {
      ':pk': proPk(proId), ':from': apptStartSk(addMinutes(from, -MAX_SPAN_MIN)), ':to': apptStartSk(to), ':c': 'confirmed',
    },
    FilterExpression: '#st = :c',
    ProjectionExpression: 'id, #st, #s, #e',
    ConsistentRead: opts.consistent ?? false,
  });
  return items
    .filter((a) => a.id !== opts.excludeId && a.end > from && a.start < to)
    .map((a) => ({ start: a.start as string, end: a.end as string }));
}

/**
 * Hours visitors of the booking page are holding right now (services/holds.ts),
 * as busy intervals. Expired holds still in the table (TTL is lazy) are ignored.
 */
export async function heldIntervals(
  proId: string, now: Date, opts: { consistent?: boolean; excludeHoldId?: string } = {},
): Promise<Interval[]> {
  const items = await queryAll({
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :p)',
    FilterExpression: 'expiresAt > :now',
    ExpressionAttributeNames: { '#s': 'start', '#e': 'end' },
    ExpressionAttributeValues: { ':pk': proPk(proId), ':p': HOLD_PREFIX, ':now': now.getTime() },
    ProjectionExpression: 'holdId, #s, #e, expiresAt',
    ConsistentRead: opts.consistent ?? false,
  });
  return items
    .filter((h) => typeof h.expiresAt === 'number' && h.expiresAt > now.getTime() && h.holdId !== opts.excludeHoldId)
    .map((h) => ({ start: h.start as string, end: h.end as string }));
}

export interface ContextOptions {
  proId: string;
  durationMin: number;
  from: ISODate;
  days: number;
  now: Date;
  /** The pro books for clients: minimum notice doesn't apply. */
  ignoreMinNotice?: boolean;
  /** Rescheduling: the appointment being moved doesn't block itself. */
  excludeAppointmentId?: string;
  /** The caller's own hold doesn't block the hour it holds. */
  excludeHoldId?: string;
  consistent?: boolean;
}

export async function loadContext(opts: ContextOptions): Promise<AvailabilityContext> {
  const windowStart = toInstant(opts.from, '00:00');
  const windowEnd = toInstant(addDays(opts.from, opts.days), '00:00');
  const [settings, blocks, booked, held] = await Promise.all([
    getSettings(opts.proId, opts.consistent),
    listBlocks(opts.proId, opts.consistent),
    busyIntervals(opts.proId, windowStart, windowEnd, { consistent: opts.consistent, excludeId: opts.excludeAppointmentId }),
    heldIntervals(opts.proId, opts.now, { consistent: opts.consistent, excludeHoldId: opts.excludeHoldId }),
  ]);
  const busy = [...booked, ...held.filter((h) => h.end > windowStart && h.start < windowEnd)];
  return {
    schedule: settings.schedule,
    rules: opts.ignoreMinNotice ? { ...settings.rules, minNoticeMin: 0 } : settings.rules,
    blocks: blocks.filter((b) => b.end > windowStart && b.start < windowEnd).map(({ start, end }) => ({ start, end })),
    busy,
    durationMin: opts.durationMin,
    now: opts.now,
  };
}

/** AvailabilityResponse for a service; `active: false` → no days (expired subscription). */
export async function availabilityFor(input: {
  proId: string; service: Service; from?: ISODate; days?: number; active: boolean; now: Date; ignoreMinNotice?: boolean;
  excludeAppointmentId?: string; excludeHoldId?: string;
}): Promise<AvailabilityResponse> {
  const from = input.from ?? todayBogota(input.now);
  const days = input.days ?? AVAILABILITY_DAYS;
  if (!input.active) return { active: false, serviceId: input.service.id, from, days: [] };
  const ctx = await loadContext({
    proId: input.proId, durationMin: input.service.durationMin, from, days, now: input.now, ignoreMinNotice: input.ignoreMinNotice,
    excludeAppointmentId: input.excludeAppointmentId, excludeHoldId: input.excludeHoldId,
  });
  return { active: true, serviceId: input.service.id, from, days: computeAvailability(from, days, ctx) };
}
