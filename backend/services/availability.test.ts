import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { PRO_ID, setTestEnv } from '../testing/fixtures';
import { addBlock, BLOCK_RETENTION_DAYS } from './availability';

setTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddb.reset();
  ddb.on(PutCommand).resolves({});
});

describe('addBlock', () => {
  it('expires the block 30 days after it ends, so availability never reads old blocks', async () => {
    const end = '2026-10-22T23:00:00.000Z';
    await addBlock(PRO_ID, { label: 'Vacaciones', start: '2026-10-20T13:00:00.000Z', end }, new Date('2026-10-19T00:00:00.000Z'));
    const item = ddb.commandCalls(PutCommand)[0].args[0].input.Item!;
    expect(item.ttl).toBe(Date.parse(end) / 1000 + BLOCK_RETENTION_DAYS * 86_400);
    expect(item).toMatchObject({ PK: `PRO#${PRO_ID}`, label: 'Vacaciones', end });
  });
});
