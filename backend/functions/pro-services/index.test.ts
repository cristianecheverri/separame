import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
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

  it('stores the price display option (value only with "Valor fijo"; older clients derive it)', async () => {
    ddb.on(GetCommand, { Key: subKey(PRO_ID) }).resolves({ Item: subItem({ trialEndsAt: new Date(Date.now() + 86_400_000).toISOString() }) });
    const legacy = await handler(apiEvent('POST /me/services', { claims: proClaims, body }));
    expect(parse(legacy).service).toMatchObject({ priceCop: 90000, priceDisplay: 'fixed' });
    const agreed = await handler(apiEvent('POST /me/services', { claims: proClaims, body: { ...body, priceDisplay: 'agreed' } }));
    expect(parse(agreed).service).toMatchObject({ priceCop: null, priceDisplay: 'agreed' });
    expect(ddb.commandCalls(PutCommand).at(-1)!.args[0].input.Item).toMatchObject({ priceCop: null, priceDisplay: 'agreed' });

    ddb.on(UpdateCommand).resolves({ Attributes: { id: 's1', name: 'Limpieza', durationMin: 45, priceCop: null, priceDisplay: 'hidden', visible: true, order: 1 } });
    const hidden = await handler(apiEvent('PUT /me/services/{serviceId}', { claims: proClaims, path: { serviceId: 's1' }, body: { ...body, priceDisplay: 'hidden' } }));
    expect(parse(hidden).service).toMatchObject({ priceCop: null, priceDisplay: 'hidden' });
    expect(ddb.commandCalls(UpdateCommand)[0].args[0].input.ExpressionAttributeValues).toMatchObject({ ':p': null, ':pd': 'hidden' });

    const missing = await handler(apiEvent('POST /me/services', { claims: proClaims, body: { ...body, priceCop: null, priceDisplay: 'fixed' } }));
    expect(missing.statusCode).toBe(400);
    expect(parse(missing).error.fields).toEqual({ priceCop: 'Escribe el valor de referencia' });
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
