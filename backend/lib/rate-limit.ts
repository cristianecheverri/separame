import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { bogotaDate } from '../../shared/time';
import { ddb, isConditionalFailure, table } from './dynamo';
import { ApiError } from './http';
import { rateKey } from './keys';
import { sha256Hex } from './tokens';

/**
 * Fixed-window anti-spam counters in DynamoDB (`RATE#<scope>#<id>#<window>`)
 * that expire through TTL. One conditional `ADD` per check: atomic, no
 * read-then-write race. Ids are hashed so no email/IP sits in the table.
 */

export interface RateLimitRule {
  scope: string;
  max: number;
  /** Window length in minutes, or 'day' for the Bogotá calendar day. */
  window: number | 'day';
}

export const RATE_RULES = {
  bookingPerIp: { scope: 'book-ip', max: 5, window: 10 },
  bookingPerEmail: { scope: 'book-email', max: 5, window: 'day' },
  managePerIp: { scope: 'manage-ip', max: 20, window: 10 },
  paymentNoticePerPro: { scope: 'notice-pro', max: 5, window: 'day' },
  waitlistPerIp: { scope: 'wait-ip', max: 5, window: 10 },
  waitlistPerEmail: { scope: 'wait-email', max: 5, window: 'day' },
} satisfies Record<string, RateLimitRule>;

function windowId(rule: RateLimitRule, now: Date): { id: string; expiresAt: number } {
  if (rule.window === 'day') {
    return { id: bogotaDate(now), expiresAt: Math.floor(now.getTime() / 1000) + 2 * 86_400 };
  }
  const size = rule.window * 60_000;
  const start = Math.floor(now.getTime() / size) * size;
  return { id: String(start / 60_000), expiresAt: Math.floor((start + 2 * size) / 1000) };
}

/** Counts one hit; throws `rate_limited` once `max` hits happened in the current window. */
export async function hitRateLimit(rule: RateLimitRule, rawId: string, now: Date = new Date()): Promise<void> {
  const { id, expiresAt } = windowId(rule, now);
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: table(),
        Key: rateKey(rule.scope, sha256Hex(rawId.toLowerCase()).slice(0, 32), id),
        UpdateExpression: 'ADD #c :one SET #ttl = :ttl',
        ConditionExpression: 'attribute_not_exists(#c) OR #c < :max',
        ExpressionAttributeNames: { '#c': 'count', '#ttl': 'ttl' },
        ExpressionAttributeValues: { ':one': 1, ':max': rule.max, ':ttl': expiresAt },
      }),
    );
  } catch (err) {
    if (isConditionalFailure(err)) throw new ApiError('rate_limited');
    throw err;
  }
}
