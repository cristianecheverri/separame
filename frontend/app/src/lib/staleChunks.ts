import { session } from './storage';

/**
 * A tab (or the installed app resumed from the background) that still runs the
 * previous deploy can ask for a lazy chunk the new service worker already
 * dropped from its cache. Old chunks stay in S3 (FrontendDeployStack never
 * prunes `app/assets/`), but if one is still missing, one automatic reload
 * picks up the new build instead of showing "Algo no salió bien".
 */

const RELOAD_KEY = 'separame:stale-chunk-reload';
/** A second failure this soon after reloading is a real error: show it instead of looping. */
const RELOAD_GUARD_MS = 30_000;

/** Chrome, Safari and Firefox messages for a failed dynamic import / module preload. */
const STALE_CHUNK_MESSAGE =
  /dynamically imported module|Importing a module script failed|Unable to preload CSS/i;

export function isStaleChunkError(error: unknown): boolean {
  return error instanceof Error && STALE_CHUNK_MESSAGE.test(error.message);
}

/** Reloads once for a stale-chunk error; false when it is another error or we just reloaded. */
export function reloadForStaleChunk(error: unknown, now: number = Date.now(), reload: () => void = () => window.location.reload()): boolean {
  if (!isStaleChunkError(error)) return false;
  const last = Number(session.get(RELOAD_KEY) ?? 0);
  if (now - last < RELOAD_GUARD_MS) return false;
  session.set(RELOAD_KEY, String(now));
  reload();
  return true;
}
