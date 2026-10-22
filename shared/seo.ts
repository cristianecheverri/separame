import { SITE_PATHS } from './infra';
import { REFERRAL_PATH } from './referrals';

/**
 * Crawler files of the site. Only prod is indexable: dev answers every request
 * with `X-Robots-Tag: noindex` (SiteStack) and its robots.txt names no sitemap.
 *
 *  - robots.txt  static per stage, uploaded by FrontendDeployStack.
 *  - sitemap.xml the landing, the legal pages and the profile pages that can
 *                take bookings; re-rendered by the 10-minute job
 *                (backend/services/sitemap.ts).
 */

export const ROBOTS_KEY = 'robots.txt';
export const SITEMAP_KEY = 'sitemap.xml';

/** Pages listed in every sitemap besides the profile pages. */
export const SITEMAP_STATIC_PATHS = ['/', '/privacy', '/terms'] as const;

/**
 * Never crawled: token links from emails (/c/, /w/), referral redirects and
 * the page templates. The panel (/app/) stays crawlable so its `noindex` is seen.
 */
export const ROBOTS_DISALLOW = [
  SITE_PATHS.manage,
  SITE_PATHS.waitlistLeave,
  REFERRAL_PATH,
  '/_templates/', // SITE_PATHS.bookingTemplate and landingTemplate
] as const;

export interface RobotsOptions {
  siteUrl: string;
  /** prod only: dev must never show up in search results. */
  indexable: boolean;
}

export function robotsTxt({ siteUrl, indexable }: RobotsOptions): string {
  const lines = [
    ...(indexable ? [] : ['# Not indexable: every response carries X-Robots-Tag: noindex.']),
    'User-agent: *',
    ...ROBOTS_DISALLOW.map((path) => `Disallow: ${path}`),
    ...(indexable ? ['', `Sitemap: ${trimSlash(siteUrl)}/${SITEMAP_KEY}`] : []),
  ];
  return `${lines.join('\n')}\n`;
}

const trimSlash = (url: string) => url.replace(/\/$/, '');

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Deterministic (sorted, deduplicated) so an unchanged sitemap hashes the same. */
export function renderSitemap(siteUrl: string, slugs: readonly string[]): string {
  const base = trimSlash(siteUrl);
  const profiles = [...new Set(slugs.filter(Boolean))].sort().map((slug) => `/${slug}`);
  const urls = [...SITEMAP_STATIC_PATHS, ...profiles].map((path) => `<url><loc>${escapeXml(base + path)}</loc></url>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}
