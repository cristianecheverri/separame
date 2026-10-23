import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ownerKey, refCodeKey, slugKey, subKey, trialKey } from '../../lib/keys';
import { trialHash } from '../../services/profiles';
import { DEFAULT_PRICE_SEEDS } from '../../services/prices';
import { apiEvent, canceledTx, parse, proClaims, setTestEnv, SUB_ID } from '../../testing/fixtures';
import { handler } from './index';
import { TRIAL_DAYS } from '../../../shared/subscription';

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
    expect(sub).toMatchObject({ SK: 'SUB', trialEndsAt: new Date(NOW.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString(), paidUntil: null, priceVersionId: 'fundador-v1', GSI1PK: 'SUBS' });
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

  it('attributes a referral code: referredBy on the subscription + the referrer’s record, in the same transaction', async () => {
    ddb.on(GetCommand, { Key: refCodeKey('laura-perez') }).resolves({ Item: { proId: 'referrer1' } });
    ddb.on(GetCommand, { Key: subKey('referrer1') }).resolves({ Item: { proId: 'referrer1', email: 'otra@correo.com', name: 'Dra. Laura Pérez' } });
    const res = await handler(apiEvent('POST /me/onboarding', { claims: proClaims, body: { ...body, slug: 'nuevo-pro', referralCode: 'laura-perez' } }));
    expect(res.statusCode).toBe(201);
    const items = txItems();
    expect(items).toHaveLength(7);
    expect(items[3].Put!.Item).toMatchObject({ referredBy: { proId: 'referrer1', code: 'laura-perez' } });
    expect(items[6].Put!).toMatchObject({ Item: { PK: 'PRO#referrer1', state: 'registered', name: 'Dra. Laura Pérez' }, ConditionExpression: 'attribute_not_exists(PK)' });
  });

  it('ignores a referral code that belongs to the same email (no self-referrals) without failing', async () => {
    ddb.on(GetCommand, { Key: refCodeKey('laura-perez') }).resolves({ Item: { proId: 'referrer1' } });
    ddb.on(GetCommand, { Key: subKey('referrer1') }).resolves({ Item: { proId: 'referrer1', email: 'laura@correo.com', name: 'Dra. Laura Pérez' } });
    const res = await handler(apiEvent('POST /me/onboarding', { claims: proClaims, body: { ...body, referralCode: 'laura-perez' } }));
    expect(res.statusCode).toBe(201);
    expect(txItems()).toHaveLength(6);
    expect(txItems()[3].Put!.Item!.referredBy).toBeUndefined();
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
    expect(parse(res)).toEqual({ email: 'laura@correo.com', isAdmin: true, profile: null, subscription: null, publicUrl: null, team: null, teamRequest: null });
  });
});
