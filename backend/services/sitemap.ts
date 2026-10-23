import { createHash } from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SITEMAP_KEY, renderSitemap } from '../../shared/seo';
import { env } from '../lib/env';
import { log } from '../lib/logger';
import { headSiteObject, invalidate } from './publish';
import { listBookablePros } from './subscriptions';
import { listTeams } from './teams';

/**
 * `/sitemap.xml`: the landing, the legal pages and every profile page that can
 * take bookings (expired agendas drop out, so search engines aren't sent to
 * "Agenda no disponible temporalmente"); a team page and its members' pages
 * follow the owner's subscription. Re-rendered on each 10-minute job
 * tick; a hash in the object's metadata skips the write when nothing changed,
 * so a new or renamed slug shows up within ten minutes.
 */

const s3 = new S3Client({});

const META_HASH = 'sitemap-hash';

export type SitemapOutcome = 'published' | 'unchanged';

export const sitemapHash = (xml: string): string => createHash('sha256').update(xml).digest('hex').slice(0, 16);

export async function publishSitemap(now: Date = new Date()): Promise<SitemapOutcome> {
  const [pros, teams] = await Promise.all([listBookablePros(now), listTeams()]);
  const bookable = new Set(pros.map((p) => p.proId));
  const teamSlugs = teams.filter((t) => bookable.has(t.ownerId)).flatMap((t) => [t.slug, ...t.memberSlugs]);
  const xml = renderSitemap(env.siteUrl(), [...pros.map((p) => p.slug), ...teamSlugs]);
  const hash = sitemapHash(xml);
  const current = await headSiteObject(SITEMAP_KEY);
  if (current?.metadata[META_HASH] === hash) return 'unchanged';

  await s3.send(new PutObjectCommand({
    Bucket: env.siteBucket(),
    Key: SITEMAP_KEY,
    Body: xml,
    ContentType: 'application/xml; charset=utf-8',
    CacheControl: 'no-cache',
    Metadata: { [META_HASH]: hash },
  }));
  await invalidate([`/${SITEMAP_KEY}`]);
  log.info('sitemap published', { hash, urls: xml.split('<url>').length - 1 });
  return 'published';
}
