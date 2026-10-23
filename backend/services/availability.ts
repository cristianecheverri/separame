import { DeleteCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { AvailabilityResponse, CreateBlockRequest, PutAvailabilityRequest } from '../../shared/api';
import { AVAILABILITY_DAYS } from '../../shared/api';
import {
  computeAvailability, DEFAULT_RULES, DEFAULT_SCHEDULE, type AvailabilityContext, type Interval,
} from '../../shared/availability';
import { LSI1 } from '../../shared/infra';
import { addDays, addMinutes, toInstant, todayBogota, type ISODate, type ISOInstant } from '../../shared/time';
import type { AvailabilitySettings, Block, BookingRules, Service, WeeklySchedule } from '../../shared/types';
import { ddb, getItem, isConditionalFailure, queryAll, stripKeys, table, type Item } from '../lib/dynamo';
import { ApiError } from '../lib/http';
import { newId } from '../lib/ids';
import { apptStartSk, BLOCK_PREFIX, blockKey, proPk, settingsKey } from '../lib/keys';

/**
 * Availability inputs (weekly schedule + rules on `SETTINGS`, `BLOCK#` items
 * and the pro's confirmed appointments) loaded for a window and handed to the
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

export async function getSettings(proId: string, consistent = false): Promise<SettingsItem> {
  const item = await getItem<SettingsItem>(settingsKey(proId), consistent);
  return { schedule: item?.schedule ?? DEFAULT_SCHEDULE, rules: { ...DEFAULT_RULES, ...(item?.rules ?? {}) } };
}

export async function putSettings(proId: string, input: PutAvailabilityRequest, now: Date = new Date()): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: table(),
    Item: { ...settingsKey(proId), proId, schedule: input.schedule, rules: input.rules, updatedAt: now.toISOString() },
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

export async function addBlock(proId: string, input: CreateBlockRequest, now: Date = new Date()): Promise<Block> {
  const block: Block = {
    id: newId(now),
    label: input.label,
    start: new Date(input.start).toISOString(),
    end: new Date(input.end).toISOString(),
  };
  await ddb.send(new PutCommand({
    TableName: table(),
    Item: { ...blockKey(proId, block.id), ...block, proId, createdAt: now.toISOString(), ttl: blockExpiry(block.end) },
  }));
  return block;
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
  consistent?: boolean;
}

export async function loadContext(opts: ContextOptions): Promise<AvailabilityContext> {
  const windowStart = toInstant(opts.from, '00:00');
  const windowEnd = toInstant(addDays(opts.from, opts.days), '00:00');
  const [settings, blocks, busy] = await Promise.all([
    getSettings(opts.proId, opts.consistent),
    listBlocks(opts.proId, opts.consistent),
    busyIntervals(opts.proId, windowStart, windowEnd, { consistent: opts.consistent, excludeId: opts.excludeAppointmentId }),
  ]);
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
  excludeAppointmentId?: string;
}): Promise<AvailabilityResponse> {
  const from = input.from ?? todayBogota(input.now);
  const days = input.days ?? AVAILABILITY_DAYS;
  if (!input.active) return { active: false, serviceId: input.service.id, from, days: [] };
  const ctx = await loadContext({
    proId: input.proId, durationMin: input.service.durationMin, from, days, now: input.now, ignoreMinNotice: input.ignoreMinNotice,
    excludeAppointmentId: input.excludeAppointmentId,
  });
  return { active: true, serviceId: input.service.id, from, days: computeAvailability(from, days, ctx) };
}
