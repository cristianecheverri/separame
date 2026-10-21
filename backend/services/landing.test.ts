import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { SITE_PATHS } from '../../shared/infra';
import { LANDING_DEFAULT_PRICE, toPublicPrices } from '../../shared/landing';
import { priceKey } from '../lib/keys';
import { setTestEnv } from '../testing/fixtures';
import { pricesHash, publishLanding } from './landing';
import { DEFAULT_PRICE_SEEDS } from './prices';

setTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);
const s3 = mockClient(S3Client);
const cf = mockClient(CloudFrontClient);

const template = '<p>Desde <!--price:from-->$5.000<!--/price:from--></p><div><!--price:plans--><!--/price:plans--></div>';
const priceItem = (overrides: Record<string, unknown> = {}) => ({
  ...priceKey('fundador-v1'), ...LANDING_DEFAULT_PRICE, ...overrides,
});
const body = (text: string) => ({ Body: { transformToString: async () => text } }) as never;

beforeEach(() => {
  ddb.reset();
  s3.reset();
  cf.reset();
  ddb.on(QueryCommand).resolves({ Items: [priceItem()] });
  s3.on(HeadObjectCommand, { Key: SITE_PATHS.landingTemplate }).resolves({ ETag: '"tpl-1"' });
  s3.on(HeadObjectCommand, { Key: SITE_PATHS.landingPage }).resolves({ ETag: '"page"', Metadata: {} });
  s3.on(GetObjectCommand, { Key: SITE_PATHS.landingTemplate }).resolves(body(template));
  s3.on(PutObjectCommand).resolves({});
  cf.on(CreateInvalidationCommand).resolves({});
});

describe('landing defaults', () => {
  it('match the default price seed the backend creates', () => {
    const seed = DEFAULT_PRICE_SEEDS.find((p) => p.isDefault)!;
    const { createdAt: _createdAt, ...fallback } = LANDING_DEFAULT_PRICE;
    expect(fallback).toEqual(seed);
  });
});

describe('publishLanding', () => {
  it('renders the template with the active prices over index.html and invalidates /', async () => {
    ddb.on(QueryCommand).resolves({ Items: [priceItem({ monthlyCop: 6000, packages: [{ months: 3, amountCop: 18000 }] })] });
    expect(await publishLanding()).toBe('published');
    const put = s3.commandCalls(PutObjectCommand)[0].args[0].input;
    expect(put.Key).toBe('index.html');
    expect(put.Body).toContain('Desde <!--price:from-->$6.000<!--/price:from-->');
    expect(put.Body).toContain('<div class="plan-amount">$18.000</div>');
    expect(put.CacheControl).toBe('no-cache');
    expect(put.Metadata).toEqual({ 'landing-template-etag': '"tpl-1"', 'landing-prices-hash': expect.any(String) });
    expect(cf.commandCalls(CreateInvalidationCommand)[0].args[0].input.InvalidationBatch?.Paths?.Items).toEqual(['/', '/index.html']);
  });

  it('does nothing when the template and the prices did not change', async () => {
    const hash = pricesHash(toPublicPrices(LANDING_DEFAULT_PRICE));
    s3.on(HeadObjectCommand, { Key: SITE_PATHS.landingPage })
      .resolves({ Metadata: { 'landing-template-etag': '"tpl-1"', 'landing-prices-hash': hash } });
    expect(await publishLanding()).toBe('unchanged');
    expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0);
    expect(await publishLanding({ force: true })).toBe('published');
  });

  it('re-renders after a deploy replaced the template', async () => {
    const hash = pricesHash(toPublicPrices(LANDING_DEFAULT_PRICE));
    s3.on(HeadObjectCommand, { Key: SITE_PATHS.landingPage })
      .resolves({ Metadata: { 'landing-template-etag': '"tpl-0"', 'landing-prices-hash': hash } });
    expect(await publishLanding()).toBe('published');
  });

  it('skips when the template is not deployed yet', async () => {
    s3.on(HeadObjectCommand, { Key: SITE_PATHS.landingTemplate }).rejects(Object.assign(new Error('nf'), { name: 'NotFound' }));
    expect(await publishLanding()).toBe('no_template');
    expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0);
  });
});
