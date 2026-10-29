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
      { ...priceKey('fundador-v2'), ...LANDING_DEFAULT_PRICE },
    ],
  });
});

describe('GET /public/prices', () => {
  it('returns the default version as the landing shows it, cacheable for a few minutes', async () => {
    const res = await handler(apiEvent('GET /public/prices'));
    expect(res.statusCode).toBe(200);
    expect(res.headers?.['cache-control']).toBe('public, max-age=300');
    const body = parse(res);
    expect(body).toMatchObject({ priceVersionId: 'fundador-v2', founder: true, fromMonthlyCop: 5000, trialDays: TRIAL_DAYS });
    expect(body.packages.map((p: { months: number }) => p.months)).toEqual([3, 6, 12, 1]);
    expect(body.packages[2]).toEqual({ months: 12, amountCop: 45000, monthlyCop: 3750, freeMonths: 3, best: true });
  });
});

describe('the prices of 29-oct-2026 on an existing table', () => {
  it('are introduced once as the default; the previous default stops being offered to new sign-ups', async () => {
    const { TransactWriteCommand } = await import('@aws-sdk/lib-dynamodb');
    const v1 = { ...priceKey('fundador-v1'), ...LANDING_DEFAULT_PRICE, id: 'fundador-v1', code: 'fundador-v1', packages: [{ months: 3, amountCop: 15000 }] };
    ddb.on(QueryCommand).resolvesOnce({ Items: [v1] }).resolves({ Items: [{ ...v1, isDefault: false }, { ...priceKey('fundador-v2'), ...LANDING_DEFAULT_PRICE }] });
    ddb.on(TransactWriteCommand).resolves({});
    const body = parse(await handler(apiEvent('GET /public/prices')));
    expect(body.priceVersionId).toBe('fundador-v2');
    const tx = ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
    expect(tx[0].Put).toMatchObject({ Item: { PK: 'PRICE', SK: 'PRICE#fundador-v2', isDefault: true }, ConditionExpression: 'attribute_not_exists(PK)' });
    expect(tx[1].Update).toMatchObject({ Key: priceKey('fundador-v1'), ExpressionAttributeValues: { ':f': false } });
  });

  it('never again once the version exists (an admin may archive it or pick another default)', async () => {
    const { TransactWriteCommand } = await import('@aws-sdk/lib-dynamodb');
    await handler(apiEvent('GET /public/prices'));
    expect(ddb.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });
});
