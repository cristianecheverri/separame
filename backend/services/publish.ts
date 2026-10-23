import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { PublicProfile, PublicTeam } from '../../shared/api';
import { initials } from '../../shared/format';
import { SITE_PATHS } from '../../shared/infra';
import { env } from '../lib/env';
import { log } from '../lib/logger';
import { getProfile, toPublicProfile } from './profiles';
import { listServices } from './services';
import { ownerIdOf } from './subscriptions';
import { getTeamItem } from './teams';

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

/** Missing key (without s3:ListBucket S3 answers AccessDenied for it). */
export const isMissingObject = (err: unknown): boolean => {
  const name = (err as { name?: string }).name;
  return name === 'NoSuchKey' || name === 'NotFound' || name === 'AccessDenied';
};

/** ETag + user metadata of a site bucket object; null when it doesn't exist. */
export async function headSiteObject(key: string): Promise<{ etag: string; metadata: Record<string, string> } | null> {
  try {
    const res = await s3.send(new HeadObjectCommand({ Bucket: env.siteBucket(), Key: key }));
    return { etag: res.ETag ?? '', metadata: res.Metadata ?? {} };
  } catch (err) {
    if (isMissingObject(err)) return null;
    throw err;
  }
}

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
    if (isMissingObject(err)) return null;
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

export function renderHead(
  profile: Pick<PublicProfile, 'slug' | 'name' | 'title' | 'city'>,
  cfg: PageConfig,
  description = `${profile.title} en ${profile.city}. Separa tu cita en línea en segundos.`,
): string {
  const title = `Agenda de ${profile.name} · Sepárame`;
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

/** A profile page embeds `profile`; a team page (/<teamSlug>) embeds `team` instead. */
export type PageData = { profile: PublicProfile } | { team: PublicTeam };

export function renderDataScript(page: PageData, cfg: PageConfig): string {
  const data = { ...page, config: { turnstileSiteKey: cfg.turnstileSiteKey, apiUrl: cfg.apiUrl } };
  return `<script type="application/json" id="${SITE_PATHS.dataScriptId}">${jsonForScript(data)}</script>`;
}

/** Replaces both markers (split/join: no `$` replacement patterns from user text). */
function renderPage(template: string, head: string, page: PageData, cfg: PageConfig): string {
  return template
    .split(SITE_PATHS.templateHeadMarker).join(head)
    .split(SITE_PATHS.templateDataMarker).join(renderDataScript(page, cfg));
}

export function renderProfilePage(template: string, profile: PublicProfile, cfg: PageConfig): string {
  return renderPage(template, renderHead(profile, cfg), { profile }, cfg);
}

export function renderTeamPage(template: string, team: PublicTeam, cfg: PageConfig): string {
  const head = renderHead({
    slug: team.slug, name: team.name, title: '', city: team.city,
  }, cfg, `Separa tu cita en línea con el equipo de ${team.name} en ${team.city}.`);
  return renderPage(template, head, { team }, cfg);
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
  const [services, teamOwnerId] = await Promise.all([listServices(proId, true), teamOwnerFor(proId)]);
  const team = teamOwnerId ? await getTeamItem(teamOwnerId, true) : undefined;
  const publicProfile = { ...toPublicProfile(profile, services), ...(team ? { team: { name: team.name, slug: team.slug } } : {}) };
  const html = renderProfilePage(template, publicProfile, pageConfig());
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

/** The owner of the team a professional belongs to (themselves when they own one), or undefined. */
export async function teamOwnerFor(proId: string): Promise<string | undefined> {
  const ownerId = await ownerIdOf(proId);
  if (ownerId) return ownerId;
  return (await getTeamItem(proId, true)) ? proId : undefined;
}

/** (Re)generates the team page `/<teamSlug>`: every member's public profile and services. */
export async function publishTeam(ownerId: string): Promise<PublishOutcome> {
  const team = await getTeamItem(ownerId, true);
  if (!team) return 'no_profile';
  const template = await loadTemplate();
  if (!template) {
    log.warn('booking template missing; team page not generated', { ownerId, key: SITE_PATHS.bookingTemplate });
    return 'no_template';
  }
  const ids = [ownerId, ...team.memberIds];
  const loaded = await Promise.all(ids.map(async (id): Promise<PublicProfile | null> => {
    const [profile, services] = await Promise.all([getProfile(id, true), listServices(id, true)]);
    return profile ? { ...toPublicProfile(profile, services), team: { name: team.name, slug: team.slug } } : null;
  }));
  const owner = loaded[0];
  if (!owner) return 'no_profile';
  // Clients only see professionals they can book (a new member has no services yet).
  const members = loaded.filter((m): m is PublicProfile => m !== null && m.services.length > 0);
  const publicTeam: PublicTeam = {
    slug: team.slug, name: team.name, city: owner.city, neighborhood: owner.neighborhood, address: owner.address,
    phone: owner.phone, initials: initials(team.name), members,
  };
  await s3.send(new PutObjectCommand({
    Bucket: env.siteBucket(),
    Key: pageKey(team.slug),
    Body: renderTeamPage(template, publicTeam, pageConfig()),
    ContentType: 'text/html; charset=utf-8',
    CacheControl: 'public, max-age=0, s-maxage=60',
  }));
  await invalidate(pagePaths(team.slug));
  log.info('team page published', { ownerId, slug: team.slug });
  return 'published';
}

/** Removes a page (slug changed or profile deleted) and purges it from the CDN. */
export async function unpublishSlug(slug: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: env.siteBucket(), Key: pageKey(slug) }));
  await invalidate(pagePaths(slug));
  log.info('profile page removed', { slug });
}
