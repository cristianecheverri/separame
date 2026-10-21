/**
 * Public link slugs: separame.app/<slug>. Reserved words cover every path the
 * site, the panel and CloudFront use, so a professional can never shadow them.
 */

export const SLUG_MIN = 3;
export const SLUG_MAX = 40;

export const RESERVED_SLUGS = new Set([
  'api', 'app', 'admin', 'dev', 'www', 'c', 'b', 'w', 'r', 'assets', 'static', 'public', 'templates', '_templates',
  'login', 'ingresar', 'registro', 'cuenta', 'panel', 'config', 'soporte', 'ayuda', 'precios', 'planes',
  'terminos', 'privacidad', 'politica-de-privacidad', 'legal', 'privacy', 'terms', 'separame', 'mail', 'noreply', 'no-disponible',
  'index', '404', 'favicon', 'robots', 'sitemap', 'manifest', 'sw', 'blog', 'status',
]);

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** "Dra. Laura Pérez" → "dra-laura-perez". */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '');
}

export type SlugProblem = 'too_short' | 'too_long' | 'invalid' | 'reserved';

export function slugProblem(slug: string): SlugProblem | null {
  if (slug.length < SLUG_MIN) return 'too_short';
  if (slug.length > SLUG_MAX) return 'too_long';
  if (!SLUG_RE.test(slug) || slug.includes('--')) return 'invalid';
  if (RESERVED_SLUGS.has(slug)) return 'reserved';
  return null;
}

export const isValidSlug = (slug: string) => slugProblem(slug) === null;
