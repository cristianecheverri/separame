/**
 * Runtime inputs of the page: the JSON the backend embeds in every profile
 * page (`<script type="application/json" id="separame-data">`: `{ profile }`
 * on a professional's page, `{ team }` on a team page), the slug or manage
 * token from the URL, and the API client to use.
 */
import { apiBaseFor, type PublicProfile, type PublicTeam } from '@shared/api';
import { SITE_PATHS, TURNSTILE_TEST_KEYS } from '@shared/infra';
import { createHttpApi, type ApiClient } from './api';

export interface SiteConfig {
  turnstileSiteKey?: string;
  apiUrl?: string;
}

export interface EmbeddedData {
  profile: PublicProfile | null;
  /** Team plan: the consultorio page (/<teamSlug>) embeds this instead of `profile`. */
  team: PublicTeam | null;
  config: SiteConfig;
}

const NO_DATA: EmbeddedData = { profile: null, team: null, config: {} };

export function readEmbeddedData(doc: Document = document): EmbeddedData {
  const node = doc.getElementById(SITE_PATHS.dataScriptId);
  if (!node?.textContent) return NO_DATA;
  try {
    const data = JSON.parse(node.textContent) as Partial<EmbeddedData>;
    const team = data.team && Array.isArray(data.team.members) ? data.team : null;
    return { profile: team ? null : (data.profile ?? null), team, config: data.config ?? {} };
  } catch {
    return NO_DATA;
  }
}

/**
 * Dev mock: there is no public team endpoint (the data only lives in the
 * generated page), so the mock provides the embedded team for its slug.
 */
export async function withMockPage(data: EmbeddedData, slug: string): Promise<EmbeddedData> {
  if (!import.meta.env.DEV || !isMockMode() || data.profile || data.team) return data;
  const { mockTeamFor } = await import('../mock/fixtures');
  return { ...data, team: mockTeamFor(slug) };
}

/** `/dra-laura-perez` → "dra-laura-perez"; `?slug=` wins (local dev). */
export function slugFromLocation(loc: Pick<Location, 'pathname' | 'search'> = location): string {
  const fromQuery = new URLSearchParams(loc.search).get('slug');
  if (fromQuery) return fromQuery;
  return decodeURIComponent(loc.pathname.split('/').filter(Boolean)[0] ?? '');
}

function tokenAfter(prefix: string, pathname: string): string | null {
  if (!pathname.startsWith(prefix)) return null;
  const token = pathname.slice(prefix.length).split('/')[0];
  return token ? decodeURIComponent(token) : null;
}

/** `/c/<token>` → token. */
export function manageTokenFromLocation(loc: Pick<Location, 'pathname'> = location): string | null {
  return tokenAfter(SITE_PATHS.manage, loc.pathname);
}

/** `/w/<token>` → token (leave the waitlist). */
export function waitlistTokenFromLocation(loc: Pick<Location, 'pathname'> = location): string | null {
  return tokenAfter(SITE_PATHS.waitlistLeave, loc.pathname);
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
