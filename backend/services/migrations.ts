import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { CreateMigrationRequest } from '../../shared/api';
import { MIGRATION_NOTICE_DAYS } from '../../shared/subscription';
import { addDays, todayBogota } from '../../shared/time';
import type { PriceMigration } from '../../shared/types';
import type { AuthUser } from '../lib/auth';
import { ddb, isConditionalFailure, queryAll, stripKeys, table, type Item } from '../lib/dynamo';
import { ApiError, validationError } from '../lib/http';
import { newId } from '../lib/ids';
import { MIGRATION_PK, MIGRATION_PREFIX, migrationKey, subKey } from '../lib/keys';
import { log } from '../lib/logger';
import { sendMigrationNotice } from '../mail/notifications';
import { sendOnce } from '../mail/sender';
import { getPrice } from './prices';
import { listSubItems, type SubItem } from './subscriptions';

/**
 * Price migrations (`MIGRATION / MIGRATION#<id>`): move a group, a list of
 * professionals or a whole version to another price version on an effective
 * date announced at least MIGRATION_NOTICE_DAYS before. jobs-tick sends the
 * notices and applies due migrations (`priceVersionId` on matching subs).
 */

export function toMigration(item: Item): PriceMigration {
  const m = stripKeys<PriceMigration>(item);
  return {
    id: m.id, fromPriceVersionId: m.fromPriceVersionId, toPriceVersionId: m.toPriceVersionId, target: m.target,
    effectiveDate: m.effectiveDate, noticeSentAt: m.noticeSentAt ?? null, status: m.status,
    affectedCount: m.affectedCount ?? 0, createdAt: m.createdAt, createdBy: m.createdBy,
  };
}

export async function listMigrations(consistent = false): Promise<PriceMigration[]> {
  const items = await queryAll({
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :p)',
    ExpressionAttributeValues: { ':pk': MIGRATION_PK, ':p': MIGRATION_PREFIX },
    ConsistentRead: consistent,
    ScanIndexForward: false,
  });
  return items.map(toMigration);
}

export function matchesTarget(m: Pick<PriceMigration, 'fromPriceVersionId' | 'target'>, sub: Pick<SubItem, 'proId' | 'priceVersionId' | 'group'>): boolean {
  if (sub.priceVersionId !== m.fromPriceVersionId) return false;
  switch (m.target.kind) {
    case 'version': return true;
    case 'group': return sub.group === m.target.group;
    case 'pros': return m.target.proIds.includes(sub.proId);
  }
}

export async function createMigration(admin: AuthUser, input: CreateMigrationRequest, now: Date = new Date()): Promise<PriceMigration> {
  const earliest = addDays(todayBogota(now), MIGRATION_NOTICE_DAYS);
  if (input.effectiveDate < earliest) {
    throw validationError({ effectiveDate: `La fecha efectiva debe ser desde el ${earliest} (${MIGRATION_NOTICE_DAYS} días de aviso).` });
  }
  if (input.fromPriceVersionId === input.toPriceVersionId) {
    throw validationError({ toPriceVersionId: 'Elige una versión distinta a la de origen' });
  }
  const [from, to] = await Promise.all([getPrice(input.fromPriceVersionId, true), getPrice(input.toPriceVersionId, true)]);
  if (!from) throw validationError({ fromPriceVersionId: 'Esa versión no existe' });
  if (!to) throw validationError({ toPriceVersionId: 'Esa versión no existe' });
  if (to.status !== 'active') throw validationError({ toPriceVersionId: 'La versión de destino debe estar activa' });

  const affectedCount = (await listSubItems()).filter((s) => matchesTarget(input, s)).length;
  const migration: PriceMigration = {
    id: newId(now),
    fromPriceVersionId: from.id,
    toPriceVersionId: to.id,
    target: input.target,
    effectiveDate: input.effectiveDate,
    noticeSentAt: null,
    status: 'scheduled',
    affectedCount,
    createdAt: now.toISOString(),
    createdBy: { sub: admin.sub, email: admin.email },
  };
  await ddb.send(new UpdateCommand({
    TableName: table(),
    Key: migrationKey(migration.id),
    UpdateExpression: 'SET ' + Object.keys(migration).map((k) => `#${k} = :${k}`).join(', '),
    ExpressionAttributeNames: Object.fromEntries(Object.keys(migration).map((k) => [`#${k}`, k])),
    ExpressionAttributeValues: Object.fromEntries(Object.entries(migration).map(([k, v]) => [`:${k}`, v])),
  }));
  log.info('price migration scheduled', { migrationId: migration.id, affectedCount });
  return migration;
}

export async function cancelMigration(id: string): Promise<PriceMigration> {
  try {
    const res = await ddb.send(new UpdateCommand({
      TableName: table(),
      Key: migrationKey(id),
      UpdateExpression: 'SET #s = :c',
      ConditionExpression: 'attribute_exists(PK) AND #s = :scheduled',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':c': 'cancelled', ':scheduled': 'scheduled' },
      ReturnValues: 'ALL_NEW',
    }));
    return toMigration(res.Attributes ?? {});
  } catch (err) {
    if (isConditionalFailure(err)) throw new ApiError('conflict', 'Esa migración ya no está programada.');
    throw err;
  }
}

async function setMigrationFields(id: string, fields: Record<string, unknown>): Promise<void> {
  await ddb.send(new UpdateCommand({
    TableName: table(),
    Key: migrationKey(id),
    UpdateExpression: 'SET ' + Object.keys(fields).map((k) => `#${k} = :${k}`).join(', '),
    ExpressionAttributeNames: Object.fromEntries(Object.keys(fields).map((k) => [`#${k}`, k])),
    ExpressionAttributeValues: Object.fromEntries(Object.entries(fields).map(([k, v]) => [`:${k}`, v])),
  }));
}

/**
 * jobs-tick step: notices for scheduled migrations without `noticeSentAt`
 * (one idempotent email per pro), then applies the ones due today or earlier.
 * `budget` caps the emails/updates per run; unfinished work continues next tick.
 */
export async function processMigrations(now: Date, budget: number): Promise<{ notices: number; applied: number }> {
  const scheduled = (await listMigrations(true)).filter((m) => m.status === 'scheduled');
  if (!scheduled.length) return { notices: 0, applied: 0 };
  const subs = await listSubItems();
  const today = todayBogota(now);
  let notices = 0;
  let applied = 0;

  for (const m of scheduled) {
    const targets = subs.filter((s) => matchesTarget(m, s));
    if (!m.noticeSentAt) {
      const [from, to] = await Promise.all([getPrice(m.fromPriceVersionId), getPrice(m.toPriceVersionId)]);
      if (!from || !to) {
        log.error('migration references a missing price', { migrationId: m.id });
        continue;
      }
      let complete = true;
      for (const sub of targets) {
        if (notices >= budget) {
          complete = false;
          break;
        }
        const sent = await sendOnce(`migration#${m.id}#${sub.proId}`, () =>
          sendMigrationNotice({ email: sub.email, name: sub.name, effectiveDate: m.effectiveDate, from, to }), now);
        if (sent) notices++;
      }
      if (!complete) return { notices, applied };
      await setMigrationFields(m.id, { noticeSentAt: now.toISOString(), affectedCount: targets.length });
    }

    if (m.effectiveDate <= today) {
      for (const sub of targets) {
        if (applied >= budget) return { notices, applied };
        try {
          await ddb.send(new UpdateCommand({
            TableName: table(),
            Key: subKey(sub.proId),
            UpdateExpression: 'SET priceVersionId = :to, updatedAt = :u',
            ConditionExpression: 'priceVersionId = :from',
            ExpressionAttributeValues: { ':to': m.toPriceVersionId, ':from': m.fromPriceVersionId, ':u': now.toISOString() },
          }));
          applied++;
        } catch (err) {
          if (!isConditionalFailure(err)) throw err;
        }
      }
      await setMigrationFields(m.id, { status: 'applied', affectedCount: targets.length });
      log.info('price migration applied', { migrationId: m.id, count: targets.length });
    }
  }
  return { notices, applied };
}
