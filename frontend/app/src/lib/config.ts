import { REGION, SITE_PATHS } from '@shared/infra';

/** Runtime config written by CDK to /app/config.json (one build serves every stage). */
export interface AppConfig {
  apiUrl: string;
  userPoolId: string;
  userPoolClientId: string;
  region: string;
  stage: string;
  siteUrl: string;
}

let current: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!current) throw new Error('Config not loaded');
  return current;
}

export function setConfig(config: AppConfig): void {
  current = config;
}

function fromEnv(): AppConfig | null {
  const env = import.meta.env;
  if (!env.VITE_API_URL || !env.VITE_USER_POOL_CLIENT_ID) return null;
  return {
    apiUrl: env.VITE_API_URL,
    userPoolId: env.VITE_USER_POOL_ID ?? '',
    userPoolClientId: env.VITE_USER_POOL_CLIENT_ID,
    region: env.VITE_AWS_REGION ?? REGION,
    stage: env.VITE_STAGE ?? 'dev',
    siteUrl: env.VITE_SITE_URL ?? 'https://dev.separame.app',
  };
}

function isConfig(value: unknown): value is AppConfig {
  const v = value as Partial<AppConfig> | null;
  return !!v && typeof v.apiUrl === 'string' && typeof v.userPoolClientId === 'string';
}

/** Local dev reads VITE_* env vars; deployed builds fetch /app/config.json. */
export async function loadConfig(): Promise<AppConfig> {
  const local = import.meta.env.DEV ? fromEnv() : null;
  if (local) {
    current = local;
    return local;
  }
  const res = await fetch(SITE_PATHS.appConfig, { cache: 'no-store' });
  if (!res.ok) throw new Error(`config.json ${res.status}`);
  const json: unknown = await res.json();
  if (!isConfig(json)) throw new Error('config.json is invalid');
  current = { ...json, apiUrl: json.apiUrl.replace(/\/$/, ''), region: json.region || REGION };
  return current;
}
