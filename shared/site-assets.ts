import { createHash } from 'node:crypto';

/**
 * Cleanup of old hashed assets in the site bucket. Deploys never prune them
 * (FrontendDeployStack): a tab or installed app still running the previous
 * build lazy-loads its own chunks. Instead, each frontend build publishes the
 * list of files it uses, and the 10-minute job (backend/services/site-assets.ts)
 * remembers when each file was last part of a live build and, once a day,
 * deletes the ones no live build has used for `ASSET_RETENTION_DAYS`.
 */

export const ASSET_RETENTION_DAYS = 7;

export interface AssetDir {
  /** Bucket prefix holding the hashed files. */
  prefix: string;
  /** Bucket key of the build's asset list. */
  listKey: string;
}

/** frontend/app deploys under `app/` (its build writes `asset-list.json`, served as `app/asset-list.json`). */
export const APP_ASSETS: AssetDir = { prefix: 'app/assets/', listKey: 'app/asset-list.json' };
/** frontend/booking deploys at the bucket root with its assets in `b/assets/`. */
export const BOOKING_ASSETS: AssetDir = { prefix: 'b/assets/', listKey: 'b/asset-list.json' };
export const ASSET_DIRS: readonly AssetDir[] = [APP_ASSETS, BOOKING_ASSETS];

/** What a build publishes: bucket keys of every hashed file it uses, plus an id for that set. */
export interface AssetList {
  build: string;
  files: string[];
}

/** Builds the list from the emitted file names (`assets/x.js` → `app/assets/x.js` with `keyPrefix: 'app/'`). */
export function assetListOf(fileNames: Iterable<string>, dir: AssetDir, keyPrefix = ''): AssetList {
  const files = [...new Set([...fileNames].map((name) => keyPrefix + name).filter((key) => key.startsWith(dir.prefix)))].sort();
  return { build: createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 16), files };
}

/** Accepts only a well-formed list whose files all live under the directory (anything else: no cleanup). */
export function parseAssetList(raw: string, dir: AssetDir): AssetList | null {
  try {
    const value = JSON.parse(raw) as Partial<AssetList>;
    if (typeof value.build !== 'string' || !Array.isArray(value.files) || value.files.length === 0) return null;
    if (!value.files.every((f) => typeof f === 'string' && f.startsWith(dir.prefix))) return null;
    return { build: value.build, files: value.files };
  } catch {
    return null;
  }
}

export interface StoredObject {
  key: string;
  lastModified: Date;
}

/**
 * Keys safe to delete: not used by the live build, not used by any build in the
 * retention window (`lastUsed`: key → ISO instant it was last part of a live
 * build) and, for files never seen in a build, uploaded before the window too.
 */
export function staleAssetKeys(
  objects: readonly StoredObject[],
  current: AssetList,
  lastUsed: Readonly<Record<string, string>>,
  now: Date,
): string[] {
  const cutoff = now.getTime() - ASSET_RETENTION_DAYS * 86_400_000;
  const live = new Set(current.files);
  return objects
    .filter(({ key, lastModified }) => {
      if (live.has(key)) return false;
      const used = lastUsed[key];
      const lastNeeded = used ? Math.max(Date.parse(used), lastModified.getTime()) : lastModified.getTime();
      return lastNeeded < cutoff;
    })
    .map(({ key }) => key);
}
