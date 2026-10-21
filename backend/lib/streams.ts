import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { DynamoDBBatchResponse, DynamoDBRecord } from 'aws-lambda';
import type { Item } from './dynamo';
import { log } from './logger';

/**
 * DynamoDB stream helpers: typed old/new images and a sequential batch
 * runner with `reportBatchItemFailures` semantics — on the first failure it
 * stops and reports that record, so Lambda retries from there in order.
 */

type Image = Record<string, AttributeValue>;

export function images(record: DynamoDBRecord): { oldItem?: Item; newItem?: Item } {
  const ddb = record.dynamodb;
  return {
    oldItem: ddb?.OldImage ? unmarshall(ddb.OldImage as unknown as Image) : undefined,
    newItem: ddb?.NewImage ? unmarshall(ddb.NewImage as unknown as Image) : undefined,
  };
}

/** Sort key of the changed item (from Keys, so it works for REMOVE too). */
export const recordSk = (record: DynamoDBRecord): string => record.dynamodb?.Keys?.SK?.S ?? '';
export const recordPk = (record: DynamoDBRecord): string => record.dynamodb?.Keys?.PK?.S ?? '';

export async function runBatch(records: DynamoDBRecord[], handle: (record: DynamoDBRecord) => Promise<void>): Promise<DynamoDBBatchResponse> {
  for (const record of records) {
    try {
      await handle(record);
    } catch (err) {
      log.error('stream record failed', { eventId: record.eventID, sk: recordSk(record).split('#')[0], err });
      const id = record.dynamodb?.SequenceNumber;
      return { batchItemFailures: id ? [{ itemIdentifier: id }] : [] };
    }
  }
  return { batchItemFailures: [] };
}
