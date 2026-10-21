import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ownerKey, slugKey, trialKey } from '../../lib/keys';
import { trialHash } from '../../services/profiles';
import { DEFAULT_PRICE_SEEDS } from '../../services/prices';
import { apiEvent, canceledTx, parse, proClaims, setTestEnv, SUB_ID } from '../../testing/fixtures';
import { handler } from './index';

setTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);
const NOW = new Date('2026-10-20T15:00:00.000Z');
const body = { name: 'Dra. Laura Pérez', title: 'Odontóloga', city: 'Medellín', address: '', phone: null, slug: 'dra-laura-perez' };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  ddb.reset();
  ddb.on(GetCommand).resolves({});
  ddb.on(QueryCommand).resolves({ Items: DEFAULT_PRICE_SEEDS.map((p) => ({ ...p, createdAt: NOW.toISOString() })) });
  ddb.on(PutCommand).resolves({});
  ddb.on(TransactWriteCommand).resolves({});
});
afterEach(() => vi.useRealTimers());

const txItems = () => ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;

describe('POST /me/onboarding', () => {
  it('creates owner, slug, profile, trial subscription, settings and the trial marker atomically', async () => {
    const res = await handler(apiEvent('POST /me/onboarding', { claims: proClaims, body }));
    expect(res.statusCode).toBe(201);
    const items = txItems();
    expect(items).toHaveLength(6);
    expect(items[0].Put!.Item).toMatchObject(ownerKey(SUB_ID));
    expect(items[1].Put!.Item).toMatchObject(slugKey('dra-laura-perez'));
    const sub = items[3].Put!.Item!;
    expect(sub).toMatchObject({ SK: 'SUB', trialEndsAt: '2026-10-27T15:00:00.000Z', paidUntil: null, priceVersionId: 'fundador-v1', GSI1PK: 'SUBS' });
    expect(items[5].Put!.Item).toMatchObject(trialKey(trialHash('laura@correo.com')));
    expect(parse(res).subscription.state).toBe('trial');
  });

  it('does not grant a second trial to an email that already used one', async () => {
    ddb.on(GetCommand, { Key: trialKey(trialHash('laura@correo.com')) }).resolves({ Item: { proId: 'old' } });
    const res = await handler(apiEvent('POST /me/onboarding', { claims: proClaims, body }));
    expect(res.statusCode).toBe(201);
    const items = txItems();
    expect(items).toHaveLength(5);
    expect(items[3].Put!.Item!.trialEndsAt).toBe(NOW.toISOString());
    expect(parse(res).subscription.state).toBe('grace');
  });

  it('maps a taken slug to 409 slug_taken', async () => {
    ddb.on(TransactWriteCommand).rejects(canceledTx(['None', 'ConditionalCheckFailed', 'None', 'None', 'None', 'None']));
    const res = await handler(apiEvent('POST /me/onboarding', { claims: proClaims, body }));
    expect(res.statusCode).toBe(409);
    expect(parse(res).error.code).toBe('slug_taken');
  });
});

describe('GET /me', () => {
  it('returns profile null until onboarding, with the admin flag', async () => {
    const res = await handler(apiEvent('GET /me', { claims: { ...proClaims, 'cognito:groups': '[admin]' } }));
    expect(parse(res)).toEqual({ email: 'laura@correo.com', isAdmin: true, profile: null, subscription: null, publicUrl: null });
  });
});
