import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand,
  type QueryCommandInput, type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { env } from './env';

/**
 * Shared DynamoDB document client. The AWS SDK v3 is provided by the Lambda
 * runtime (marked external at bundle time), so this adds no bundle weight.
 * Created once per container, outside any handler.
 */
const client = new DynamoDBClient({});
export const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export const table = (): string => env.tableName();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Item = Record<string, any>;
export type Key = { PK: string; SK: string };
export type TransactItem = NonNullable<TransactWriteCommandInput['TransactItems']>[number];

/** DynamoDB caps a transaction at 100 operations. */
export const MAX_TRANSACT_ITEMS = 100;

export async function getItem<T = Item>(key: Key, consistent = false): Promise<T | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: table(), Key: key, ConsistentRead: consistent }));
  return res.Item as T | undefined;
}

/** Runs a query to completion (follows LastEvaluatedKey), up to `max` items. */
export async function queryAll<T = Item>(input: Omit<QueryCommandInput, 'TableName'>, max = 5000): Promise<T[]> {
  const items: T[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(new QueryCommand({ TableName: table(), ...input, ExclusiveStartKey: startKey }));
    items.push(...((res.Items ?? []) as T[]));
    startKey = res.LastEvaluatedKey;
  } while (startKey && items.length < max);
  return items.slice(0, max);
}

export async function transactWrite(items: TransactItem[]): Promise<void> {
  await ddb.send(new TransactWriteCommand({ TransactItems: items }));
}

export function isConditionalFailure(err: unknown): boolean {
  return (err as { name?: string })?.name === 'ConditionalCheckFailedException';
}

export function isTransactionCanceled(err: unknown): boolean {
  return (err as { name?: string })?.name === 'TransactionCanceledException';
}

/**
 * Per-operation cancellation codes of a canceled transaction, in the same order
 * as `TransactItems` (`'None'` for the ones that were fine). Empty when the
 * error isn't a transaction cancellation or carries no reasons.
 */
export function cancellationCodes(err: unknown): string[] {
  if (!isTransactionCanceled(err)) return [];
  const reasons = (err as { CancellationReasons?: { Code?: string }[] }).CancellationReasons;
  if (reasons?.length) return reasons.map((r) => r.Code ?? 'None');
  // Some SDK versions only put the codes in the message: "... [ConditionalCheckFailed, None]".
  const match = /\[([^\]]+)\]/.exec((err as Error).message ?? '');
  return match ? match[1].split(',').map((s) => s.trim()) : [];
}

/** Did the transaction fail because a condition did not hold (vs. throttling / conflicts)? */
export function failedOnCondition(err: unknown): boolean {
  return cancellationCodes(err).includes('ConditionalCheckFailed');
}

/** Index (in TransactItems) of the first failed condition, or -1. */
export function failedConditionIndex(err: unknown): number {
  return cancellationCodes(err).indexOf('ConditionalCheckFailed');
}

/** Strips the table's key/index attributes before returning an item to a client. */
const INTERNAL_ATTRIBUTES = ['PK', 'SK', 'GSI1PK', 'GSI1SK', 'GSI2PK', 'GSI2SK', 'LSI1SK', 'ttl'];
export function stripKeys<T>(item: Item): T {
  const copy = { ...item };
  for (const k of INTERNAL_ATTRIBUTES) delete copy[k];
  return copy as T;
}

/** Epoch seconds `days` from now, for the `ttl` attribute of ephemeral items. */
export const ttlInDays = (days: number, now: Date = new Date()): number =>
  Math.floor(now.getTime() / 1000) + Math.round(days * 86_400);
