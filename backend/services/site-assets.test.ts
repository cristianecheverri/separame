import { DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { setTestEnv } from '../testing/fixtures';
import { cleanSiteAssets } from './site-assets';

setTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);
const s3 = mockClient(S3Client);

const NOW = new Date('2026-10-23T12:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
const body = (text: string) => ({ Body: { transformToString: async () => text } }) as never;
const appList = { build: 'app-v3', files: ['app/assets/live.js'] };
const bookingList = { build: 'b-v9', files: ['b/assets/live.js'] };

const savedState = () => ddb.commandCalls(PutCommand).at(-1)?.args[0].input.Item;
const deletedKeys = () => s3.commandCalls(DeleteObjectsCommand).flatMap((c) => c.args[0].input.Delete?.Objects?.map((o) => o.Key) ?? []);

beforeEach(() => {
  ddb.reset();
  s3.reset();
  s3.on(GetObjectCommand, { Key: 'app/asset-list.json' }).resolves(body(JSON.stringify(appList)));
  s3.on(GetObjectCommand, { Key: 'b/asset-list.json' }).resolves(body(JSON.stringify(bookingList)));
  s3.on(ListObjectsV2Command, { Prefix: 'app/assets/' }).resolves({
    Contents: [
      { Key: 'app/assets/live.js', LastModified: daysAgo(40) },
      { Key: 'app/assets/prev.js', LastModified: daysAgo(40) },
      { Key: 'app/assets/ancient.js', LastModified: daysAgo(40) },
    ],
  });
  s3.on(ListObjectsV2Command, { Prefix: 'b/assets/' }).resolves({ Contents: [{ Key: 'b/assets/live.js', LastModified: daysAgo(40) }] });
  s3.on(DeleteObjectsCommand).resolves({});
  ddb.on(PutCommand).resolves({});
});

describe('cleanSiteAssets', () => {
  it('first run deletes nothing and gives every existing file the full week', async () => {
    ddb.on(GetCommand).resolves({});
    expect(await cleanSiteAssets(NOW)).toEqual({ recorded: true, deleted: 0, skipped: [] });
    expect(s3.commandCalls(DeleteObjectsCommand)).toHaveLength(0);
    expect(Object.keys(savedState()?.lastUsed ?? {})).toHaveLength(4);
  });

  it('deletes only files no live build used in the last 7 days, once a day', async () => {
    ddb.on(GetCommand).resolves({
      Item: {
        builds: { 'app/assets/': 'app-v2', 'b/assets/': 'b-v9' },
        lastUsed: { 'app/assets/prev.js': daysAgo(2).toISOString(), 'app/assets/ancient.js': daysAgo(9).toISOString() },
        checkedAt: daysAgo(0.5).toISOString(),
        cleanedAt: daysAgo(1.5).toISOString(),
      },
    });
    const outcome = await cleanSiteAssets(NOW);
    expect(outcome).toEqual({ recorded: true, deleted: 1, skipped: [] });
    expect(deletedKeys()).toEqual(['app/assets/ancient.js']);
    const state = savedState();
    expect(state?.builds).toEqual({ 'app/assets/': 'app-v3', 'b/assets/': 'b-v9' });
    expect(state?.lastUsed['app/assets/live.js']).toBe(NOW.toISOString());
    expect(state?.lastUsed['app/assets/ancient.js']).toBeUndefined();
  });

  it('does no work between daily runs when no deploy happened', async () => {
    ddb.on(GetCommand).resolves({
      Item: { builds: { 'app/assets/': 'app-v3', 'b/assets/': 'b-v9' }, lastUsed: {}, checkedAt: daysAgo(0.2).toISOString(), cleanedAt: daysAgo(0.2).toISOString() },
    });
    expect(await cleanSiteAssets(NOW)).toEqual({ recorded: false, deleted: 0, skipped: [] });
    expect(ddb.commandCalls(PutCommand)).toHaveLength(0);
    expect(s3.commandCalls(ListObjectsV2Command)).toHaveLength(0);
  });

  it('leaves a directory alone when its asset list is missing', async () => {
    s3.on(GetObjectCommand, { Key: 'app/asset-list.json' }).rejects(Object.assign(new Error('nf'), { name: 'NoSuchKey' }));
    ddb.on(GetCommand).resolves({ Item: { builds: {}, lastUsed: {}, cleanedAt: daysAgo(3).toISOString() } });
    const outcome = await cleanSiteAssets(NOW);
    expect(outcome.skipped).toEqual(['app/assets/']);
    expect(deletedKeys().some((k) => k?.startsWith('app/'))).toBe(false);
  });
});
