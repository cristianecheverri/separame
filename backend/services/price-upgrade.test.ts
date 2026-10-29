import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { conditionalFailure, setTestEnv } from '../testing/fixtures';
import { moveUnpaidTrials } from './price-upgrade';

setTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);
const sub = (proId: string, extra: Record<string, unknown> = {}) => ({ proId, priceVersionId: 'fundador-v1', paidUntil: null, trialEndsAt: '2026-11-05T00:00:00.000Z', ...extra });
const payQuery = (proId: string) => ({ ExpressionAttributeValues: { ':pk': `PRO#${proId}`, ':p': 'PAY#' } });

beforeEach(() => {
  ddb.reset();
  ddb.on(GetCommand).resolves({});
  ddb.on(QueryCommand).resolves({ Items: [] });
  ddb.on(UpdateCommand).resolves({});
  ddb.on(PutCommand).resolves({});
});

describe('moveUnpaidTrials', () => {
  it('moves only unpaid trials on the first founder version, then leaves a marker', async () => {
    ddb.on(QueryCommand, { IndexName: 'gsi1' }).resolves({
      Items: [sub('trial'), sub('paid', { paidUntil: '2027-01-01T00:00:00.000Z' }), sub('noticed'), sub('other', { priceVersionId: 'mensual-v1' })],
    });
    ddb.on(QueryCommand, payQuery('noticed')).resolves({ Items: [{ id: 'p1', status: 'pending', source: 'pro_notice' }] });
    expect(await moveUnpaidTrials(new Date('2026-10-29T20:00:00.000Z'))).toBe(1);
    const updates = ddb.commandCalls(UpdateCommand).map((c) => c.args[0].input);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ Key: { PK: 'PRO#trial', SK: 'SUB' }, ExpressionAttributeValues: { ':to': 'fundador-v2', ':from': 'fundador-v1' } });
    expect(ddb.commandCalls(PutCommand)[0].args[0].input.Item).toMatchObject({ PK: 'ONCE', SK: 'unpaid-trials-to-fundador-v2', moved: 1 });
  });

  it('a payment arriving meanwhile wins (conditional update), and it never runs twice', async () => {
    ddb.on(QueryCommand, { IndexName: 'gsi1' }).resolves({ Items: [sub('trial')] });
    ddb.on(UpdateCommand).rejects(conditionalFailure());
    expect(await moveUnpaidTrials()).toBe(0);
    ddb.on(GetCommand, { Key: { PK: 'ONCE', SK: 'unpaid-trials-to-fundador-v2' } }).resolves({ Item: { moved: 0 } });
    expect(await moveUnpaidTrials()).toBe('already-done');
  });
});
