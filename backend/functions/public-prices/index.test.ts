import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { LANDING_DEFAULT_PRICE } from '../../../shared/landing';
import { TRIAL_DAYS } from '../../../shared/subscription';
import { priceKey } from '../../lib/keys';
import { apiEvent, parse, setTestEnv } from '../../testing/fixtures';
import { handler } from './index';

setTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddb.reset();
  ddb.on(QueryCommand).resolves({
    Items: [
      { ...priceKey('mensual-v1'), ...LANDING_DEFAULT_PRICE, id: 'mensual-v1', code: 'mensual-v1', name: 'Mensual', isDefault: false, packages: [{ months: 1, amountCop: 5900 }] },
      { ...priceKey('fundador-v1'), ...LANDING_DEFAULT_PRICE },
    ],
  });
});

describe('GET /public/prices', () => {
  it('returns the default version as the landing shows it, cacheable for a few minutes', async () => {
    const res = await handler(apiEvent('GET /public/prices'));
    expect(res.statusCode).toBe(200);
    expect(res.headers?.['cache-control']).toBe('public, max-age=300');
    const body = parse(res);
    expect(body).toMatchObject({ priceVersionId: 'fundador-v1', founder: true, fromMonthlyCop: 5000, trialDays: TRIAL_DAYS });
    expect(body.packages.map((p: { months: number }) => p.months)).toEqual([3, 6, 12]);
    expect(body.packages[2]).toEqual({ months: 12, amountCop: 50000, monthlyCop: 4167, freeMonths: 2, best: true });
  });
});
