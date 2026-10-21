import { DeleteCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { PublicService, UpsertServiceRequest } from '../../shared/api';
import { priceDisplayOf } from '../../shared/format';
import type { Service } from '../../shared/types';
import { ddb, getItem, isConditionalFailure, queryAll, stripKeys, table, type Item } from '../lib/dynamo';
import { ApiError } from '../lib/http';
import { newId } from '../lib/ids';
import { proPk, SERVICE_PREFIX, serviceKey } from '../lib/keys';

/**
 * A professional's offerings (`PRO#<id> / SERVICE#<serviceId>`). Appointments
 * keep a snapshot of name/duration/price, so editing or deleting a service
 * never rewrites history.
 */

const MAX_SERVICES = 50;

export function toService(item: Item): Service {
  const { id, name, durationMin, priceCop, priceDisplay, description, visible, order } = stripKeys<Service>(item);
  // Items saved before the price option exist without `priceDisplay`: null/0 keeps showing "Sin costo".
  const display = priceDisplayOf({ priceCop: priceCop ?? null, priceDisplay });
  return {
    id, name, durationMin, priceCop: display === 'fixed' ? (priceCop ?? null) : null, priceDisplay: display,
    description: description ?? '', visible: visible !== false, order: order ?? 0,
  };
}

/** The static /<slug> page and the public API carry the display option, so the booking page shows it without a call. */
export const toPublicService = (s: Service): PublicService => ({
  id: s.id, name: s.name, durationMin: s.durationMin, priceCop: s.priceCop, priceDisplay: priceDisplayOf(s), description: s.description,
});

/** Stored price fields: priceCop only with `fixed` (older clients without priceDisplay: derived). */
function priceFields(input: Pick<UpsertServiceRequest, 'priceCop' | 'priceDisplay'>): Pick<Service, 'priceCop' | 'priceDisplay'> {
  const priceDisplay = priceDisplayOf(input);
  return { priceDisplay, priceCop: priceDisplay === 'fixed' ? input.priceCop : null };
}

export async function listServices(proId: string, consistent = false): Promise<Service[]> {
  const items = await queryAll({
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :p)',
    ExpressionAttributeValues: { ':pk': proPk(proId), ':p': SERVICE_PREFIX },
    ConsistentRead: consistent,
  });
  return items.map(toService).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export async function getService(proId: string, serviceId: string, consistent = false): Promise<Service | undefined> {
  const item = await getItem(serviceKey(proId, serviceId), consistent);
  return item ? toService(item) : undefined;
}

export async function requireService(proId: string, serviceId: string, opts: { visibleOnly?: boolean; consistent?: boolean } = {}): Promise<Service> {
  const service = await getService(proId, serviceId, opts.consistent ?? true);
  if (!service || (opts.visibleOnly && !service.visible)) throw new ApiError('not_found', 'Ese servicio ya no está disponible.');
  return service;
}

export async function createService(proId: string, input: UpsertServiceRequest, now: Date = new Date()): Promise<Service> {
  const existing = await listServices(proId, true);
  if (existing.length >= MAX_SERVICES) throw new ApiError('conflict', `Puedes tener máximo ${MAX_SERVICES} servicios.`);
  const service: Service = {
    id: newId(now),
    name: input.name,
    durationMin: input.durationMin,
    ...priceFields(input),
    description: input.description ?? '',
    visible: input.visible ?? true,
    order: existing.reduce((max, s) => Math.max(max, s.order), 0) + 1,
  };
  await ddb.send(new PutCommand({
    TableName: table(),
    Item: { ...serviceKey(proId, service.id), ...service, proId, createdAt: now.toISOString(), updatedAt: now.toISOString() },
  }));
  return service;
}

export async function updateService(proId: string, serviceId: string, input: UpsertServiceRequest, now: Date = new Date()): Promise<Service> {
  try {
    const res = await ddb.send(new UpdateCommand({
      TableName: table(),
      Key: serviceKey(proId, serviceId),
      UpdateExpression: 'SET #n = :n, durationMin = :d, priceCop = :p, priceDisplay = :pd, description = :desc, visible = :v, updatedAt = :u',
      ConditionExpression: 'attribute_exists(PK)',
      ExpressionAttributeNames: { '#n': 'name' },
      ExpressionAttributeValues: {
        ':n': input.name, ':d': input.durationMin, ':p': priceFields(input).priceCop, ':pd': priceFields(input).priceDisplay, ':desc': input.description ?? '',
        ':v': input.visible ?? true, ':u': now.toISOString(),
      },
      ReturnValues: 'ALL_NEW',
    }));
    return toService(res.Attributes ?? {});
  } catch (err) {
    if (isConditionalFailure(err)) throw new ApiError('not_found', 'Ese servicio no existe.');
    throw err;
  }
}

export async function deleteService(proId: string, serviceId: string): Promise<void> {
  try {
    await ddb.send(new DeleteCommand({
      TableName: table(),
      Key: serviceKey(proId, serviceId),
      ConditionExpression: 'attribute_exists(PK)',
    }));
  } catch (err) {
    if (isConditionalFailure(err)) throw new ApiError('not_found', 'Ese servicio no existe.');
    throw err;
  }
}
