import { DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ASSET_DIRS, parseAssetList, staleAssetKeys, type AssetDir, type AssetList, type StoredObject } from '../../shared/site-assets';
import { ddb, getItem, table } from '../lib/dynamo';
import { env } from '../lib/env';
import { SITE_ASSETS_KEY } from '../lib/keys';
import { log } from '../lib/logger';
import { isMissingObject } from './publish';

/**
 * Deletes hashed site assets no live build has used for a week (rules in
 * shared/site-assets.ts). Runs on every job tick but does real work rarely:
 *  - records the files of each live build when a deploy changed it, and
 *    refreshes that record once a day (so "last used" is accurate to a day);
 *  - deletes once a day, at most MAX_DELETES objects per run.
 * The first run deletes nothing: it marks every object already in the bucket
 * as used now, so files from builds it never saw get the full week too.
 * A missing or malformed asset list skips that directory entirely.
 */

const s3 = new S3Client({});

const DAY_MS = 86_400_000;
const MAX_DELETES = 1000;

interface SiteAssetsState {
  builds: Record<string, string>;
  lastUsed: Record<string, string>;
  checkedAt?: string;
  cleanedAt?: string;
}

export interface SiteAssetsOutcome {
  recorded: boolean;
  deleted: number;
  /** Directories left alone because their asset list is missing or invalid. */
  skipped: string[];
}

async function readList(dir: AssetDir): Promise<AssetList | null> {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: env.siteBucket(), Key: dir.listKey }));
    return parseAssetList((await res.Body?.transformToString('utf-8')) ?? '', dir);
  } catch (err) {
    if (isMissingObject(err)) return null;
    throw err;
  }
}

async function listObjects(prefix: string): Promise<StoredObject[]> {
  const objects: StoredObject[] = [];
  let token: string | undefined;
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: env.siteBucket(), Prefix: prefix, ContinuationToken: token }));
    for (const o of res.Contents ?? []) if (o.Key && o.LastModified) objects.push({ key: o.Key, lastModified: o.LastModified });
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return objects;
}

async function deleteKeys(keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += 1000) {
    await s3.send(new DeleteObjectsCommand({
      Bucket: env.siteBucket(),
      Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
    }));
  }
}

const olderThanADay = (iso: string | undefined, now: Date) => !iso || now.getTime() - Date.parse(iso) >= DAY_MS;

export async function cleanSiteAssets(now: Date = new Date()): Promise<SiteAssetsOutcome> {
  const nowIso = now.toISOString();
  const lists = await Promise.all(ASSET_DIRS.map(readList));
  const stored = await getItem<SiteAssetsState>(SITE_ASSETS_KEY, true);

  if (!stored) {
    const lastUsed: Record<string, string> = {};
    for (const dir of ASSET_DIRS) for (const { key } of await listObjects(dir.prefix)) lastUsed[key] = nowIso;
    await save({ builds: {}, lastUsed, cleanedAt: nowIso });
    log.info('site assets: first run, every existing asset kept for the retention window', { assets: Object.keys(lastUsed).length });
    return { recorded: true, deleted: 0, skipped: [] };
  }

  const state: SiteAssetsState = { ...stored, builds: { ...stored.builds }, lastUsed: { ...stored.lastUsed } };
  const changed = ASSET_DIRS.some((dir, i) => lists[i] && state.builds[dir.prefix] !== lists[i]!.build);
  const recorded = changed || olderThanADay(state.checkedAt, now);
  if (recorded) {
    ASSET_DIRS.forEach((dir, i) => {
      const list = lists[i];
      if (!list) return;
      state.builds[dir.prefix] = list.build;
      for (const file of list.files) state.lastUsed[file] = nowIso;
    });
    state.checkedAt = nowIso;
  }

  let deleted = 0;
  const skipped: string[] = [];
  const clean = olderThanADay(state.cleanedAt, now);
  if (clean) {
    for (const [i, dir] of ASSET_DIRS.entries()) {
      const list = lists[i];
      if (!list) {
        skipped.push(dir.prefix);
        continue;
      }
      const objects = await listObjects(dir.prefix);
      const stale = staleAssetKeys(objects, list, state.lastUsed, now).slice(0, MAX_DELETES - deleted);
      await deleteKeys(stale);
      deleted += stale.length;
      // Forget what is no longer in the bucket (deleted now or by hand).
      const remaining = new Set(objects.map((o) => o.key).filter((key) => !stale.includes(key)));
      for (const key of Object.keys(state.lastUsed)) {
        if (key.startsWith(dir.prefix) && !remaining.has(key)) delete state.lastUsed[key];
      }
    }
    state.cleanedAt = nowIso;
  }

  if (recorded || clean) await save(state);
  if (deleted) log.info('site assets: old hashed files deleted', { deleted });
  if (skipped.length) log.warn('site assets: asset list missing or invalid, directory not cleaned', { skipped });
  return { recorded, deleted, skipped };
}

async function save(state: SiteAssetsState): Promise<void> {
  await ddb.send(new PutCommand({ TableName: table(), Item: { ...SITE_ASSETS_KEY, ...state } }));
}
