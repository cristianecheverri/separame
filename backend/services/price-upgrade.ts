import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, getItem, isConditionalFailure, table } from '../lib/dynamo';
import { subKey } from '../lib/keys';
import { log } from '../lib/logger';
import { listPayments } from './payments';
import { CURRENT_DEFAULT_PRICE } from './prices';
import { listSubItems } from './subscriptions';

/**
 * One-time (owner's decision, 29-oct-2026): accounts still on their free trial
 * that never paid move from the first founder version to the new one (cheaper
 * 6 and 12 months; nothing was charged, so no 30-day notice applies). Anyone
 * with a payment — or a pending «Ya pagué» notice — keeps their version. The
 * marker item makes it run once; the update is conditional on the account
 * still being unpaid on the old version.
 */
export const UPGRADE_FROM = 'fundador-v1';
const MARKER = { PK: 'ONCE', SK: 'unpaid-trials-to-fundador-v2' } as const;

export async function moveUnpaidTrials(now: Date = new Date()): Promise<number | 'already-done'> {
  if (await getItem(MARKER, true)) return 'already-done';
  let moved = 0;
  for (const sub of await listSubItems()) {
    if (sub.priceVersionId !== UPGRADE_FROM || sub.paidUntil) continue;
    if ((await listPayments(sub.proId, 1)).length > 0) continue;
    try {
      await ddb.send(new UpdateCommand({
        TableName: table(),
        Key: subKey(sub.proId),
        UpdateExpression: 'SET priceVersionId = :to',
        ConditionExpression: 'priceVersionId = :from AND (attribute_not_exists(paidUntil) OR attribute_type(paidUntil, :null))',
        ExpressionAttributeValues: { ':to': CURRENT_DEFAULT_PRICE.id, ':from': UPGRADE_FROM, ':null': 'NULL' },
      }));
      moved++;
    } catch (err) {
      // Paid or changed meanwhile: it keeps what it has.
      if (!isConditionalFailure(err)) throw err;
    }
  }
  await ddb.send(new PutCommand({ TableName: table(), Item: { ...MARKER, moved, at: now.toISOString() } }));
  log.info('unpaid trials moved to the current price', { moved, to: CURRENT_DEFAULT_PRICE.id });
  return moved;
}
