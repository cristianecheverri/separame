import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { ownerKey, subKey } from '../../lib/keys';
import { apiEvent, parse, PRO_ID, proClaims, setTestEnv, SUB_ID, subItem } from '../../testing/fixtures';
import { handler } from './index';

setTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddb.reset();
  ddb.on(GetCommand).resolves({});
  ddb.on(GetCommand, { Key: ownerKey(SUB_ID) }).resolves({ Item: { proId: PRO_ID } });
  ddb.on(QueryCommand).resolves({ Items: [] });
  ddb.on(TransactWriteCommand).resolves({});
});

describe('GET /me/referrals', () => {
  it('creates the code on first use and returns the link with the counters', async () => {
    ddb.on(GetCommand, { Key: subKey(PRO_ID) }).resolves({ Item: subItem() });
    const res = await handler(apiEvent('GET /me/referrals', { claims: proClaims }));
    expect(res.statusCode).toBe(200);
    expect(parse(res)).toEqual({
      code: 'laura-perez', url: 'https://dev.separame.app/r/laura-perez', monthsEarned: 0, monthsApplied: 0, monthsPending: 0, referrals: [],
    });
    expect(ddb.commandCalls(TransactWriteCommand)).toHaveLength(1);
  });

  it('requires a signed-in professional', async () => {
    const res = await handler(apiEvent('GET /me/referrals'));
    expect(res.statusCode).toBe(401);
  });
});
