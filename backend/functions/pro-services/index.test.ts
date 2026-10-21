import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { ownerKey, subKey } from '../../lib/keys';
import { apiEvent, parse, PRO_ID, proClaims, setTestEnv, SUB_ID, subItem } from '../../testing/fixtures';
import { handler } from './index';

setTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);
const body = { name: 'Limpieza', durationMin: 45, priceCop: 90000, description: '', visible: true };

beforeEach(() => {
  ddb.reset();
  ddb.on(GetCommand, { Key: ownerKey(SUB_ID) }).resolves({ Item: { proId: PRO_ID } });
  ddb.on(QueryCommand).resolves({ Items: [] });
  ddb.on(PutCommand).resolves({});
});

describe('pro services', () => {
  it('creates a service while the plan is active', async () => {
    ddb.on(GetCommand, { Key: subKey(PRO_ID) }).resolves({ Item: subItem({ trialEndsAt: new Date(Date.now() + 86_400_000).toISOString() }) });
    const res = await handler(apiEvent('POST /me/services', { claims: proClaims, body }));
    expect(res.statusCode).toBe(201);
    expect(parse(res).service).toMatchObject({ name: 'Limpieza', durationMin: 45, order: 1 });
  });

  it('is read-only once the subscription expired', async () => {
    ddb.on(GetCommand, { Key: subKey(PRO_ID) }).resolves({ Item: subItem({ trialEndsAt: '2020-01-01T00:00:00.000Z' }) });
    const res = await handler(apiEvent('POST /me/services', { claims: proClaims, body }));
    expect(res.statusCode).toBe(403);
    expect(parse(res).error.code).toBe('read_only');
    expect(ddb.commandCalls(PutCommand)).toHaveLength(0);
  });

  it('asks for onboarding when the user has no profile', async () => {
    ddb.on(GetCommand, { Key: ownerKey(SUB_ID) }).resolves({});
    const res = await handler(apiEvent('GET /me/services', { claims: proClaims }));
    expect(res.statusCode).toBe(409);
    expect(parse(res).error.code).toBe('needs_onboarding');
  });
});
