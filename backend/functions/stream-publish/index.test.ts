import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import type { DynamoDBStreamEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { SITE_PATHS } from '../../../shared/infra';
import { profileKey } from '../../lib/keys';
import { clearTemplateCache } from '../../services/publish';
import { PRO_ID, profile, service, setTestEnv } from '../../testing/fixtures';
import { handler } from './index';

setTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);
const s3 = mockClient(S3Client);
const cf = mockClient(CloudFrontClient);

const record = (oldSlug: string | null, newSlug: string | null, seq = '1') => ({
  eventID: seq,
  eventName: 'MODIFY',
  dynamodb: {
    SequenceNumber: seq,
    Keys: { PK: { S: `PRO#${PRO_ID}` }, SK: { S: 'PROFILE' } },
    ...(oldSlug ? { OldImage: marshall({ ...profile, slug: oldSlug }) } : {}),
    ...(newSlug ? { NewImage: marshall({ ...profile, slug: newSlug }) } : {}),
  },
});

beforeEach(() => {
  ddb.reset();
  s3.reset();
  cf.reset();
  clearTemplateCache();
  ddb.on(GetCommand, { Key: profileKey(PRO_ID) }).resolves({ Item: profile });
  ddb.on(QueryCommand).resolves({ Items: [{ ...service }] });
  s3.on(PutObjectCommand).resolves({});
  s3.on(DeleteObjectCommand).resolves({});
  cf.on(CreateInvalidationCommand).resolves({});
});

describe('stream-publish', () => {
  it('regenerates the page, removes the old slug and invalidates', async () => {
    s3.on(GetObjectCommand).resolves({
      Body: { transformToString: async () => `<head>${SITE_PATHS.templateHeadMarker}</head><body>${SITE_PATHS.templateDataMarker}</body>` },
    } as never);
    const res = await handler({ Records: [record('laura-perez', 'dra-laura-perez')] } as unknown as DynamoDBStreamEvent);
    expect(res.batchItemFailures).toEqual([]);
    expect(s3.commandCalls(DeleteObjectCommand)[0].args[0].input.Key).toBe('laura-perez/index.html');
    const put = s3.commandCalls(PutObjectCommand)[0].args[0].input;
    expect(put).toMatchObject({ Key: 'dra-laura-perez/index.html', ContentType: 'text/html; charset=utf-8', CacheControl: 'public, max-age=0, s-maxage=60' });
    expect(String(put.Body)).toContain('Agenda de Dra. Laura Pérez · Sepárame');
    const paths = cf.commandCalls(CreateInvalidationCommand).flatMap((c) => c.args[0].input.InvalidationBatch!.Paths!.Items!);
    expect(paths).toContain('/dra-laura-perez/index.html');
    expect(paths).toContain('/laura-perez/index.html');
  });

  it('skips (without failing) when the template is not deployed yet', async () => {
    s3.on(GetObjectCommand).rejects(Object.assign(new Error('nope'), { name: 'NoSuchKey' }));
    const res = await handler({ Records: [record('dra-laura-perez', 'dra-laura-perez')] } as unknown as DynamoDBStreamEvent);
    expect(res.batchItemFailures).toEqual([]);
    expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0);
  });
});
