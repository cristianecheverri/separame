import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { PublicProfile } from '../../shared/api';
import { SITE_PATHS } from '../../shared/infra';
import { env } from '../lib/env';
import { log } from '../lib/logger';
import { getProfile, toPublicProfile } from './profiles';
import { listServices } from './services';

/**
 * Static profile pages: `/<slug>/index.html` in the site bucket, generated
 * from the booking template that frontend/booking deploys at
 * `SITE_PATHS.bookingTemplate`. The page carries SEO / Open Graph tags (links
 * look good on WhatsApp/Instagram) and the public profile + services as JSON,
 * so it paints without calling the API. Availability and subscription state
 * always come from the API, never from this HTML.
 */

const s3 = new S3Client({});
const cloudfront = new CloudFrontClient({});

export interface PageConfig {
  siteUrl: string;
  apiUrl: string;
  turnstileSiteKey: string;
}

let templateCache: string | null = null;

/** The booking template (cached per container); null when it isn't deployed yet. */
export async function loadTemplate(): Promise<string | null> {
  if (templateCache) return templateCache;
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: env.siteBucket(), Key: SITE_PATHS.bookingTemplate }));
    const body = (await res.Body?.transformToString('utf-8')) ?? '';
    if (!body) return null;
    templateCache = body;
    return body;
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === 'NoSuchKey' || name === 'NotFound' || name === 'AccessDenied') return null;
    throw err;
  }
}

/** Tests only. */
export function clearTemplateCache(): void {
  templateCache = null;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** JSON safe inside a <script> element: no `</script>`, no HTML comments, no JS line separators. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export const pageKey = (slug: string) => `${slug}/index.html`;
export const pagePaths = (slug: string) => [`/${slug}`, `/${slug}/`, `/${slug}/index.html`];

export function renderHead(profile: PublicProfile, cfg: PageConfig): string {
  const title = `Agenda de ${profile.name} · Sepárame`;
  const description = `${profile.title} en ${profile.city}. Separa tu cita en línea en segundos.`;
  const url = `${cfg.siteUrl}/${profile.slug}`;
  const image = `${cfg.siteUrl}/og.png`;
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const u = escapeHtml(url);
  const i = escapeHtml(image);
  return [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}">`,
    `<link rel="canonical" href="${u}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Sepárame">',
    '<meta property="og:locale" content="es_CO">',
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:url" content="${u}">`,
    `<meta property="og:image" content="${i}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${t}">`,
    `<meta name="twitter:description" content="${d}">`,
    `<meta name="twitter:image" content="${i}">`,
  ].join('\n');
}

export function renderDataScript(profile: PublicProfile, cfg: PageConfig): string {
  const data = { profile, config: { turnstileSiteKey: cfg.turnstileSiteKey, apiUrl: cfg.apiUrl } };
  return `<script type="application/json" id="${SITE_PATHS.dataScriptId}">${jsonForScript(data)}</script>`;
}

/** Replaces both markers (split/join: no `$` replacement patterns from user text). */
export function renderProfilePage(template: string, profile: PublicProfile, cfg: PageConfig): string {
  return template
    .split(SITE_PATHS.templateHeadMarker).join(renderHead(profile, cfg))
    .split(SITE_PATHS.templateDataMarker).join(renderDataScript(profile, cfg));
}

export function pageConfig(): PageConfig {
  return { siteUrl: env.siteUrl(), apiUrl: env.apiUrl(), turnstileSiteKey: env.turnstileSiteKey() ?? '' };
}

export async function invalidate(paths: string[]): Promise<void> {
  const distributionId = env.siteDistributionId();
  if (!distributionId || paths.length === 0) return;
  await cloudfront.send(new CreateInvalidationCommand({
    DistributionId: distributionId,
    InvalidationBatch: {
      CallerReference: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      Paths: { Quantity: paths.length, Items: paths },
    },
  }));
}

export type PublishOutcome = 'published' | 'no_template' | 'no_profile';

/** (Re)generates a professional's page from the current profile + services. */
export async function publishPro(proId: string): Promise<PublishOutcome> {
  const profile = await getProfile(proId, true);
  if (!profile) return 'no_profile';
  const template = await loadTemplate();
  if (!template) {
    log.warn('booking template missing; page not generated', { proId, key: SITE_PATHS.bookingTemplate });
    return 'no_template';
  }
  const services = await listServices(proId, true);
  const html = renderProfilePage(template, toPublicProfile(profile, services), pageConfig());
  await s3.send(new PutObjectCommand({
    Bucket: env.siteBucket(),
    Key: pageKey(profile.slug),
    Body: html,
    ContentType: 'text/html; charset=utf-8',
    CacheControl: 'public, max-age=0, s-maxage=60',
  }));
  await invalidate(pagePaths(profile.slug));
  log.info('profile page published', { proId, slug: profile.slug });
  return 'published';
}

/** Removes a page (slug changed or profile deleted) and purges it from the CDN. */
export async function unpublishSlug(slug: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: env.siteBucket(), Key: pageKey(slug) }));
  await invalidate(pagePaths(slug));
  log.info('profile page removed', { slug });
}
