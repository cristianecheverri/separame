import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { profileKey, refCodeKey, slugKey, subKey } from '../../lib/keys';
import { apiEvent, parse, PRO_ID, profile, setTestEnv, subItem } from '../../testing/fixtures';
import { handler } from './index';

setTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddb.reset();
  ddb.on(GetCommand).resolves({});
  ddb.on(QueryCommand).resolves({ Items: [] });
});

describe('GET /public/referrals/{code}', () => {
  it('returns who invited you, without auth', async () => {
    ddb.on(GetCommand, { Key: refCodeKey('laura-perez') }).resolves({ Item: { proId: PRO_ID } });
    ddb.on(GetCommand, { Key: subKey(PRO_ID) }).resolves({ Item: subItem() });
    const res = await handler(apiEvent('GET /public/referrals/{code}', { path: { code: 'laura-perez' } }));
    expect(res.statusCode).toBe(200);
    expect(parse(res)).toEqual({ code: 'laura-perez', name: 'Dra. Laura Pérez', initials: 'LP' });
  });

  it('404s for unknown codes', async () => {
    const res = await handler(apiEvent('GET /public/referrals/{code}', { path: { code: 'nadie' } }));
    expect(res.statusCode).toBe(404);
    expect(parse(res).error.code).toBe('not_found');
  });
});

describe('GET /public/pros/{slug}', () => {
  it('carries each service’s price display option (legacy null → free)', async () => {
    ddb.on(GetCommand, { Key: slugKey('dra-laura-perez') }).resolves({ Item: { proId: PRO_ID } });
    ddb.on(GetCommand, { Key: profileKey(PRO_ID) }).resolves({ Item: profile });
    ddb.on(GetCommand, { Key: subKey(PRO_ID) }).resolves({ Item: subItem() });
    ddb.on(QueryCommand).resolves({
      Items: [
        { id: 's1', name: 'Valoración', durationMin: 30, priceCop: 60000, visible: true, order: 1 },
        { id: 's2', name: 'Control', durationMin: 15, priceCop: null, visible: true, order: 2 },
        { id: 's3', name: 'Urgencia', durationMin: 30, priceCop: null, priceDisplay: 'hidden', visible: true, order: 3 },
        { id: 's4', name: 'Plan', durationMin: 60, priceCop: 90000, priceDisplay: 'agreed', visible: true, order: 4 },
      ],
    });
    const res = await handler(apiEvent('GET /public/pros/{slug}', { path: { slug: 'dra-laura-perez' } }));
    const services = parse(res).profile.services as { id: string; priceCop: number | null; priceDisplay: string }[];
    expect(services.map((s) => [s.id, s.priceCop, s.priceDisplay])).toEqual([
      ['s1', 60000, 'fixed'], ['s2', null, 'free'], ['s3', null, 'hidden'], ['s4', null, 'agreed'],
    ]);
  });
});
