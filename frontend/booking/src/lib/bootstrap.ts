/**
 * Runtime inputs of the page: the JSON the backend embeds in every profile
 * page (`<script type="application/json" id="separame-data">`), the slug or
 * manage token from the URL, and the API client to use.
 */
import { apiBaseFor, type PublicProfile } from '@shared/api';
import { SITE_PATHS, TURNSTILE_TEST_KEYS } from '@shared/infra';
import { createHttpApi, type ApiClient } from './api';

export interface SiteConfig {
  turnstileSiteKey?: string;
  apiUrl?: string;
}

export interface EmbeddedData {
  profile: PublicProfile | null;
  config: SiteConfig;
}

export function readEmbeddedData(doc: Document = document): EmbeddedData {
  const node = doc.getElementById(SITE_PATHS.dataScriptId);
  if (!node?.textContent) return { profile: null, config: {} };
  try {
    const data = JSON.parse(node.textContent) as Partial<EmbeddedData>;
    return { profile: data.profile ?? null, config: data.config ?? {} };
  } catch {
    return { profile: null, config: {} };
  }
}

/** `/dra-laura-perez` → "dra-laura-perez"; `?slug=` wins (local dev). */
export function slugFromLocation(loc: Pick<Location, 'pathname' | 'search'> = location): string {
  const fromQuery = new URLSearchParams(loc.search).get('slug');
  if (fromQuery) return fromQuery;
  return decodeURIComponent(loc.pathname.split('/').filter(Boolean)[0] ?? '');
}

/** `/c/<token>` → token. */
export function manageTokenFromLocation(loc: Pick<Location, 'pathname'> = location): string | null {
  if (!loc.pathname.startsWith(SITE_PATHS.manage)) return null;
  const token = loc.pathname.slice(SITE_PATHS.manage.length).split('/')[0];
  return token ? decodeURIComponent(token) : null;
}

export function isMockMode(): boolean {
  if (!import.meta.env.DEV) return false;
  return import.meta.env.VITE_MOCK === '1' || new URLSearchParams(location.search).has('mock');
}

export interface Runtime {
  api: ApiClient;
  turnstileSiteKey: string | null;
}

export async function createRuntime(config: SiteConfig): Promise<Runtime> {
  // `import.meta.env.DEV` is a literal `false` in production builds, so the
  // mock module and its fixtures are dropped from the bundle entirely.
  if (import.meta.env.DEV && isMockMode()) {
    const { createMockApi } = await import('../mock/mockApi');
    return { api: createMockApi(new URLSearchParams(location.search)), turnstileSiteKey: null };
  }
  const base = apiBaseFor(location.hostname, import.meta.env.VITE_API_URL ?? config.apiUrl);
  const siteKey =
    config.turnstileSiteKey ?? import.meta.env.VITE_TURNSTILE_SITE_KEY ?? (import.meta.env.DEV ? TURNSTILE_TEST_KEYS.siteKey : null);
  return { api: createHttpApi(base), turnstileSiteKey: siteKey };
}
