import { PutCommand } from '@aws-sdk/lib-dynamodb';
import type { CreatePriceRequest, PriceWithUsage, UpdatePriceRequest } from '../../shared/api';
import type { PricePackage, PriceVersion } from '../../shared/types';
import {
  ddb, getItem, isConditionalFailure, queryAll, stripKeys, table, transactWrite, type Item, type TransactItem,
} from '../lib/dynamo';
import { ApiError, validationError } from '../lib/http';
import { PRICE_PK, PRICE_PREFIX, priceKey } from '../lib/keys';
import { listSubItems } from './subscriptions';

/**
 * Price versions (`PRICE / PRICE#<id>`), managed by the admin. A version's
 * amounts never change once a subscription uses it: changing a price means
 * creating a new version and (optionally) migrating people to it. The id is
 * the version's stable code (`fundador-v1`).
 */

export const DEFAULT_PRICE_SEEDS: Omit<PriceVersion, 'createdAt'>[] = [
  {
    id: 'fundador-v1',
    code: 'fundador-v1',
    name: 'Fundador',
    currency: 'COP',
    monthlyCop: 5000,
    packages: [
      { months: 3, amountCop: 15000 },
      { months: 6, amountCop: 30000 },
      { months: 12, amountCop: 50000 },
    ],
    status: 'active',
    isDefault: true,
  },
  {
    id: 'mensual-v1',
    code: 'mensual-v1',
    name: 'Mensual',
    currency: 'COP',
    monthlyCop: 5900,
    packages: [{ months: 1, amountCop: 5900 }],
    status: 'active',
    isDefault: false,
  },
];

export function toPrice(item: Item): PriceVersion {
  const { id, code, name, currency, monthlyCop, packages, status, isDefault, createdAt } = stripKeys<PriceVersion>(item);
  return { id, code, name, currency, monthlyCop: monthlyCop ?? null, packages: packages ?? [], status, isDefault: !!isDefault, createdAt };
}

export async function listPrices(consistent = false): Promise<PriceVersion[]> {
  const items = await queryAll({
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :p)',
    ExpressionAttributeValues: { ':pk': PRICE_PK, ':p': PRICE_PREFIX },
    ConsistentRead: consistent,
  });
  return items.map(toPrice).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** Seeds the default versions on a fresh table (idempotent: conditional puts). */
export async function ensureDefaultPrices(now: Date = new Date()): Promise<PriceVersion[]> {
  const existing = await listPrices(true);
  if (existing.length > 0) return existing;
  const createdAt = now.toISOString();
  for (const seed of DEFAULT_PRICE_SEEDS) {
    try {
      await ddb.send(new PutCommand({
        TableName: table(),
        Item: { ...priceKey(seed.id), ...seed, createdAt },
        ConditionExpression: 'attribute_not_exists(PK)',
      }));
    } catch (err) {
      if (!isConditionalFailure(err)) throw err;
    }
  }
  return listPrices(true);
}

export function pickDefault(prices: PriceVersion[]): PriceVersion {
  const price = prices.find((p) => p.isDefault && p.status === 'active') ?? prices.find((p) => p.status === 'active');
  if (!price) throw new Error('No active price version');
  return price;
}

export async function defaultPrice(now: Date = new Date()): Promise<PriceVersion> {
  return pickDefault(await ensureDefaultPrices(now));
}

export async function getPrice(priceId: string, consistent = false): Promise<PriceVersion | undefined> {
  const item = await getItem(priceKey(priceId), consistent);
  return item ? toPrice(item) : undefined;
}

export async function requirePrice(priceId: string): Promise<PriceVersion> {
  const price = (await getPrice(priceId)) ?? (await ensureDefaultPrices()).find((p) => p.id === priceId);
  if (!price) throw new ApiError('not_found', 'No encontramos esa versión de precio.');
  return price;
}

export const findPackage = (price: PriceVersion, months: number): PricePackage | undefined =>
  price.packages.find((p) => p.months === months);

// ── Admin ──────────────────────────────────────────────────────────────────

export async function usageCounts(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const sub of await listSubItems()) counts.set(sub.priceVersionId, (counts.get(sub.priceVersionId) ?? 0) + 1);
  return counts;
}

export async function listPricesWithUsage(): Promise<PriceWithUsage[]> {
  const [prices, counts] = await Promise.all([ensureDefaultPrices(), usageCounts()]);
  return prices.map((p) => ({ ...p, subscriptions: counts.get(p.id) ?? 0 }));
}

/** Clears `isDefault` on every other version, in the same transaction as the new default. */
function clearOtherDefaults(prices: PriceVersion[], keepId: string): TransactItem[] {
  return prices
    .filter((p) => p.isDefault && p.id !== keepId)
    .map((p) => ({
      Update: {
        TableName: table(),
        Key: priceKey(p.id),
        UpdateExpression: 'SET isDefault = :f',
        ExpressionAttributeValues: { ':f': false },
      },
    }));
}

export async function createPrice(input: CreatePriceRequest, now: Date = new Date()): Promise<PriceVersion> {
  if (input.isDefault && input.status !== 'active') {
    throw validationError({ isDefault: 'Solo una versión activa puede ser la de por defecto' });
  }
  const months = input.packages.map((p) => p.months);
  if (new Set(months).size !== months.length) throw validationError({ packages: 'Hay paquetes repetidos' });

  const prices = await ensureDefaultPrices(now);
  const price: PriceVersion = {
    id: input.code,
    code: input.code,
    name: input.name,
    currency: 'COP',
    monthlyCop: input.monthlyCop,
    packages: [...input.packages].sort((a, b) => a.months - b.months),
    status: input.status,
    isDefault: input.isDefault,
    createdAt: now.toISOString(),
  };
  try {
    await transactWrite([
      { Put: { TableName: table(), Item: { ...priceKey(price.id), ...price }, ConditionExpression: 'attribute_not_exists(PK)' } },
      ...(price.isDefault ? clearOtherDefaults(prices, price.id) : []),
    ]);
  } catch (err) {
    if (prices.some((p) => p.id === price.id)) throw validationError({ code: 'Ese código ya existe' });
    throw err;
  }
  return price;
}

export async function updatePrice(priceId: string, patch: UpdatePriceRequest): Promise<PriceVersion> {
  const prices = await ensureDefaultPrices();
  const current = prices.find((p) => p.id === priceId);
  if (!current) throw new ApiError('not_found', 'No encontramos esa versión de precio.');

  const status = patch.status ?? current.status;
  const isDefault = patch.isDefault ?? current.isDefault;
  if (isDefault && status !== 'active') {
    throw validationError({ status: 'La versión por defecto debe estar activa. Elige otra por defecto primero.' });
  }
  if (current.isDefault && !isDefault) {
    throw validationError({ isDefault: 'Siempre debe haber una versión por defecto. Marca otra como por defecto.' });
  }
  if (status === 'draft' && current.status !== 'draft' && ((await usageCounts()).get(priceId) ?? 0) > 0) {
    throw validationError({ status: 'Esta versión ya tiene suscripciones; desactívala en lugar de volverla borrador.' });
  }

  await transactWrite([
    {
      Update: {
        TableName: table(),
        Key: priceKey(priceId),
        UpdateExpression: 'SET #s = :s, isDefault = :d',
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':s': status, ':d': isDefault },
      },
    },
    ...(isDefault && !current.isDefault ? clearOtherDefaults(prices, priceId) : []),
  ]);
  return { ...current, status, isDefault };
}

