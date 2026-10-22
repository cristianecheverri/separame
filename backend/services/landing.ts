import { createHash } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { PublicPricesResponse } from '../../shared/api';
import { SITE_PATHS } from '../../shared/infra';
import { landingSlotsIn, renderLandingPrices, toPublicPrices } from '../../shared/landing';
import { env } from '../lib/env';
import { log } from '../lib/logger';
import { defaultPrice } from './prices';
import { headSiteObject, invalidate, isMissingObject } from './publish';

/**
 * The landing (`/`) with real prices. frontend/booking deploys
 * `index.html` (rendered with build-time default prices) plus the same file
 * as `SITE_PATHS.landingTemplate`; this service re-renders the template's
 * price slots with the active default price version and writes it over
 * `index.html`, so crawlers and the first paint see the real prices with no
 * JavaScript.
 *
 * Runs after every admin price change and on each 10-minute job tick. The tick
 * is what heals a fresh deploy (which overwrites `index.html` with the
 * build-time defaults): the rendered page records the template ETag and a
 * hash of the prices in its S3 metadata, and two HEAD requests tell whether
 * anything changed.
 */

const s3 = new S3Client({});

const META_TEMPLATE = 'landing-template-etag';
const META_PRICES = 'landing-prices-hash';
const LANDING_PATHS = ['/', '/index.html'];

export type LandingOutcome = 'published' | 'unchanged' | 'no_template';

/** The public prices view of the active default version (also `GET /public/prices`). */
export async function publicPrices(now: Date = new Date()): Promise<PublicPricesResponse> {
  return toPublicPrices(await defaultPrice(now));
}

export const pricesHash = (prices: PublicPricesResponse): string =>
  createHash('sha256').update(JSON.stringify(prices)).digest('hex').slice(0, 16);

async function readTemplate(): Promise<string | null> {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: env.siteBucket(), Key: SITE_PATHS.landingTemplate }));
    return (await res.Body?.transformToString('utf-8')) || null;
  } catch (err) {
    if (isMissingObject(err)) return null;
    throw err;
  }
}

/** Re-renders `index.html` when the template or the prices changed (or always, with `force`). */
export async function publishLanding(options: { now?: Date; force?: boolean } = {}): Promise<LandingOutcome> {
  const prices = await publicPrices(options.now);
  const hash = pricesHash(prices);
  const [templateHead, pageHead] = await Promise.all([headSiteObject(SITE_PATHS.landingTemplate), headSiteObject(SITE_PATHS.landingPage)]);
  if (!templateHead) {
    log.warn('landing template missing; landing not rendered', { key: SITE_PATHS.landingTemplate });
    return 'no_template';
  }
  const upToDate = pageHead?.metadata[META_TEMPLATE] === templateHead.etag && pageHead.metadata[META_PRICES] === hash;
  if (upToDate && !options.force) return 'unchanged';

  const template = await readTemplate();
  if (!template || !landingSlotsIn(template).has('plans')) {
    log.warn('landing template has no price slots; landing not rendered', { key: SITE_PATHS.landingTemplate });
    return 'no_template';
  }
  await s3.send(new PutObjectCommand({
    Bucket: env.siteBucket(),
    Key: SITE_PATHS.landingPage,
    Body: renderLandingPrices(template, prices),
    ContentType: 'text/html; charset=utf-8',
    // Same as the deployed HTML shells: revalidated on every load.
    CacheControl: 'no-cache',
    Metadata: { [META_TEMPLATE]: templateHead.etag, [META_PRICES]: hash },
  }));
  await invalidate(LANDING_PATHS);
  log.info('landing published', { priceVersionId: prices.priceVersionId, hash });
  return 'published';
}

/** For request handlers: a failed landing refresh must never fail the admin's change (the next tick retries). */
export async function refreshLandingSafely(): Promise<void> {
  try {
    await publishLanding();
  } catch (err) {
    log.error('landing refresh failed; the next job tick retries', { err });
  }
}
