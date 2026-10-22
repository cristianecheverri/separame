import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderSitemap } from '../../shared/seo';
import { setTestEnv } from '../testing/fixtures';
import { publishSitemap, sitemapHash } from './sitemap';

setTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);
const s3 = mockClient(S3Client);
const cf = mockClient(CloudFrontClient);

const NOW = new Date('2026-10-22T15:00:00.000Z');

beforeEach(() => {
  ddb.reset();
  s3.reset();
  cf.reset();
  ddb.on(QueryCommand).resolves({ Items: [{ slug: 'dra-laura' }, { slug: 'barberia-el-parche' }] });
  s3.on(HeadObjectCommand).rejects(Object.assign(new Error('nf'), { name: 'NotFound' }));
  s3.on(PutObjectCommand).resolves({});
  cf.on(CreateInvalidationCommand).resolves({});
});

describe('publishSitemap', () => {
  it('lists only the agendas that can take bookings (graceUntil ≥ now)', async () => {
    await publishSitemap(NOW);
    const query = ddb.commandCalls(QueryCommand)[0].args[0].input;
    expect(query.KeyConditionExpression).toBe('#pk = :pk AND #sk >= :from');
    expect(query.ExpressionAttributeValues).toEqual({ ':pk': 'SUBS', ':from': NOW.toISOString() });
  });

  it('writes sitemap.xml with the profiles and invalidates it', async () => {
    expect(await publishSitemap(NOW)).toBe('published');
    const put = s3.commandCalls(PutObjectCommand)[0].args[0].input;
    expect(put.Key).toBe('sitemap.xml');
    expect(put.ContentType).toBe('application/xml; charset=utf-8');
    expect(put.CacheControl).toBe('no-cache');
    expect(put.Body).toContain('/barberia-el-parche</loc>');
    expect(put.Body).toContain('/dra-laura</loc>');
    expect(cf.commandCalls(CreateInvalidationCommand)[0].args[0].input.InvalidationBatch?.Paths?.Items).toEqual(['/sitemap.xml']);
  });

  it('does nothing when the published sitemap has the same content', async () => {
    const hash = sitemapHash(renderSitemap('https://dev.separame.app', ['dra-laura', 'barberia-el-parche']));
    s3.on(HeadObjectCommand).resolves({ Metadata: { 'sitemap-hash': hash } });
    expect(await publishSitemap(NOW)).toBe('unchanged');
    expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0);
    expect(cf.commandCalls(CreateInvalidationCommand)).toHaveLength(0);
  });
});
